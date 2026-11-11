// ==========================================================
// NexaMatch — app principal (Firebase + tempo real)
//
// Tudo que aparece na tela vem do Firestore e se atualiza sozinho
// (onSnapshot): novos perfis, curtidas, matches, mensagens e avisos
// chegam sem precisar apertar F5.
//
//   users/{uid}                perfil público
//   accounts/{uid}             dados privados (filtro, último aviso lido)
//   likes/{de}_{para}          curtidas
//   matches/{uidA}_{uidB}      matches (+ subcoleção messages) — conversa grátis
//   chats/{uidA}_{uidB}        conversa sem match, homem ↔ mulher (+ messages)
//   wallets/{uid}              saldo do homem para mensagens pagas
// ==========================================================
import { Auth } from './auth.js';
import {
    auth, db,
    doc, collection, query, where, orderBy, limitToLast,
    getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
    writeBatch, runTransaction, serverTimestamp, increment, deleteUser
} from './firebase.js';

// Gêneros disponíveis (para o filtro do Descobrir)
const GENDERS = [
    { id: 'mulher', label: 'Mulheres' },
    { id: 'homem', label: 'Homens' },
    { id: 'outro', label: 'Não-binário e outros' }
];
const ALL_GENDER_IDS = GENDERS.map(g => g.id);

// ---------- Mensagem paga ----------
// Homem → mulher que ainda NÃO o curtiu: ele paga por mensagem (texto ou foto) e o valor vai para ela.
// Se ela curtiu ele, ou se houve match, a conversa é grátis.
const MESSAGE_PRICE_CENTS = 200;          // R$ 2,00 por mensagem (mude aqui)
const TOPUP_OPTIONS = [1000, 2000, 5000]; // valores de recarga
const PAYMENTS_TEST_MODE = true;          // true = saldo de mentira, sem dinheiro real
const formatMoney = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- Quem está logado ----------
// Sem login, vai para a tela de entrada e o resto do arquivo nem chega a rodar
const currentUser = await Auth.requireAuth('login.html');
const myId = currentUser.uid;
const userRef = doc(db, 'users', myId);
const accountRef = doc(db, 'accounts', myId);

// Escapa texto para que o que as pessoas digitam nunca vire HTML
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Timestamp do Firestore (ou número) em milissegundos
function toMillis(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    return typeof value.toMillis === 'function' ? value.toMillis() : 0;
}

function normalizeInterestedIn(list) {
    const valid = Array.isArray(list) ? list.filter(g => ALL_GENDER_IDS.includes(g)) : [];
    // sem escolha salva: mostra todos os gêneros
    return valid.length ? valid : [...ALL_GENDER_IDS];
}

// ---------- Meu perfil (carregado do Firestore) ----------
let myGender = 'outro';
let notifSeenAt = 0; // até quando os avisos já foram vistos
let matchesSeenAt = 0; // até quando os matches já foram vistos (zera o contador do menu)
let hiddenLikes = {};  // id da pessoa -> quando você desfez o match (esconde o aviso "curtiu você" antigo)

const readHiddenLikes = raw => {
    const out = {};
    if (raw && typeof raw === 'object') {
        Object.entries(raw).forEach(([id, value]) => {
            const time = Number(value);
            if (time > 0) out[id] = time;
        });
    }
    return out;
};
let myProfile = { name: '', age: '', location: '', bio: '', interests: [], photo: '', interestedIn: [...ALL_GENDER_IDS] };

try {
    const [userSnap, accountSnap] = await Promise.all([getDoc(userRef), getDoc(accountRef)]);
    const publicData = userSnap.exists() ? userSnap.data() : {};
    const privateData = accountSnap.exists() ? accountSnap.data() : {};

    myGender = ALL_GENDER_IDS.includes(publicData.gender) ? publicData.gender : 'outro';
    notifSeenAt = toMillis(privateData.notifSeenAt);
    matchesSeenAt = toMillis(privateData.matchesSeenAt);
    hiddenLikes = readHiddenLikes(privateData.hiddenLikes);
    myProfile = {
        name: String(publicData.name || currentUser.name || '').slice(0, 40),
        age: publicData.age ? Number(publicData.age) : '',
        location: String(publicData.location || ''),
        bio: String(publicData.bio || ''),
        interests: Array.isArray(publicData.interests) ? publicData.interests.map(String).slice(0, 8) : [],
        photo: String(publicData.photo || ''),
        interestedIn: normalizeInterestedIn(privateData.interestedIn)
    };

    // Idade vem da data de nascimento informada no cadastro
    if (!myProfile.age && privateData.birthDate) {
        const accountAge = Auth.ageFromBirthDate(privateData.birthDate);
        if (accountAge >= 18 && accountAge <= 99) myProfile.age = accountAge;
    }
} catch (error) {
    console.error('Não consegui carregar seu perfil:', error);
    myProfile.name = String(currentUser.name || '').slice(0, 40);
}

let draftInterests = [...myProfile.interests]; // interesses em edição
let draftPhoto = myProfile.photo;              // foto em edição

// ---------- Estado em tempo real ----------
let profiles = [];                  // outras pessoas cadastradas
const likedProfiles = new Set();    // quem você curtiu
const incomingLikes = new Map();    // quem curtiu você -> quando
let matchByUser = new Map();        // id da pessoa -> { id, createdAt, lastMessage, unread }
let chatByUser = new Map();         // conversas sem match (chats/): mesmo formato
let walletCents = 0;                // meu saldo (homem)
let earnedCents = 0;                // quanto ganhei com mensagens pagas (mulher)
let paidMessages = 0;               // quantas mensagens pagas recebi
let currentThread = [];             // mensagens da conversa aberta
let threadUnsub = null;
let notifBaseline = null;           // destaca o que é novo enquanto a tela de avisos está aberta
const unsubscribers = [];
const loaded = { users: false, likes: false, incoming: false, matches: false, chats: false, wallet: false };

const grid = document.getElementById('profiles-grid');
const detail = document.getElementById('profile-detail');
const matchesContent = document.getElementById('matches-content');
const matchesBadge = document.getElementById('matches-badge');
const messagesContent = document.getElementById('messages-content');
const messagesBadge = document.getElementById('messages-badge');
const notificationsContent = document.getElementById('notifications-content');
const notificationsBadge = document.getElementById('notifications-badge');
const toast = document.getElementById('toast');
let currentProfileId = null; // perfil aberto na página de detalhe
let previousPage = 'descobrir'; // de onde a pessoa veio (para o botão Voltar)
let toastTimer = null;
let currentChatId = null; // conversa aberta em Mensagens

const findProfile = id => profiles.find(p => p.id === id);
// A pessoa curte você
const likesYouNow = profile => Boolean(profile && incomingLikes.has(profile.id));
// Match = as duas curtidas existem e o documento do match já foi criado
const isMatch = id => likedProfiles.has(id) && incomingLikes.has(id) && matchByUser.has(id);
const getMatches = () => [...matchByUser.keys()].filter(isMatch).map(findProfile).filter(Boolean);
const getPending = () => [...likedProfiles].filter(id => !incomingLikes.has(id)).map(findProfile).filter(Boolean);

// ---------- Quem pode conversar e quem paga ----------
// Só existe regra de pagamento entre um homem e uma mulher
function chatPair(otherId) {
    const other = findProfile(otherId);
    if (!other) return null;
    if (myGender === 'homem' && other.gender === 'mulher') return { manId: myId, womanId: otherId };
    if (myGender === 'mulher' && other.gender === 'homem') return { manId: otherId, womanId: myId };
    return null;
}

// O homem paga quando NÃO há match e a mulher ainda não o curtiu
function manPays(otherId) {
    if (!chatPair(otherId) || isMatch(otherId)) return false;
    return myGender === 'homem' ? !incomingLikes.has(otherId) : !likedProfiles.has(otherId);
}

// Quanto eu pago para falar com essa pessoa agora (só o homem paga)
const priceFor = otherId => (myGender === 'homem' && manPays(otherId) ? MESSAGE_PRICE_CENTS : 0);

// Onde a conversa está: matches/ (grátis) ou chats/
function conversationFor(otherId) {
    if (isMatch(otherId)) return { ...matchByUser.get(otherId), col: 'matches' };
    const chat = chatByUser.get(otherId);
    return chat ? { ...chat, col: 'chats' } : null;
}

function canChat(otherId) {
    if (isMatch(otherId)) return true;
    if (!chatPair(otherId)) return false;
    if (chatByUser.has(otherId)) return true;
    // homem pode puxar conversa (paga ou grátis); mulher só com quem ela curtiu
    return myGender === 'homem' || likedProfiles.has(otherId);
}

// Conversas da lista: matches + conversas sem match (+ a que está aberta e ainda não tem mensagem)
function getConversations() {
    const ids = new Set(getMatches().map(profile => profile.id));
    chatByUser.forEach((chat, id) => { if (findProfile(id) && canChat(id)) ids.add(id); });
    if (currentChatId && findProfile(currentChatId) && canChat(currentChatId)) ids.add(currentChatId);
    return [...ids].map(findProfile).filter(Boolean);
}

// ---------- Perfis das outras pessoas ----------
// Foto: só aceita imagem embutida ou link https
const safePhoto = url =>
    /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(url) || /^https:\/\/[^\s"'<>]+$/.test(url)
        ? url
        : '';

// Sem foto: fundo em gradiente (cor muda conforme o nome) com a inicial num círculo
const PLACEHOLDER_COLORS = [
    ['#1d6f86', '#5b3ccc'],
    ['#5b3ccc', '#b0388f'],
    ['#0f7f9c', '#2b4dc4'],
    ['#6d3ad1', '#d1457f']
];

function placeholderPhoto(name) {
    const text = String(name).trim();
    const initial = escapeHtml((text[0] || '?').toUpperCase());
    const hash = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const [from, to] = PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length];

    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">'
        + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`
        + '<radialGradient id="l" cx="0.2" cy="0.1" r="0.8"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
        + '<rect width="400" height="400" fill="url(#g)"/>'
        + '<rect width="400" height="400" fill="url(#l)"/>'
        + '<circle cx="350" cy="380" r="170" fill="#fff" fill-opacity="0.06"/>'
        + '<circle cx="200" cy="165" r="88" fill="#fff" fill-opacity="0.14" stroke="#fff" stroke-opacity="0.4" stroke-width="3"/>'
        + `<text x="200" y="204" font-size="108" font-family="Arial, sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle">${initial}</text>`
        + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Tudo que vem de outras pessoas é escapado aqui, uma vez só,
// para poder entrar com segurança nos modelos de HTML da tela.
function normalizeProfile(id, data) {
    const name = String(data.name || 'Sem nome').slice(0, 40);
    return {
        id,
        gender: ALL_GENDER_IDS.includes(data.gender) ? data.gender : 'outro',
        name: escapeHtml(name),
        age: Number(data.age) || '',
        location: escapeHtml(String(data.location || '').slice(0, 60) || 'Local não informado'),
        bio: escapeHtml(String(data.bio || '').slice(0, 200) || 'Ainda sem bio.'),
        interests: Array.isArray(data.interests)
            ? data.interests.slice(0, 8).map(item => escapeHtml(String(item).slice(0, 20)))
            : [],
        photo: escapeHtml(safePhoto(String(data.photo || '')) || placeholderPhoto(name))
    };
}

// ==========================================================
// Tempo real — escuta o Firestore e atualiza a tela sozinha
// ==========================================================
let refreshQueued = false;

// Junta várias mudanças seguidas em uma única atualização da tela
function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(() => {
        refreshQueued = false;
        refreshAll();
    }, 30);
}

let listenErrorShown = false;

function onListenError(error) {
    console.error('Firebase:', error);
    if (listenErrorShown) return;
    listenErrorShown = true;
    showToast(error && error.code === 'permission-denied'
        ? 'O Firebase recusou a leitura. Publique as regras do arquivo firestore.rules.'
        : 'Perdi a conexão com o Firebase. Confira a internet.');
}

const pairId = (a, b) => [a, b].sort().join('_');
const creatingMatch = new Set();

// Quando as duas pessoas se curtiram, cria o documento do match (uma vez só, mesmo
// que os dois aparelhos tentem ao mesmo tempo)
async function createMatch(otherId) {
    if (creatingMatch.has(otherId)) return;
    creatingMatch.add(otherId);

    const matchRef = doc(db, 'matches', pairId(myId, otherId));
    try {
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(matchRef);
            if (snapshot.exists()) return;
            transaction.set(matchRef, {
                users: [myId, otherId].sort(),
                createdAt: serverTimestamp(),
                lastMessage: null,
                unread: { [myId]: 0, [otherId]: 0 }
            });
        });
    } catch (error) {
        console.warn('Não consegui criar o match agora:', error && error.code);
    } finally {
        creatingMatch.delete(otherId);
    }
}

function ensureMatches() {
    if (!loaded.likes || !loaded.incoming || !loaded.matches) return;
    likedProfiles.forEach(id => {
        if (incomingLikes.has(id) && !matchByUser.has(id)) createMatch(id);
    });
}

// Avisos rápidos para o que aconteceu enquanto você usava o app
function announceMatchChanges(previous, next) {
    next.forEach((match, otherId) => {
        const profile = findProfile(otherId);
        if (!profile) return;

        if (!previous.has(otherId)) {
            showToast(`Deu match com ${profile.name}!`, 'Ver matches', goToMatches);
            return;
        }

        const before = previous.get(otherId).lastMessage;
        const last = match.lastMessage;
        const isNew = last && last.from === 'them' && (!before || before.time !== last.time);
        if (isNew && !isChatOnScreen(otherId)) {
            showToast(`${profile.name} enviou uma mensagem.`, 'Ver conversa', () => goToMessages(otherId));
        }
    });
}

// Mesmo aviso para as conversas sem match
function announceChatChanges(previous, next) {
    next.forEach((chat, otherId) => {
        const profile = findProfile(otherId);
        if (!profile || isMatch(otherId)) return;

        const before = previous.has(otherId) ? previous.get(otherId).lastMessage : null;
        const last = chat.lastMessage;
        const isNew = last && last.from === 'them' && (!before || before.time !== last.time);
        if (isNew && !isChatOnScreen(otherId)) {
            showToast(`${profile.name} enviou uma mensagem.`, 'Ver conversa', () => goToMessages(otherId));
        }
    });
}

let chatReadBlocked = false;

// Conversa aberta na tela: tudo que chega já conta como lido
function markCurrentChatRead() {
    if (chatReadBlocked || !currentChatId || !isChatOnScreen(currentChatId)) return;
    const conv = conversationFor(currentChatId);
    if (!conv || !conv.unread) return;

    updateDoc(doc(db, conv.col, conv.id), { [`unread.${myId}`]: 0 }).catch(error => {
        chatReadBlocked = true; // evita insistir em loop se o Firebase recusar
        console.warn('Não consegui marcar como lida:', error && error.code);
    });
}

function startRealtime() {
    // 1) Pessoas cadastradas (mural Descobrir)
    unsubscribers.push(onSnapshot(collection(db, 'users'), snapshot => {
        profiles = snapshot.docs
            .filter(d => d.id !== myId)
            .map(d => normalizeProfile(d.id, d.data({ serverTimestamps: 'estimate' })));
        loaded.users = true;
        scheduleRefresh();
    }, onListenError));

    // 2) Curtidas que eu enviei
    unsubscribers.push(onSnapshot(query(collection(db, 'likes'), where('from', '==', myId)), snapshot => {
        likedProfiles.clear();
        snapshot.docs.forEach(d => likedProfiles.add(d.data().to));
        loaded.likes = true;
        ensureMatches();
        scheduleRefresh();
    }, onListenError));

    // 3) Curtidas que eu recebi
    unsubscribers.push(onSnapshot(query(collection(db, 'likes'), where('to', '==', myId)), snapshot => {
        const next = new Map();
        snapshot.docs.forEach(d => {
            const data = d.data({ serverTimestamps: 'estimate' });
            next.set(data.from, toMillis(data.createdAt) || Date.now());
        });

        if (loaded.incoming) {
            next.forEach((time, id) => {
                if (incomingLikes.has(id) || likedProfiles.has(id)) return;
                const profile = findProfile(id);
                if (profile) showToast(`${profile.name} curtiu você.`, 'Ver aviso', goToNotifications);
            });
        }

        incomingLikes.clear();
        next.forEach((time, id) => incomingLikes.set(id, time));
        loaded.incoming = true;
        ensureMatches();
        scheduleRefresh();
    }, onListenError));

    // 4) Meus matches (com última mensagem e não lidas)
    unsubscribers.push(onSnapshot(query(collection(db, 'matches'), where('users', 'array-contains', myId)), snapshot => {
        const next = new Map();
        snapshot.docs.forEach(d => {
            const data = d.data({ serverTimestamps: 'estimate' });
            const otherId = (data.users || []).find(uid => uid !== myId);
            if (!otherId) return;

            const last = data.lastMessage;
            next.set(otherId, {
                id: d.id,
                createdAt: toMillis(data.createdAt) || Date.now(),
                lastMessage: last
                    ? { from: last.from === myId ? 'me' : 'them', text: String(last.text || ''), image: Boolean(last.image), time: toMillis(last.time) || Date.now() }
                    : null,
                unread: Number(data.unread && data.unread[myId]) || 0
            });
        });

        if (loaded.matches) announceMatchChanges(matchByUser, next);
        matchByUser = next;
        loaded.matches = true;
        ensureMatches();
        markCurrentChatRead();
        scheduleRefresh();
    }, onListenError));

    // 4b) Conversas sem match (homem ↔ mulher) e ganhos com mensagens pagas
    unsubscribers.push(onSnapshot(query(collection(db, 'chats'), where('users', 'array-contains', myId)), snapshot => {
        const next = new Map();
        let earned = 0;
        let paid = 0;

        snapshot.docs.forEach(d => {
            const data = d.data({ serverTimestamps: 'estimate' });
            const otherId = (data.users || []).find(uid => uid !== myId);
            if (!otherId) return;

            if (data.womanId === myId) {
                earned += Number(data.earnedCents) || 0;
                paid += Number(data.paidCount) || 0;
            }

            const last = data.lastMessage;
            next.set(otherId, {
                id: d.id,
                createdAt: toMillis(data.createdAt) || Date.now(),
                lastMessage: last
                    ? { from: last.from === myId ? 'me' : 'them', text: String(last.text || ''), image: Boolean(last.image), time: toMillis(last.time) || Date.now() }
                    : null,
                unread: Number(data.unread && data.unread[myId]) || 0
            });
        });

        if (loaded.chats) announceChatChanges(chatByUser, next);
        chatByUser = next;
        earnedCents = earned;
        paidMessages = paid;
        loaded.chats = true;
        markCurrentChatRead();
        scheduleRefresh();
    }, onListenError));

    // 4c) Meu saldo
    unsubscribers.push(onSnapshot(doc(db, 'wallets', myId), snapshot => {
        walletCents = snapshot.exists() ? Math.max(0, Number(snapshot.data().balanceCents) || 0) : 0;
        loaded.wallet = true;
        scheduleRefresh();
    }, onListenError));

    // 5) Dados privados (filtro de gênero e avisos já vistos, também entre aparelhos)
    unsubscribers.push(onSnapshot(accountRef, snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data({ serverTimestamps: 'estimate' });
        notifSeenAt = Math.max(notifSeenAt, toMillis(data.notifSeenAt));
        matchesSeenAt = Math.max(matchesSeenAt, toMillis(data.matchesSeenAt));
        Object.entries(readHiddenLikes(data.hiddenLikes)).forEach(([id, time]) => {
            hiddenLikes[id] = Math.max(hiddenLikes[id] || 0, time);
        });
        myProfile.interestedIn = normalizeInterestedIn(data.interestedIn);
        scheduleRefresh();
    }, onListenError));
}


// ---------- Mural (Descobrir) ----------
// Só aparecem os gêneros marcados em "Tenho interesse em" (Meu Perfil)
const visibleProfiles = () => profiles.filter(profile => myProfile.interestedIn.includes(profile.gender));

function updateDiscoverFilter() {
    const box = document.getElementById('discover-filter');
    if (!box) return;

    const all = myProfile.interestedIn.length === GENDERS.length;
    const chip = (label, on, action) =>
        `<button type="button" class="gender-chip ${on ? 'on' : ''}" aria-pressed="${on}" onclick="${action}">${label}</button>`;

    box.innerHTML = chip('Todos', all, 'selectAllGenders()') + GENDERS
        .map(g => chip(g.label, !all && myProfile.interestedIn.includes(g.id), `toggleDiscoverGender('${g.id}')`))
        .join('');
}

// Com "Todos" ativo, tocar em um gênero mostra só ele; depois dá para combinar
function toggleDiscoverGender(id) {
    const current = myProfile.interestedIn;
    let next;

    if (current.length === GENDERS.length) next = [id];
    else if (current.includes(id)) next = current.filter(g => g !== id);
    else next = [...current, id];

    setGenderFilter(next.length ? next : [...ALL_GENDER_IDS]);
}

function selectAllGenders() {
    setGenderFilter([...ALL_GENDER_IDS]);
}

function setGenderFilter(list) {
    myProfile.interestedIn = list;
    renderProfiles();
    // o filtro é privado e vale em todos os seus aparelhos
    setDoc(accountRef, { interestedIn: list }, { merge: true }).catch(error => console.error(error));
}

function renderProfiles() {
    if (!grid) return;
    grid.innerHTML = '';
    updateDiscoverFilter();

    if (!loaded.users) {
        grid.innerHTML = `
            <div class="empty-state">
                <h2>Carregando...</h2>
                <p>Buscando pessoas para você.</p>
            </div>
        `;
        return;
    }

    if (!profiles.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <h2>Ainda não tem mais ninguém por aqui</h2>
                <p>Quando outras pessoas criarem conta, elas aparecem aqui sozinhas, sem precisar atualizar a página.</p>
            </div>
        `;
        return;
    }

    const visible = visibleProfiles();

    if (!visible.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <h2>Nenhum perfil para esse filtro</h2>
                <p>Ainda não há ninguém disponível para esse filtro.</p>
                <button class="btn-primary" onclick="selectAllGenders()">Mostrar todos</button>
            </div>
        `;
        return;
    }

    visible.forEach(profile => {
        const isLiked = likedProfiles.has(profile.id);

        const card = document.createElement('div');
        card.className = 'card';

        card.innerHTML = `
            <div class="card-image-wrapper" onclick="viewProfile('${profile.id}')">
                <img src="${profile.photo}" alt="Foto de ${profile.name}">
                ${isMatch(profile.id) ? '<div class="match-badge">Match</div>' : ''}
                <div class="card-head">
                    <h2>${profile.name} <span>${profile.age}</span></h2>
                    <div class="location-tag">${profile.location}</div>
                </div>
            </div>
            <div class="card-info">
                <p>${profile.bio}</p>
                <div class="actions">
                    <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver perfil</button>
                    <button class="btn-like ${isLiked ? 'liked' : ''}" onclick="handleLike('${profile.id}')" aria-label="Curtir ${profile.name}">
                        ${isLiked ? '✔' : '❤'}
                    </button>
                </div>
            </div>
        `;

        grid.appendChild(card);
    });
}

// ---------- Meus Matches ----------
function renderMatches() {
    if (!matchesContent) return;

    const matches = getMatches();
    const pending = getPending();

    // Nada ainda: convite para curtir
    if (!matches.length && !pending.length) {
        matchesContent.innerHTML = `
            <div class="empty-state">
                <h2>Nenhum match por enquanto</h2>
                <p>Curte perfis no Descobrir. Quando a pessoa também curtir você, o match aparece aqui.</p>
                <button class="btn-primary" onclick="backToDiscover()">Descobrir pessoas</button>
            </div>
        `;
        return;
    }

    let html = '';

    // Matches
    html += `<section class="matches-section">
        <h2 class="section-title">Seus matches <span class="count">${matches.length}</span></h2>`;

    if (matches.length) {
        html += '<div class="grid">' + matches.map(profile => `
            <div class="card">
                <div class="card-image-wrapper" onclick="viewProfile('${profile.id}')">
                    <img src="${profile.photo}" alt="Foto de ${profile.name}">
                    <div class="match-badge">Match</div>
                    <div class="location-tag">${profile.location}</div>
                </div>
                <div class="card-info">
                    <h2>${profile.name} <span>${profile.age}</span></h2>
                    <p>${profile.bio}</p>
                    <div class="actions actions-wrap">
                        <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver perfil</button>
                        <button class="btn-msg" onclick="goToMessages('${profile.id}')">Mensagem</button>
                        <button class="btn-ghost" onclick="removeLike('${profile.id}')">Desfazer match</button>
                    </div>
                </div>
            </div>
        `).join('') + '</div>';
    } else {
        html += '<p class="section-hint">Ainda sem matches. Quando alguém que você curtiu curtir você de volta, aparece aqui.</p>';
    }
    html += '</section>';

    // Curtidas aguardando resposta
    if (pending.length) {
        html += `<section class="matches-section">
            <h2 class="section-title">Aguardando resposta <span class="count">${pending.length}</span></h2>
            <div class="pending-list">` + pending.map(profile => `
                <div class="pending-item">
                    <img src="${profile.photo}" alt="Foto de ${profile.name}" onclick="viewProfile('${profile.id}')">
                    <div class="pending-info">
                        <strong>${profile.name}, ${profile.age}</strong>
                        <span>${profile.location}</span>
                    </div>
                    <button class="btn-ghost" onclick="removeLike('${profile.id}')">Cancelar curtida</button>
                </div>
            `).join('') + `</div>
        </section>`;
    }

    matchesContent.innerHTML = html;
}

// Matches que você ainda não viu (chegaram depois da última visita à aba Matches)
const matchTime = profile => (matchByUser.get(profile.id) || {}).createdAt || 0;
const unseenMatches = () => getMatches().filter(profile => matchTime(profile) > matchesSeenAt);

// Contador no menu: só mostra o que é novo, e some ao abrir a aba Matches
function updateBadge() {
    if (!matchesBadge) return;
    const total = unseenMatches().length;
    matchesBadge.textContent = total > 0 ? total : '';
}

// Marca todos os matches atuais como vistos (também entre aparelhos)
function markMatchesSeen() {
    const unseen = unseenMatches();
    if (!unseen.length) return;

    matchesSeenAt = Math.max(matchesSeenAt, ...unseen.map(matchTime));
    setDoc(accountRef, { matchesSeenAt }, { merge: true }).catch(error => console.warn(error));
    updateBadge();
}

// Atualiza tudo que depende das curtidas
function refreshAll() {
    renderProfiles();
    renderMatches();
    renderMessages();
    renderNotifications();
    updateBadge();
    updateNotificationsBadge();
    updateProfileStats();
    if (currentProfileId) renderProfileDetail(currentProfileId);
    if (isPageVisible('notificacoes')) markAllNotificationsRead();
    if (isPageVisible('matches')) markMatchesSeen();
}

// ---------- Aviso rápido ----------
function showToast(message, actionLabel, action) {
    if (!toast) return;
    toast.innerHTML = `<span>${message}</span>`;

    if (actionLabel && action) {
        const button = document.createElement('button');
        button.textContent = actionLabel;
        button.onclick = () => {
            hideToast();
            action();
        };
        toast.appendChild(button);
    }

    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 4500);
}

function hideToast() {
    if (toast) toast.classList.remove('show');
}

// ---------- Curtir / desfazer ----------
const likingNow = new Set();

async function handleLike(id) {
    if (likedProfiles.has(id) || likingNow.has(id)) return;

    const profile = findProfile(id);
    if (!profile) return;

    likingNow.add(id);
    try {
        await setDoc(doc(db, 'likes', `${myId}_${id}`), { from: myId, to: id, createdAt: serverTimestamp() });
    } catch (error) {
        console.error(error);
        showToast('Não consegui curtir agora. Tente de novo.');
        return;
    } finally {
        likingNow.delete(id);
    }

    // Se a pessoa já curtia você, o match nasce sozinho (ensureMatches) e o aviso aparece junto.
    if (!incomingLikes.has(id)) {
        showToast(`Você curtiu ${profile.name}. Agora é esperar a resposta.`);
    }
}

// Apaga as mensagens e depois a própria conversa (match ou conversa paga)
async function deleteConversationData(col, id) {
    const messages = await getDocs(collection(db, col, id, 'messages'));

    for (let i = 0; i < messages.docs.length; i += 400) {
        const batch = writeBatch(db);
        messages.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

    await deleteDoc(doc(db, col, id));
}

const deleteMatchData = matchId => deleteConversationData('matches', matchId);

// Nomes já vêm escapados para HTML; a janela de confirmação escapa de novo, então desfaz aqui
const decodeHtml = html => {
    const box = document.createElement('textarea');
    box.innerHTML = html;
    return box.value;
};

// Depois de desfazer o match, a curtida antiga da pessoa não volta como aviso
function hideIncomingLike(id) {
    hiddenLikes[id] = Date.now();
    setDoc(accountRef, { hiddenLikes: { [id]: hiddenLikes[id] } }, { merge: true }).catch(error => console.warn(error));
    scheduleRefresh();
}

const removingNow = new Set();

async function removeLike(id) {
    if (!likedProfiles.has(id) || removingNow.has(id)) return;

    const profile = findProfile(id);

    // Desfazer um match apaga a conversa dos dois lados, então pede confirmação antes
    if (matchByUser.has(id)) {
        const name = profile ? decodeHtml(profile.name) : 'essa pessoa';
        const ok = await askConfirm({
            title: `Desfazer match com ${name}?`,
            message: `Todas as mensagens e fotos dessa conversa serão apagadas para você e para ${name}. Não dá para desfazer.`,
            confirmText: 'Desfazer match',
            cancelText: 'Manter match',
            danger: true
        });
        if (!ok) return;
    }

    // enquanto a janela estava aberta, algo pode ter mudado
    if (!likedProfiles.has(id) || removingNow.has(id)) return;

    const match = matchByUser.get(id);
    const hadIncomingLike = incomingLikes.has(id);

    // Sem match, sem conversa
    if (currentChatId === id) {
        stopThread();
        currentChatId = null;
    }

    removingNow.add(id);
    try {
        // Primeiro a curtida (assim o match não pode ser recriado), depois a conversa
        await deleteDoc(doc(db, 'likes', `${myId}_${id}`));
        if (match) await deleteMatchData(match.id);
    } catch (error) {
        console.error(error);
        showToast('Não consegui desfazer agora. Tente de novo.');
        return;
    } finally {
        removingNow.delete(id);
    }

    if (hadIncomingLike) hideIncomingLike(id);

    const who = profile ? profile.name : '';
    showToast(match
        ? (who ? `Match com ${who} desfeito.` : 'Match desfeito.')
        : (who ? `Curtida em ${who} desfeita.` : 'Curtida desfeita.'));
}


// ---------- Páginas ----------
function showPage(pageId) {
    if (pageId !== 'notificacoes') notifBaseline = null;
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    document.getElementById('page-' + pageId).style.display = 'block';
}

function setActiveNav(index) {
    document.querySelectorAll('nav a').forEach((link, i) => {
        link.classList.toggle('active', i === index);
    });
}

// Monta a página de perfil da pessoa
function renderProfileDetail(id) {
    const profile = findProfile(id);
    if (!profile || !detail) return;

    const isLiked = likedProfiles.has(id);
    const interests = profile.interests
        .map(item => `<span class="chip">${item}</span>`)
        .join('');

    detail.innerHTML = `
        <button class="btn-back" onclick="goBack()">Voltar</button>

        <div class="profile-layout">
            <div class="profile-photo">
                <img src="${profile.photo}" alt="Foto de ${profile.name}">
                <div class="location-tag">${profile.location}</div>
            </div>

            <div class="profile-panel">
                <h2 class="profile-name">${profile.name} <span>${profile.age}</span></h2>
                <p class="profile-location">${profile.location}</p>
                ${isMatch(id) ? '<p class="match-pill">Vocês deram match</p>' : ''}

                <div class="profile-section">
                    <h3>Sobre ${profile.name}</h3>
                    <p>${profile.bio}</p>
                </div>

                <div class="profile-section">
                    <h3>Interesses</h3>
                    <div class="chips">${interests}</div>
                </div>

                <div class="profile-actions">
                    <button class="btn-like btn-like-lg ${isLiked ? 'liked' : ''}" onclick="handleLike('${profile.id}')">
                        ${isLiked ? '✔' : '❤'}
                    </button>
                    ${canChat(id)
                        ? `<button class="btn-msg btn-msg-lg" onclick="goToMessages('${profile.id}')">Enviar mensagem${priceFor(id) ? ` · ${formatMoney(priceFor(id))}` : (chatPair(id) && !isMatch(id) ? ' · grátis' : '')}</button>`
                        : `<button class="btn-locked" onclick="showToast('Você só pode enviar mensagem depois do match.')">Mensagem bloqueada</button>`}
                    <button class="btn-view" onclick="goBack()">${backLabel()}</button>
                </div>
            </div>
        </div>
    `;
}

function viewProfile(id) {
    const profile = findProfile(id);
    if (!profile) return;

    // descobre a página atual antes de abrir o perfil
    const open = [...document.querySelectorAll('.page-content')].find(p => p.style.display !== 'none' && p.id !== 'page-perfil-pessoa');
    if (open) previousPage = open.id.replace('page-', '');

    currentProfileId = id;
    renderProfileDetail(id);
    showPage('perfil-pessoa');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

const NAV_INDEX = { descobrir: 0, matches: 1, mensagens: 2, notificacoes: 3, perfil: 4 };

function backLabel() {
    if (previousPage === 'matches') return 'Voltar aos matches';
    if (previousPage === 'mensagens') return 'Voltar à conversa';
    if (previousPage === 'notificacoes') return 'Voltar aos avisos';
    return 'Ver outros perfis';
}

function goBack() {
    currentProfileId = null;
    showPage(previousPage);
    setActiveNav(NAV_INDEX[previousPage] ?? 0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Volta para o mural de conexões
function backToDiscover() {
    currentProfileId = null;
    previousPage = 'descobrir';
    showPage('descobrir');
    setActiveNav(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToMatches() {
    currentProfileId = null;
    showPage('matches');
    setActiveNav(1);
    markMatchesSeen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToNotifications() {
    currentProfileId = null;
    showPage('notificacoes');
    setActiveNav(NAV_INDEX.notificacoes);
    renderNotifications();
    markAllNotificationsRead();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Controla a navegação entre as telas no Menu
function changePage(pageId, element) {
    currentProfileId = null;

    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
    });

    element.classList.add('active');
    showPage(pageId);

    if (pageId === 'matches') markMatchesSeen();

    if (pageId === 'mensagens') {
        renderMessages();
        scrollThreadToEnd();
    }

    if (pageId === 'notificacoes') {
        // mostra o que é novo em destaque e só depois marca como lido
        renderNotifications();
        markAllNotificationsRead();
    }
}


// ==========================================================
// Notificações — quem curtiu você e quem deu match
// Montadas na hora a partir das curtidas e dos matches (sempre em tempo real).
// type: 'like'  = alguém curtiu você
//       'match' = deu match (você sabe exatamente quem foi)
// ==========================================================
function buildNotifications() {
    const items = [];

    incomingLikes.forEach((time, profileId) => {
        // some o aviso de "curtiu você" quando você já curtiu de volta
        // ou quando você desfez o match depois dessa curtida
        if (likedProfiles.has(profileId)) return;
        if ((hiddenLikes[profileId] || 0) >= time) return;
        items.push({ type: 'like', profileId, time });
    });

    matchByUser.forEach((match, profileId) => {
        if (isMatch(profileId)) items.push({ type: 'match', profileId, time: match.createdAt });
    });

    return items;
}

// Com a tela de avisos aberta, o que chegou depois da última visita fica em destaque
function currentNotifications() {
    const seenAt = notifBaseline === null ? notifSeenAt : notifBaseline;
    return buildNotifications().map(n => ({ ...n, read: n.time <= seenAt }));
}

const unreadNotifications = () => buildNotifications().filter(n => n.time > notifSeenAt).length;

const isPageVisible = pageId => {
    const page = document.getElementById('page-' + pageId);
    return Boolean(page) && page.style.display === 'block';
};

// Marca tudo como visto (e guarda no Firebase, para valer em todos os aparelhos)
function markAllNotificationsRead() {
    if (!unreadNotifications()) return;
    if (notifBaseline === null) notifBaseline = notifSeenAt;

    notifSeenAt = Math.max(notifSeenAt, ...buildNotifications().map(n => n.time));
    setDoc(accountRef, { notifSeenAt }, { merge: true }).catch(error => console.warn(error));
    updateNotificationsBadge();
}

function updateNotificationsBadge() {
    if (!notificationsBadge) return;
    const total = unreadNotifications();
    notificationsBadge.textContent = total > 0 ? total : '';
}


function formatNotificationTime(timestamp) {
    const date = new Date(timestamp);
    const sameDay = date.toDateString() === new Date().toDateString();
    return sameDay
        ? formatTime(timestamp)
        : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function renderNotifications() {
    if (!notificationsContent) return;

    // some o aviso de "curtiu você" quando você já curtiu de volta
    const items = currentNotifications()
        .map(n => ({ n, profile: findProfile(n.profileId) }))
        .filter(({ n, profile }) => profile && !(n.type === 'like' && likedProfiles.has(n.profileId)))
        .sort((a, b) => b.n.time - a.n.time);

    if (!items.length) {
        notificationsContent.innerHTML = `
            <div class="empty-state">
                <h2>Nenhum aviso por enquanto</h2>
                <p>Quando alguém curtir você ou der match, o nome e a foto da pessoa aparecem aqui.</p>
                <button class="btn-primary" onclick="backToDiscover()">Descobrir pessoas</button>
            </div>
        `;
        return;
    }

    notificationsContent.innerHTML = '<div class="notification-list">' + items.map(({ n, profile }) => {
        const isMatchNote = n.type === 'match';
        const text = isMatchNote
            ? `Deu match com <strong>${profile.name}</strong>!`
            : `<strong>${profile.name}</strong> curtiu você`;
        const action = isMatchNote
            ? `<button class="btn-msg" onclick="goToMessages('${profile.id}')">Mensagem</button>`
            : `<button class="btn-msg" onclick="handleLike('${profile.id}')">Curtir de volta</button>`;

        return `
            <div class="notification-item ${n.read ? '' : 'unread'}">
                <img src="${profile.photo}" alt="Foto de ${profile.name}" onclick="viewProfile('${profile.id}')">
                <div class="notification-info">
                    <p class="notification-title">${text}</p>
                    <p class="notification-meta">${profile.age} anos · ${profile.location} · ${formatNotificationTime(n.time)}</p>
                </div>
                <div class="notification-actions">
                    <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver perfil</button>
                    ${action}
                </div>
            </div>
        `;
    }).join('') + '</div>';
}


// ==========================================================
// Mensagens — match (grátis) e conversa paga homem → mulher
//
//   • Match (as duas curtidas): conversa grátis, em matches/.
//   • Sem match, entre um homem e uma mulher, a conversa fica em chats/:
//       - se ELA curtiu ELE: grátis;
//       - se ela NÃO curtiu: ele paga MESSAGE_PRICE_CENTS por mensagem
//         (texto ou foto) e o valor vai para ela. Ela responde de graça.
//   • Fotos podem ser enviadas em qualquer conversa.
// ==========================================================
const getLastMessage = id => { const conv = conversationFor(id); return conv ? conv.lastMessage : null; };
const unreadFor = id => { const conv = conversationFor(id); return conv ? conv.unread : 0; };
const totalUnread = () => getConversations().reduce((sum, profile) => sum + unreadFor(profile.id), 0);
const previewOf = last => (last ? (last.text || (last.image ? 'Foto' : '')) : '');

const isMessagesPageVisible = () => isPageVisible('mensagens');
const isChatOnScreen = id => isMessagesPageVisible() && currentChatId === id;

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Mesmo dia do calendário (ignora a hora)
const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

// Data completa: "10 de novembro de 2026"
function formatFullDate(timestamp) {
    return new Date(timestamp).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Título do dia no chat: "Hoje, 10 de novembro de 2026"
function formatDayLabel(timestamp) {
    const full = formatFullDate(timestamp);
    const now = Date.now();
    if (sameDay(timestamp, now)) return `Hoje, ${full}`;
    if (sameDay(timestamp, now - 24 * 60 * 60 * 1000)) return `Ontem, ${full}`;
    return full;
}

// Lista de conversas: hora se for hoje, "Ontem", senão dia/mês/ano
function formatListTime(timestamp) {
    const now = Date.now();
    if (sameDay(timestamp, now)) return formatTime(timestamp);
    if (sameDay(timestamp, now - 24 * 60 * 60 * 1000)) return 'Ontem';
    return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function updateMessagesBadge() {
    if (!messagesBadge) return;
    const total = totalUnread();
    messagesBadge.textContent = total > 0 ? total : '';
}

// Só aceita foto de conversa no formato que o próprio app gera
const safeChatImage = value =>
    typeof value === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value) ? value : '';

let threadKey = null; // de onde a conversa aberta está sendo lida (matches/ID ou chats/ID)

// Escuta as mensagens da conversa aberta: chegam sozinhas, sem recarregar
function startThread(otherId) {
    stopThread();

    const conv = conversationFor(otherId);
    if (!conv) return;
    threadKey = `${conv.col}/${conv.id}`;

    threadUnsub = onSnapshot(
        query(collection(db, conv.col, conv.id, 'messages'), orderBy('createdAt', 'asc'), limitToLast(300)),
        snapshot => {
            if (currentChatId !== otherId) return;

            currentThread = snapshot.docs.map(d => {
                const data = d.data({ serverTimestamps: 'estimate' });
                return {
                    from: data.from === myId ? 'me' : 'them',
                    text: String(data.text || ''),
                    image: safeChatImage(data.image),
                    price: Number(data.priceCents) || 0,
                    time: toMillis(data.createdAt) || Date.now()
                };
            });

            updateThread();
            renderChatList();
        },
        // a conversa pode ter sido desfeita pela outra pessoa: não é um erro para mostrar
        error => console.warn('Conversa indisponível:', error && error.code)
    );
}

function stopThread() {
    if (threadUnsub) threadUnsub();
    threadUnsub = null;
    threadKey = null;
    currentThread = [];
}

let renderedChatId = null; // conversa que está desenhada na janela de chat

// Carteira (homem) ou ganhos (mulher), no topo da lista de conversas
function walletBarHtml() {
    if (myGender === 'homem') {
        return `
            <div class="wallet-bar">
                <div><small>Seu saldo</small><strong>${formatMoney(walletCents)}</strong></div>
                <button type="button" onclick="openTopUp()">Adicionar saldo</button>
            </div>`;
    }
    if (myGender === 'mulher' && (earnedCents > 0 || paidMessages > 0)) {
        return `
            <div class="wallet-bar earn">
                <div><small>Ganhos com mensagens</small><strong>${formatMoney(earnedCents)}</strong></div>
                <span>${paidMessages} ${paidMessages === 1 ? 'mensagem paga' : 'mensagens pagas'}</span>
            </div>`;
    }
    return '';
}

// Monta a tela de mensagens
function renderMessages() {
    if (!messagesContent) return;
    updateMessagesBadge();

    const conversations = getConversations();

    // Nenhuma conversa possível ainda
    if (!conversations.length) {
        stopThread();
        currentChatId = null;
        const extra = myGender === 'homem'
            ? ` Você também pode mandar mensagem paga (${formatMoney(MESSAGE_PRICE_CENTS)} cada) para mulheres que ainda não curtiram você: abra o perfil dela e toque em Enviar mensagem.`
            : '';
        messagesContent.innerHTML = `
            <div class="empty-state">
                <h2>Nenhuma conversa por aqui</h2>
                <p>Quando houver match, a conversa começa aqui.${extra}</p>
                <button class="btn-primary" onclick="backToDiscover()">Descobrir pessoas</button>
            </div>
        `;
        return;
    }

    // Se a conversa aberta deixou de ser permitida, fecha
    if (currentChatId && !canChat(currentChatId)) {
        stopThread();
        currentChatId = null;
    }

    // Cria a estrutura uma vez só
    let rebuilt = false;
    if (!document.getElementById('chat-shell')) {
        messagesContent.innerHTML = `
            <div class="chat-shell" id="chat-shell">
                <aside class="chat-list" id="chat-list"></aside>
                <section class="chat-window" id="chat-window"></section>
            </div>
        `;
        rebuilt = true;
    }

    // A conversa passou de paga para match (ou nasceu agora): lê da coleção certa
    if (currentChatId) {
        const conv = conversationFor(currentChatId);
        const key = conv ? `${conv.col}/${conv.id}` : null;
        if (key !== threadKey) {
            if (key) startThread(currentChatId);
            else stopThread();
        }
    }

    renderChatList();

    // Atualização em tempo real: se a mesma conversa continua aberta, redesenha só as
    // mensagens (assim o campo de texto não perde o foco enquanto você digita)
    if (rebuilt || renderedChatId !== currentChatId) renderChatWindow();
    else updateThread();
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    const shell = document.getElementById('chat-shell');
    if (!list || !shell) return;

    shell.classList.toggle('chat-open', Boolean(currentChatId));

    // conversas mais recentes primeiro
    const conversations = getConversations().sort((a, b) => {
        const convA = conversationFor(a.id);
        const convB = conversationFor(b.id);
        const timeA = (convA && (convA.lastMessage?.time || convA.createdAt)) || Date.now();
        const timeB = (convB && (convB.lastMessage?.time || convB.createdAt)) || Date.now();
        return timeB - timeA;
    });

    const pending = getPending();

    list.innerHTML = walletBarHtml() + conversations.map(profile => {
        const last = getLastMessage(profile.id);
        const unread = unreadFor(profile.id);
        const preview = last
            ? (last.from === 'me' ? 'Você: ' : '') + escapeHtml(previewOf(last))
            : 'Comece a conversa';
        const photoOnly = Boolean(last && last.image && !last.text);
        const tag = manPays(profile.id)
            ? `<em class="chat-tag">${myGender === 'homem' ? 'Paga' : 'Você recebe'}</em>`
            : '';

        return `
            <button class="chat-item ${currentChatId === profile.id ? 'active' : ''} ${unread ? 'has-unread' : ''}" onclick="openChat('${profile.id}')">
                <img src="${profile.photo}" alt="Foto de ${profile.name}">
                <span class="chat-item-info">
                    <strong>${profile.name} ${tag}</strong>
                    <span class="${unread ? 'unread' : ''} ${photoOnly ? 'is-photo' : ''}">${preview}</span>
                </span>
                <span class="chat-item-meta">
                    ${last ? `<small title="${formatFullDate(last.time)}, ${formatTime(last.time)}">${formatListTime(last.time)}</small>` : ''}
                    ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
                </span>
            </button>
        `;
    }).join('') + (pending.length
        ? `<p class="chat-note">${pending.length === 1 ? '1 pessoa que você curtiu ainda não deu' : pending.length + ' pessoas que você curtiu ainda não deram'} match. ${myGender === 'homem' ? 'Para falar antes do match, abra o perfil e use a mensagem paga.' : 'As mensagens liberam quando a curtida for recíproca.'}</p>`
        : '');
}

// Faixa com a regra da conversa (quem paga, quanto custa, saldo)
function chatBannerHtml(profile) {
    if (!profile || !chatPair(profile.id) || isMatch(profile.id)) return '';

    if (manPays(profile.id)) {
        if (myGender === 'homem') {
            return `
                <div class="chat-banner pay">
                    <span>${profile.name} ainda não curtiu você. Cada mensagem ou foto custa <b>${formatMoney(MESSAGE_PRICE_CENTS)}</b> e vai para ela.
                    Saldo: <b>${formatMoney(walletCents)}</b></span>
                    <button type="button" onclick="openTopUp()">Adicionar saldo</button>
                </div>`;
        }
        return `
            <div class="chat-banner earn">
                <span>${profile.name} paga <b>${formatMoney(MESSAGE_PRICE_CENTS)}</b> por cada mensagem ou foto enviada para você. Responder é grátis.</span>
            </div>`;
    }

    return `<div class="chat-banner free"><span>${myGender === 'homem' ? `${profile.name} curtiu você: conversar é grátis.` : 'Conversa grátis para os dois.'}</span></div>`;
}

function updateChatBanner() {
    const box = document.getElementById('chat-banner');
    if (!box || !currentChatId) return;
    box.innerHTML = chatBannerHtml(findProfile(currentChatId));
}

function renderChatWindow() {
    const win = document.getElementById('chat-window');
    if (!win) return;

    // guarda o que a pessoa já estava digitando
    const typed = document.getElementById('chat-input')?.value || '';

    const profile = currentChatId ? findProfile(currentChatId) : null;
    renderedChatId = currentChatId;

    if (!profile) {
        win.innerHTML = `
            <div class="chat-placeholder">
                <h2>Suas conversas</h2>
                <p>Escolha uma conversa na lista para começar.</p>
            </div>
        `;
        return;
    }

    const price = priceFor(profile.id);
    win.innerHTML = `
        <div class="chat-header">
            <button class="chat-back" onclick="closeChat()" aria-label="Voltar para as conversas"></button>
            <img src="${profile.photo}" alt="Foto de ${profile.name}" onclick="viewProfile('${profile.id}')">
            <div class="chat-header-info">
                <strong>${profile.name}</strong>
                <span>${profile.location}</span>
            </div>
            <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver perfil</button>
        </div>

        <div id="chat-banner">${chatBannerHtml(profile)}</div>

        <div class="chat-thread" id="chat-thread"></div>

        <form class="chat-form" onsubmit="sendMessage(event)">
            <label class="chat-attach" title="Enviar foto" aria-label="Enviar foto">
                ${meIcon('image')}
                <input type="file" accept="image/*" hidden onchange="sendChatPhoto(event)">
            </label>
            <input id="chat-input" type="text" placeholder="${price ? `Mensagem · ${formatMoney(price)}` : `Escreva uma mensagem para ${profile.name}`}" autocomplete="off" maxlength="500">
            <button type="submit" class="chat-send" aria-label="Enviar mensagem"></button>
        </form>
    `;

    document.getElementById('chat-input').value = typed;
    updateThread();
}

// Redesenha só as mensagens (não mexe no campo de texto)
function updateThread() {
    const thread = document.getElementById('chat-thread');
    if (!thread || !currentChatId) return;

    const profile = findProfile(currentChatId);
    if (!profile) return;

    updateChatBanner();

    let empty = '';
    if (!currentThread.length) {
        const price = priceFor(profile.id);
        empty = isMatch(profile.id)
            ? `Você e ${profile.name} deram match. Mande a primeira mensagem.`
            : price
                ? `Sua primeira mensagem para ${profile.name} custa ${formatMoney(price)}.`
                : `Mande a primeira mensagem para ${profile.name}.`;
    }

    let html = empty ? `<p class="thread-empty">${empty}</p>` : '';

    let lastDay = null;
    html += currentThread.map(m => {
        const note = m.price
            ? `<em class="bubble-price">${m.from === 'me' ? '−' : '+'}${formatMoney(m.price)}</em>`
            : '';

        // título com dia, mês e ano quando começa um dia novo na conversa
        let dayTitle = '';
        const dayKey = new Date(m.time).toDateString();
        if (dayKey !== lastDay) {
            lastDay = dayKey;
            dayTitle = `<div class="thread-day"><span>${formatDayLabel(m.time)}</span></div>`;
        }

        return dayTitle + `
        <div class="bubble ${m.from === 'me' ? 'me' : 'them'} ${m.image ? 'has-image' : ''}" title="${formatFullDate(m.time)}, ${formatTime(m.time)}">
            ${m.image ? `<img class="bubble-img" src="${m.image}" alt="Foto enviada" onclick="openPhoto(this.src)">` : ''}
            ${m.text ? `<span>${escapeHtml(m.text)}</span>` : ''}
            <small>${note}${formatTime(m.time)}</small>
        </div>`;
    }).join('');

    thread.innerHTML = html;
    thread.scrollTop = thread.scrollHeight;
}

function scrollThreadToEnd() {
    const thread = document.getElementById('chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
}

function openChat(id) {
    if (!canChat(id)) {
        showToast('Você só pode enviar mensagem depois do match.');
        return;
    }

    chatReadBlocked = false;
    currentChatId = id;
    currentThread = [];
    startThread(id);
    markCurrentChatRead();
    renderMessages();
    scrollThreadToEnd();

    // no computador, deixa o cursor pronto para digitar
    if (window.matchMedia('(min-width: 861px)').matches) {
        document.getElementById('chat-input')?.focus();
    }
}

function closeChat() {
    stopThread();
    currentChatId = null;
    renderMessages();
}

// ---------- Enviar mensagem ou foto ----------
let sendingNow = false;

// Devolve true quando a mensagem foi enviada
async function deliverMessage(otherId, { text = '', image = '' }) {
    if (sendingNow) return false;
    if (!text && !image) return false;
    if (!canChat(otherId)) {
        showToast('Você só pode enviar mensagem depois do match.');
        return false;
    }

    const price = priceFor(otherId);
    if (price > 0 && walletCents < price) {
        showToast(`Saldo insuficiente. Cada mensagem custa ${formatMoney(price)}.`, 'Adicionar saldo', openTopUp);
        return false;
    }

    sendingNow = true;
    try {
        const conv = conversationFor(otherId);

        if (conv && conv.col === 'matches') {
            // match: grátis. A mensagem e o resumo da conversa (última mensagem + não lidas) entram juntos
            const batch = writeBatch(db);
            batch.set(doc(collection(db, 'matches', conv.id, 'messages')), {
                from: myId,
                text,
                ...(image ? { image } : {}),
                createdAt: serverTimestamp()
            });
            batch.update(doc(db, 'matches', conv.id), {
                lastMessage: { from: myId, text, ...(image ? { image: true } : {}), time: serverTimestamp() },
                [`unread.${otherId}`]: increment(1)
            });
            await batch.commit();
        } else {
            // sem match (homem ↔ mulher): tudo na mesma transação — a mensagem, o resumo,
            // o desconto do saldo dele e o ganho dela
            const pair = chatPair(otherId);
            const chatId = pairId(myId, otherId);
            const chatRef = doc(db, 'chats', chatId);
            const walletRef = doc(db, 'wallets', myId);
            const messageRef = doc(collection(db, 'chats', chatId, 'messages'));
            const lastMessage = { from: myId, text, ...(image ? { image: true } : {}), time: serverTimestamp() };

            await runTransaction(db, async transaction => {
                const chatSnap = await transaction.get(chatRef);

                if (price > 0) {
                    const walletSnap = await transaction.get(walletRef);
                    const balance = walletSnap.exists() ? Number(walletSnap.data().balanceCents) || 0 : 0;
                    if (balance < price) throw Object.assign(new Error('saldo'), { code: 'no-balance' });
                    transaction.update(walletRef, { balanceCents: increment(-price) });
                }

                if (chatSnap.exists()) {
                    transaction.update(chatRef, {
                        lastMessage,
                        [`unread.${otherId}`]: increment(1),
                        earnedCents: increment(price),
                        paidCount: increment(price > 0 ? 1 : 0)
                    });
                } else {
                    transaction.set(chatRef, {
                        users: [myId, otherId].sort(),
                        manId: pair.manId,
                        womanId: pair.womanId,
                        createdAt: serverTimestamp(),
                        lastMessage,
                        unread: { [myId]: 0, [otherId]: 1 },
                        earnedCents: price,
                        paidCount: price > 0 ? 1 : 0
                    });
                }

                transaction.set(messageRef, {
                    from: myId,
                    to: otherId,
                    text,
                    ...(image ? { image } : {}),
                    priceCents: price,
                    createdAt: serverTimestamp()
                });
            });
        }
        return true;
    } catch (error) {
        console.error(error);
        if (error && error.code === 'no-balance') {
            showToast(`Saldo insuficiente. Cada mensagem custa ${formatMoney(price)}.`, 'Adicionar saldo', openTopUp);
        } else if (error && error.code === 'permission-denied') {
            showToast('O Firebase recusou o envio. Publique as regras do arquivo firestore.rules.pagamentos.');
        } else {
            showToast('Mensagem não enviada. Tente de novo.');
        }
        return false;
    } finally {
        sendingNow = false;
    }
}

async function sendMessage(event) {
    event.preventDefault();

    const input = document.getElementById('chat-input');
    const text = input ? input.value.trim() : '';
    const otherId = currentChatId;
    if (!text || !otherId) return;

    input.value = '';
    const ok = await deliverMessage(otherId, { text });
    if (!ok) {
        const field = document.getElementById('chat-input');
        if (field && !field.value) field.value = text; // devolve o texto para tentar de novo
    }
}

// Lê a foto escolhida, reduz e converte para JPEG (cabe no limite de 1 MB do Firestore)
function readChatPhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('open'));
            image.onload = () => {
                const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.width * scale));
                canvas.height = Math.max(1, Math.round(image.height * scale));
                const context = canvas.getContext('2d');
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(image, 0, 0, canvas.width, canvas.height);

                let quality = 0.8;
                let url = canvas.toDataURL('image/jpeg', quality);
                while (url.length > 420000 && quality > 0.4) {
                    quality -= 0.1;
                    url = canvas.toDataURL('image/jpeg', quality);
                }
                url.length > 420000 ? reject(new Error('big')) : resolve(url);
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function sendChatPhoto(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    const otherId = currentChatId;
    if (!file || !otherId) return;

    if (!file.type.startsWith('image/')) {
        showToast('Escolha um arquivo de imagem.');
        return;
    }

    let image;
    try {
        image = await readChatPhoto(file);
    } catch (error) {
        showToast(error && error.message === 'big' ? 'Essa foto é pesada demais. Escolha outra.' : 'Não consegui abrir essa imagem.');
        return;
    }

    const profile = findProfile(otherId);
    const price = priceFor(otherId);
    const ok = await askConfirm({
        title: 'Enviar esta foto?',
        message: price
            ? `Vai para ${profile ? profile.name.replace(/&amp;|&lt;|&gt;|&quot;/g, '') : 'a conversa'} e custa ${formatMoney(price)}.`
            : `Vai para ${profile ? profile.name.replace(/&amp;|&lt;|&gt;|&quot;/g, '') : 'a conversa'}.`,
        image,
        confirmText: price ? `Enviar por ${formatMoney(price)}` : 'Enviar foto',
        cancelText: 'Cancelar'
    });
    if (!ok || currentChatId !== otherId) return;

    await deliverMessage(otherId, { image });
}

// Foto em tamanho grande
function openPhoto(src) {
    if (!safeChatImage(src)) return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay photo-viewer';
    overlay.innerHTML = `<img src="${src}" alt="Foto da conversa"><button type="button" aria-label="Fechar">×</button>`;

    const close = () => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.remove('show');
        setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 180);
    };
    const onKey = event => { if (event.key === 'Escape') close(); };

    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('show'));
}

// ---------- Saldo ----------
// MODO DE TESTE: o saldo é de mentira (nenhum dinheiro real). Para cobrar de verdade,
// troque addCredits() por um pagamento (Pix, cartão...) confirmado pelo servidor.
function openTopUp() {
    if (myGender !== 'homem') return;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="topup-title">
            <div class="modal-icon">${meIcon('plus')}</div>
            <h3 id="topup-title">Adicionar saldo</h3>
            <p>Cada mensagem para quem ainda não curtiu você custa ${formatMoney(MESSAGE_PRICE_CENTS)} e vai para ela.</p>
            <div class="topup-options">
                ${TOPUP_OPTIONS.map(cents => `<button type="button" data-cents="${cents}">${formatMoney(cents)}</button>`).join('')}
            </div>
            ${PAYMENTS_TEST_MODE ? '<p class="topup-note">Modo de teste: o saldo é de mentira e nenhum dinheiro real é cobrado.</p>' : ''}
            <div class="modal-actions"><button type="button" class="modal-cancel">Fechar</button></div>
        </div>`;

    const close = () => {
        document.removeEventListener('keydown', onKey);
        overlay.classList.remove('show');
        setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 180);
    };
    const onKey = event => { if (event.key === 'Escape') close(); };

    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.querySelector('.modal-cancel').addEventListener('click', close);
    overlay.querySelectorAll('[data-cents]').forEach(button => {
        button.addEventListener('click', async () => {
            close();
            await addCredits(Number(button.dataset.cents));
        });
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => overlay.classList.add('show'));
}

async function addCredits(cents) {
    if (!TOPUP_OPTIONS.includes(cents)) return;

    if (!PAYMENTS_TEST_MODE) {
        showToast('O pagamento ainda não está conectado.');
        return;
    }

    try {
        await setDoc(doc(db, 'wallets', myId), { balanceCents: increment(cents), updatedAt: serverTimestamp() }, { merge: true });
        showToast(`${formatMoney(cents)} de saldo de teste adicionados.`);
    } catch (error) {
        console.error(error);
        showToast(error && error.code === 'permission-denied'
            ? 'O Firebase recusou. Publique as regras do arquivo firestore.rules.pagamentos.'
            : 'Não consegui adicionar saldo agora.');
    }
}

// Abre a conversa com alguém (botões "Mensagem")
function goToMessages(id) {
    if (!canChat(id)) {
        showToast('Você só pode enviar mensagem depois do match.');
        return;
    }

    currentProfileId = null;
    previousPage = 'mensagens';
    showPage('mensagens');
    setActiveNav(2);
    openChat(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


// ==========================================================
// Meu Perfil — dados da sua conta
// ==========================================================
function profileCompletion(profile) {
    const checks = [
        profile.name,
        profile.age,
        profile.location,
        profile.bio,
        profile.interests.length >= 3,
        profile.photo
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

// ----- Ícones do Meu Perfil (SVG simples, herdam a cor do texto) -----
const ME_ICONS = {
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    sparkle: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
};

function meIcon(name) {
    return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ME_ICONS[name] || ''}</svg>`;
}

const INTEREST_SUGGESTIONS = ['Música', 'Viagens', 'Filmes', 'Games', 'Academia', 'Pets', 'Culinária', 'Livros'];

function quickInterest(text) {
    const input = document.getElementById('me-interest-input');
    if (!input) return;
    input.value = text;
    addInterest();
}

function renderMyProfile() {
    const root = document.getElementById('my-profile');
    if (!root) return;

    root.innerHTML = `
        <div class="me-page">

            <!-- ===== Topo (capa + avatar + progresso + números) ===== -->
            <section class="me-hero">
                <div class="me-banner" aria-hidden="true"></div>

                <div class="me-hero-body">
                    <div class="me-avatar-wrap">
                        <div class="me-avatar" id="me-avatar"></div>
                        <label class="me-avatar-edit" title="Trocar foto">
                            ${meIcon('camera')}
                            <input type="file" accept="image/*" hidden onchange="handlePhotoUpload(event)">
                        </label>
                    </div>

                    <div class="me-hero-info">
                        <h2 class="me-name" id="me-name">Seu nome</h2>
                        <p class="me-sub" id="me-sub">Complete seu perfil</p>
                        <button type="button" class="me-remove" id="me-remove" onclick="removeMyPhoto()" hidden>${meIcon('trash')}Remover foto</button>
                    </div>

                    <div class="me-ring" title="Quanto do seu perfil está preenchido">
                        <svg viewBox="0 0 100 100" aria-hidden="true">
                            <defs>
                                <linearGradient id="me-ring-grad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0" stop-color="#2de2f5"/>
                                    <stop offset="0.55" stop-color="#8b5cf6"/>
                                    <stop offset="1" stop-color="#ff4fa3"/>
                                </linearGradient>
                            </defs>
                            <circle class="ring-bg" cx="50" cy="50" r="44"/>
                            <circle class="ring-fg" id="me-ring-fg" cx="50" cy="50" r="44" transform="rotate(-90 50 50)"/>
                        </svg>
                        <b id="me-percent">0%</b>
                        <small>completo</small>
                    </div>
                </div>

                <div class="me-stats" id="me-stats"></div>
            </section>

            <!-- ===== Corpo: formulário + prévia ===== -->
            <div class="me-grid">
                <div class="me-col">
                    <form class="me-form" onsubmit="saveProfileForm(event)" oninput="updateMePreview()">

                        <section class="me-step" id="me-step-1">
                            <div class="me-step-head">
                                <i>1</i>
                                <div><h3>Informações básicas</h3><p>Quem você é e de onde fala.</p></div>
                            </div>

                            <div class="field-row">
                                <label class="field">
                                    <span>Nome</span>
                                    <div class="input-wrap">
                                        ${meIcon('user')}
                                        <input id="me-name-input" type="text" maxlength="40" autocomplete="given-name"
                                               placeholder="Como você quer ser chamado" value="${escapeHtml(myProfile.name)}"
                                               oninput="renderMyAvatar()">
                                    </div>
                                </label>
                                <label class="field field-small">
                                    <span>Idade</span>
                                    <div class="input-wrap no-icon" id="me-age-wrap">
                                        <input id="me-age-input" type="number" min="18" max="99" inputmode="numeric"
                                               placeholder="18+" value="${escapeHtml(myProfile.age)}">
                                    </div>
                                </label>
                            </div>
                            <p class="field-error" id="me-age-error" role="alert" hidden>A idade precisa estar entre 18 e 99 anos.</p>

                            <label class="field">
                                <span>Cidade</span>
                                <div class="input-wrap">
                                    ${meIcon('pin')}
                                    <input id="me-location-input" type="text" maxlength="60" autocomplete="address-level2"
                                           placeholder="Ex.: Porto Velho, RO" value="${escapeHtml(myProfile.location)}">
                                </div>
                            </label>
                            <button type="button" class="btn-ghost me-geo" id="me-location-btn" onclick="fillLocation()">${meIcon('pin')}Usar minha localização</button>
                            <p class="section-hint" id="me-location-status" aria-live="polite"></p>
                        </section>

                        <section class="me-step" id="me-step-2">
                            <div class="me-step-head">
                                <i>2</i>
                                <div><h3>Sobre você</h3><p>Uma frase boa vale mais que um texto longo.</p></div>
                            </div>

                            <label class="field">
                                <span>Bio <small id="me-bio-count">${myProfile.bio.length}/200</small></span>
                                <textarea id="me-bio-input" rows="4" maxlength="200"
                                          placeholder="Conte um pouco sobre você"
                                          oninput="updateBioCount(this)">${escapeHtml(myProfile.bio)}</textarea>
                            </label>
                        </section>

                        <section class="me-step" id="me-step-3">
                            <div class="me-step-head">
                                <i>3</i>
                                <div><h3>Interesses</h3><p>Escolha até 8 para combinar com quem pensa parecido.</p></div>
                                <small class="me-count" id="me-int-count">${draftInterests.length}/8</small>
                            </div>

                            <div class="interest-add">
                                <div class="input-wrap no-icon">
                                    <input id="me-interest-input" type="text" maxlength="20" placeholder="Digite e aperte Enter"
                                           onkeydown="interestKey(event)">
                                </div>
                                <button type="button" class="btn-add" onclick="addInterest()" aria-label="Adicionar interesse">${meIcon('plus')}</button>
                            </div>

                            <div class="chips" id="me-interests"></div>

                            <div class="me-suggest" id="me-suggest"></div>
                        </section>

                        <div class="me-save-bar">
                            <p class="me-save-status" id="me-save-status">Tudo salvo</p>
                            <button type="submit" class="btn-primary btn-save">${meIcon('check')}Salvar perfil</button>
                        </div>
                    </form>

                    <section class="me-account">
                        <div class="me-account-row">
                            <div class="me-account-icon">${meIcon('mail')}</div>
                            <div class="me-account-text">
                                <strong>Conta</strong>
                                <p>${escapeHtml(currentUser ? currentUser.email : '')}</p>
                            </div>
                            <button type="button" class="btn-ghost" onclick="logoutUser()">Sair da conta</button>
                        </div>
                        <div class="me-account-row danger">
                            <div class="me-account-icon">${meIcon('trash')}</div>
                            <div class="me-account-text">
                                <strong>Zona de perigo</strong>
                                <p>Apaga sua conta, perfil, curtidas, matches e mensagens. Não dá para desfazer.</p>
                            </div>
                            <button type="button" class="btn-ghost btn-danger" onclick="deleteMyAccount()">Apagar minha conta</button>
                        </div>
                    </section>
                </div>

                <aside class="me-preview-col">
                    <p class="me-preview-label"><span class="live-dot"></span>Prévia ao vivo<small>Como as outras pessoas veem você</small></p>
                    <article class="me-preview" id="me-preview"></article>
                </aside>
            </div>
        </div>
    `;

    renderMyAvatar();
    renderInterestChips();
    updateProfileSummary();
    updateProfileStats();
}

// Prévia: mostra como seu perfil aparece para os outros (atualiza enquanto você digita)
function updateMePreview() {
    const box = document.getElementById('me-preview');
    if (!box) return;

    const val = id => (document.getElementById(id)?.value || '').trim();
    const name = val('me-name-input') || 'Seu nome';
    const age = parseInt(val('me-age-input'), 10);
    const city = val('me-location-input');
    const bio = val('me-bio-input');
    const initial = escapeHtml((name.trim()[0] || '?').toUpperCase());

    box.innerHTML = `
        <div class="pv-photo">
            ${draftPhoto
                ? `<img src="${escapeHtml(draftPhoto)}" alt="Prévia da sua foto">`
                : `<span class="pv-initial">${initial}</span>`}
            <div class="pv-shade"></div>
            <div class="pv-title">
                <h4>${escapeHtml(name)}${age >= 18 ? `<em>, ${age}</em>` : ''}</h4>
                ${city ? `<p>${meIcon('pin')}${escapeHtml(city)}</p>` : ''}
            </div>
        </div>
        <div class="pv-body">
            <p class="pv-bio ${bio ? '' : 'empty'}">${bio ? escapeHtml(bio) : 'Sua bio aparece aqui.'}</p>
            <div class="chips">
                ${draftInterests.length
                    ? draftInterests.map(item => `<span class="chip">${escapeHtml(item)}</span>`).join('')
                    : '<span class="pv-empty">Seus interesses aparecem aqui</span>'}
            </div>
        </div>`;

    // Formulário: idade inválida, passos completos e "alterações não salvas"
    const ageRaw = val('me-age-input');
    const ageOk = age >= 18 && age <= 99;
    const ageBad = ageRaw !== '' && !ageOk;
    document.getElementById('me-age-wrap')?.classList.toggle('invalid', ageBad);
    const ageError = document.getElementById('me-age-error');
    if (ageError) ageError.hidden = !ageBad;

    const done = {
        'me-step-1': Boolean(val('me-name-input') && ageOk && city),
        'me-step-2': Boolean(bio),
        'me-step-3': draftInterests.length >= 3
    };
    Object.entries(done).forEach(([id, ok]) => document.getElementById(id)?.classList.toggle('done', ok));

    updateSaveState();
}

// Contador da bio: fica amarelo perto do limite e rosa quando enche
function updateBioCount(textarea) {
    const count = document.getElementById('me-bio-count');
    if (!count) return;
    const size = textarea.value.length;
    count.textContent = size + '/200';
    count.classList.toggle('warn', size >= 170 && size < 200);
    count.classList.toggle('full', size >= 200);
}

// Compara o que está na tela com o que está salvo
function isProfileDirty() {
    const val = id => (document.getElementById(id)?.value || '').trim();
    const sameList = draftInterests.length === myProfile.interests.length
        && draftInterests.every((item, index) => item === myProfile.interests[index]);

    return val('me-name-input') !== String(myProfile.name || '')
        || val('me-age-input') !== String(myProfile.age || '')
        || val('me-location-input') !== String(myProfile.location || '')
        || val('me-bio-input') !== String(myProfile.bio || '')
        || draftPhoto !== (myProfile.photo || '')
        || !sameList;
}

function updateSaveState() {
    const status = document.getElementById('me-save-status');
    if (!status) return;
    const dirty = isProfileDirty();
    status.classList.toggle('dirty', dirty);
    status.textContent = dirty ? 'Alterações não salvas' : 'Tudo salvo';
}

// Foto (ou a inicial do nome, enquanto não há foto)
function renderMyAvatar() {
    const avatar = document.getElementById('me-avatar');
    if (avatar) {
        if (draftPhoto) {
            avatar.innerHTML = `<img src="${escapeHtml(draftPhoto)}" alt="Sua foto">`;
        } else {
            const typed = document.getElementById('me-name-input')?.value || myProfile.name;
            const initial = (typed.trim()[0] || '?').toUpperCase();
            avatar.innerHTML = `<span>${escapeHtml(initial)}</span>`;
        }
    }

    const remove = document.getElementById('me-remove');
    if (remove) remove.hidden = !draftPhoto;

    updateMePreview();
}

// Topo: nome, idade, cidade e anel de perfil completo
function updateProfileSummary() {
    const name = document.getElementById('me-name');
    if (!name) return;

    const details = [myProfile.age ? `${myProfile.age} anos` : '', myProfile.location].filter(Boolean).join(' · ');
    const percent = profileCompletion(myProfile);
    const circumference = 2 * Math.PI * 44;

    name.textContent = myProfile.name || 'Seu nome';
    document.getElementById('me-sub').textContent = details || 'Complete seu perfil';
    document.getElementById('me-percent').textContent = percent + '%';

    const ring = document.getElementById('me-ring-fg');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference * (1 - percent / 100);

    updateSaveState();
}

// Números da sua atividade (atualizam sozinhos)
function updateProfileStats() {
    const stats = document.getElementById('me-stats');
    if (!stats) return;

    const items = [
        ['heart', 'pink', likedProfiles.size, 'Curtidas enviadas'],
        ['sparkle', 'violet', getMatches().length, 'Matches'],
        ['clock', 'gold', getPending().length, 'Aguardando'],
        ['eye', 'cyan', profiles.filter(likesYouNow).length, 'Curtiram você']
    ];

    stats.innerHTML = items
        .map(([icon, tone, value, label]) => `
            <div class="me-stat ${tone}">
                <i>${meIcon(icon)}</i>
                <div><strong>${value}</strong><span>${label}</span></div>
            </div>`)
        .join('');
}

// ----- Interesses -----
function renderInterestChips() {
    const box = document.getElementById('me-interests');
    if (!box) return;

    const counter = document.getElementById('me-int-count');
    if (counter) counter.textContent = draftInterests.length + '/8';

    box.innerHTML = draftInterests.length
        ? draftInterests.map((item, index) => `
            <span class="chip chip-edit">${escapeHtml(item)}
                <button type="button" onclick="removeInterest(${index})" aria-label="Remover ${escapeHtml(item)}">×</button>
            </span>`).join('')
        : '<p class="field-hint">Adicione pelo menos 3 interesses para completar o perfil.</p>';

    const suggest = document.getElementById('me-suggest');
    if (suggest) {
        const taken = draftInterests.map(item => item.toLowerCase());
        suggest.innerHTML = draftInterests.length >= 8 ? '' : INTEREST_SUGGESTIONS
            .filter(item => !taken.includes(item.toLowerCase()))
            .map(item => `<button type="button" onclick="quickInterest('${item}')">+ ${item}</button>`)
            .join('');
    }

    updateMePreview();
}

function addInterest() {
    const input = document.getElementById('me-interest-input');
    if (!input) return;

    const value = input.value.trim().slice(0, 20);
    if (!value) return;

    if (draftInterests.length >= 8) {
        showToast('Você pode ter no máximo 8 interesses.');
        return;
    }

    if (!draftInterests.some(item => item.toLowerCase() === value.toLowerCase())) {
        draftInterests.push(value);
        renderInterestChips();
    }
    input.value = '';
    input.focus();
}

function removeInterest(index) {
    draftInterests.splice(index, 1);
    renderInterestChips();
}

// Enter no campo adiciona o interesse (e não envia o formulário)
function interestKey(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addInterest();
}

// ----- Foto -----
// Recorta em quadrado e reduz, para caber no armazenamento do navegador
function handlePhotoUpload(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Escolha um arquivo de imagem.');
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        const image = new Image();
        image.onload = () => {
            const size = 480;
            const scale = Math.max(size / image.width, size / image.height);
            const width = image.width * scale;
            const height = image.height * scale;

            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            canvas.getContext('2d').drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

            draftPhoto = canvas.toDataURL('image/jpeg', 0.82);
            renderMyAvatar();
            showToast('Foto pronta. Clique em Salvar perfil.');
        };
        image.onerror = () => showToast('Não consegui abrir essa imagem.');
        image.src = reader.result;
    };
    reader.onerror = () => showToast('Não consegui ler esse arquivo.');
    reader.readAsDataURL(file);
}

function removeMyPhoto() {
    draftPhoto = '';
    renderMyAvatar();
}

// ----- Salvar -----
// Botão "Salvar perfil" fica verde por um instante quando salva
function flashSaved() {
    const button = document.querySelector('.btn-save');
    if (!button) return;
    button.classList.remove('saved');
    void button.offsetWidth; // reinicia a animação se clicar de novo
    button.classList.add('saved');
    setTimeout(() => button.classList.remove('saved'), 1600);
}

async function saveProfileForm(event) {
    event.preventDefault();

    const name = document.getElementById('me-name-input').value.trim();
    const age = parseInt(document.getElementById('me-age-input').value, 10);
    const location = document.getElementById('me-location-input').value.trim();
    const bio = document.getElementById('me-bio-input').value.trim();

    if (!name) {
        showToast('Coloque seu nome.');
        document.getElementById('me-name-input').focus();
        return;
    }

    if (!(age >= 18 && age <= 99)) {
        showToast('A idade precisa estar entre 18 e 99 anos.');
        document.getElementById('me-age-input').focus();
        return;
    }

    if (draftPhoto.length > 700000) {
        showToast('A foto ficou grande demais. Escolha outra imagem.');
        return;
    }

    const next = { name, age, location, bio, interests: [...draftInterests], photo: draftPhoto };

    try {
        await setDoc(userRef, { ...next, gender: myGender, updatedAt: serverTimestamp() }, { merge: true });
    } catch (error) {
        console.error(error);
        showToast('Não deu para salvar agora. Confira a internet e tente de novo.');
        return;
    }

    myProfile = { ...next, interestedIn: [...myProfile.interestedIn] };
    showToast('Perfil salvo!');
    flashSaved();
    updateProfileSummary();
}

// ----- Sair da conta -----
function logoutUser() {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    unsubscribers.length = 0;
    Auth.logout('login.html');
}

// ----- Apagar tudo -----
// ----- Janela de confirmação (substitui o confirm() do navegador) -----
function askConfirm({ title, message, items = [], image = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal ${danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-text">
                ${image && safeChatImage(image)
                    ? `<img class="modal-photo" src="${image}" alt="Prévia da foto">`
                    : `<div class="modal-icon">${meIcon(danger ? 'trash' : 'check')}</div>`}
                <h3 id="modal-title">${escapeHtml(title)}</h3>
                <p id="modal-text">${escapeHtml(message)}</p>
                ${items.length ? `<ul class="modal-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
                <div class="modal-actions">
                    <button type="button" class="modal-cancel">${escapeHtml(cancelText)}</button>
                    <button type="button" class="modal-ok">${escapeHtml(confirmText)}</button>
                </div>
            </div>`;

        function close(result) {
            document.removeEventListener('keydown', onKey);
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                document.body.style.overflow = '';
                if (previousFocus && previousFocus.focus) previousFocus.focus();
            }, 180);
            resolve(result);
        }

        function onKey(event) {
            if (event.key === 'Escape') close(false);
        }

        overlay.addEventListener('click', event => { if (event.target === overlay) close(false); });
        overlay.querySelector('.modal-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.modal-ok').addEventListener('click', () => close(true));
        document.addEventListener('keydown', onKey);

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => overlay.classList.add('show'));
        overlay.querySelector('.modal-cancel').focus();
    });
}

// ----- Apagar a conta -----
async function deleteMyAccount() {
    const ok = await askConfirm({
        title: 'Apagar sua conta?',
        message: 'Isso não pode ser desfeito. Vai sumir tudo que está salvo no NexaMatch:',
        items: ['Seu perfil e sua foto', 'Curtidas e matches', 'Mensagens e fotos', 'Saldo e conversas pagas'],
        confirmText: 'Sim, apagar conta',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!ok) return;

    // O Firebase só apaga a conta de quem entrou há pouco. Confere antes de apagar qualquer dado.
    const signedInAt = Date.parse((auth.currentUser && auth.currentUser.metadata.lastSignInTime) || '') || 0;
    if (Date.now() - signedInAt > 4 * 60 * 1000) {
        showToast('Por segurança, saia da conta, entre de novo e peça para apagar logo em seguida.');
        return;
    }

    try {
        stopThread();
        const matchIds = [...matchByUser.values()].map(match => match.id);
        const chatIds = [...chatByUser.values()].map(chat => chat.id);

        // 1º as curtidas (enviadas e recebidas), para nenhum match ser recriado no meio do caminho
        const [sent, received] = await Promise.all([
            getDocs(query(collection(db, 'likes'), where('from', '==', myId))),
            getDocs(query(collection(db, 'likes'), where('to', '==', myId)))
        ]);
        const likeRefs = [...sent.docs, ...received.docs].map(d => d.ref);
        for (let i = 0; i < likeRefs.length; i += 400) {
            const batch = writeBatch(db);
            likeRefs.slice(i, i + 400).forEach(ref => batch.delete(ref));
            await batch.commit();
        }

        // 2º matches e mensagens, 3º perfil e dados privados
        for (const matchId of matchIds) await deleteMatchData(matchId);
        for (const chatId of chatIds) await deleteConversationData('chats', chatId);
        await deleteDoc(doc(db, 'wallets', myId)).catch(() => {}); // pode nem existir
        await deleteDoc(userRef);
        await deleteDoc(accountRef);

        // 4º a conta de login
        unsubscribers.forEach(unsubscribe => unsubscribe());
        unsubscribers.length = 0;
        await deleteUser(auth.currentUser);
        window.location.replace('login.html');
    } catch (error) {
        console.error(error);
        showToast('Não consegui apagar tudo. Entre de novo e tente outra vez.');
    }
}


// ---------- Preencher a cidade com a localização ----------
// Só roda quando a pessoa toca no botão (o navegador pede a permissão nessa hora).
// Salvamos apenas "Cidade, UF" no campo; as coordenadas não ficam guardadas.
async function fillLocation() {
    const input = document.getElementById('me-location-input');
    const btn = document.getElementById('me-location-btn');
    const status = document.getElementById('me-location-status');
    if (!input || !btn) return;
    const say = text => { if (status) status.textContent = text; };

    if (!('geolocation' in navigator)) {
        say('Seu navegador não informa a localização. Digite a cidade.');
        return;
    }

    btn.disabled = true;
    say('Procurando sua cidade...');
    try {
        const position = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 10 * 60 * 1000
            })
        );

        const { latitude, longitude } = position.coords;
        const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
            + `?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error('geocode');

        const data = await response.json();
        const city = String(data.city || data.locality || '').trim();
        if (!city) throw new Error('geocode');
        const uf = String(data.principalSubdivisionCode || '').split('-')[1]
            || String(data.principalSubdivision || '').trim();

        input.value = [city, uf].filter(Boolean).join(', ').slice(0, 60);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        say('Cidade preenchida. Confira e salve o perfil.');
    } catch (error) {
        if (error && error.code === 1) say('Permissão negada. Libere a localização no navegador ou digite a cidade.');
        else if (error && error.code === 3) say('Demorou demais. Tente de novo ou digite a cidade.');
        else say('Não consegui descobrir sua cidade agora. Digite manualmente.');
    } finally {
        btn.disabled = false;
    }
}

// Inicia a aplicação
// Este arquivo é um módulo: as funções chamadas pelos botões do HTML (onclick="...")
// precisam ser publicadas no window.
Object.assign(window, {
    addInterest, backToDiscover, changePage, closeChat, deleteMyAccount, goBack, goToMessages, openPhoto, openTopUp, sendChatPhoto,
    fillLocation, handleLike, handlePhotoUpload, interestKey, logoutUser, openChat, quickInterest, removeInterest,
    removeLike, removeMyPhoto, renderMyAvatar, saveProfileForm, selectAllGenders, sendMessage,
    showToast, toggleDiscoverGender, updateMePreview, updateBioCount, viewProfile
});

renderMyProfile();
refreshAll();
startRealtime(); // a partir daqui tudo se atualiza sozinho
document.body.classList.remove('auth-pending');
