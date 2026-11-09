// ==========================================================
// NexaMatch — dados simulados
// "likesYou" indica se a pessoa também curte você.
// Quando você curte alguém que também curte você, dá MATCH.
// ==========================================================
const profiles = [
    {
        id: '1', gender: 'mulher', name: 'Ana', age: 24, location: 'Porto Velho, RO',
        bio: 'Dev e apaixonada por tecnologia e café.',
        interests: ['Tecnologia', 'Café', 'Programação', 'Séries'],
        photo: 'https://i.pravatar.cc/800?img=5',
        likesYou: true
    },
    {
        id: '2', gender: 'homem', name: 'Carlos', age: 28, location: 'São Paulo, SP',
        bio: 'Designer UX em busca de novas conexões.',
        interests: ['Design', 'Fotografia', 'Música', 'Viagens'],
        photo: 'https://i.pravatar.cc/800?img=11',
        likesYou: false,
        likesBackAfter: 8000   // simulação: curte você de volta 8s depois que você curtir
    },
    {
        id: '3', gender: 'mulher', name: 'Beatriz', age: 22, location: 'Curitiba, PR',
        bio: 'Amo viajar, ler livros de sci-fi e codar.',
        interests: ['Viagens', 'Sci-fi', 'Leitura', 'Programação'],
        photo: 'https://i.pravatar.cc/800?img=9',
        likesYou: true
    },
    {
        id: '4', gender: 'homem', name: 'Marcos', age: 26, location: 'Rio de Janeiro, RJ',
        bio: 'Focado em cloud computing e esportes radicais.',
        interests: ['Cloud', 'Esportes radicais', 'Trilhas', 'Tecnologia'],
        photo: 'https://i.pravatar.cc/800?img=12',
        likesYou: false,
        likesBackAfter: 15000  // simulação: curte você de volta 15s depois que você curtir
    }
];

// Gêneros disponíveis (para o filtro do Descobrir)
const GENDERS = [
    { id: 'mulher', label: 'Mulheres' },
    { id: 'homem', label: 'Homens' },
    { id: 'outro', label: 'Não-binário e outros' }
];
const ALL_GENDER_IDS = GENDERS.map(g => g.id);

// ---------- Curtidas (salvas no navegador) ----------
const STORAGE_KEY = 'nexamatch:likes';

function loadLikes() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return new Set(saved.filter(id => profiles.some(p => p.id === id)));
    } catch (error) {
        return new Set();
    }
}

function saveLikes() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...likedProfiles]));
    } catch (error) {
        // sem armazenamento disponível: segue só na memória
    }
}

// ---------- Mensagens (salvas no navegador) ----------
const MESSAGES_KEY = 'nexamatch:messages';

function loadMessages() {
    try {
        const saved = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}');
        return { threads: saved.threads || {}, unread: saved.unread || {} };
    } catch (error) {
        return { threads: {}, unread: {} };
    }
}

function saveMessages() {
    try {
        localStorage.setItem(MESSAGES_KEY, JSON.stringify(messageStore));
    } catch (error) {
        // sem armazenamento disponível: segue só na memória
    }
}

// ---------- Quem curtiu de volta (salvo no navegador) ----------
const RECIPROCATED_KEY = 'nexamatch:reciprocated';

function loadReciprocated() {
    try {
        const saved = JSON.parse(localStorage.getItem(RECIPROCATED_KEY) || '[]');
        return new Set(saved.filter(id => profiles.some(p => p.id === id)));
    } catch (error) {
        return new Set();
    }
}

function saveReciprocated() {
    try {
        localStorage.setItem(RECIPROCATED_KEY, JSON.stringify([...reciprocated]));
    } catch (error) {
        // sem armazenamento disponível: segue só na memória
    }
}

// ---------- Notificações (salvas no navegador) ----------
// type: 'like'  = alguém curtiu você
//       'match' = deu match (você sabe exatamente quem foi)
const NOTIFICATIONS_KEY = 'nexamatch:notifications';

function loadNotifications() {
    try {
        const saved = JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]');
        return Array.isArray(saved) ? saved.filter(n => profiles.some(p => p.id === n.profileId)) : [];
    } catch (error) {
        return [];
    }
}

function saveNotifications() {
    try {
        localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
    } catch (error) {
        // sem armazenamento disponível: segue só na memória
    }
}

// ---------- Meu perfil (salvo no navegador) ----------
const PROFILE_KEY = 'nexamatch:myprofile';

function loadMyProfile() {
    const empty = { name: '', age: '', location: '', bio: '', interests: [], photo: '', interestedIn: [...ALL_GENDER_IDS] };
    try {
        const saved = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
        return {
            name: String(saved.name || ''),
            age: saved.age ? Number(saved.age) : '',
            location: String(saved.location || ''),
            bio: String(saved.bio || ''),
            interests: Array.isArray(saved.interests) ? saved.interests.map(String).slice(0, 8) : [],
            photo: String(saved.photo || ''),
            // sem escolha salva: mostra todos os gêneros
            interestedIn: Array.isArray(saved.interestedIn) && saved.interestedIn.some(g => ALL_GENDER_IDS.includes(g))
                ? saved.interestedIn.filter(g => ALL_GENDER_IDS.includes(g))
                : [...ALL_GENDER_IDS]
        };
    } catch (error) {
        return empty;
    }
}

function saveMyProfile() {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(myProfile));
        return true;
    } catch (error) {
        return false; // sem armazenamento (ou foto grande demais)
    }
}

let myProfile = loadMyProfile();
// Primeiro acesso: usa o nome da conta como nome do perfil
const currentUser = window.Auth ? Auth.getCurrentUser() : null;
if (!myProfile.name && currentUser && currentUser.name) {
    myProfile.name = currentUser.name.slice(0, 40);
}
// Idade vem da data de nascimento informada no cadastro
if (!myProfile.age && currentUser && currentUser.birthDate && window.Auth) {
    const accountAge = Auth.ageFromBirthDate(currentUser.birthDate);
    if (accountAge >= 18 && accountAge <= 99) myProfile.age = accountAge;
}
let draftInterests = [...myProfile.interests]; // interesses em edição
let draftPhoto = myProfile.photo;              // foto em edição

const likedProfiles = loadLikes();
const reciprocated = loadReciprocated();
let notifications = loadNotifications();
const likeBackTimers = {};
const messageStore = loadMessages();
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
let typingFor = null;     // quem está "digitando" uma resposta

// Evita que texto digitado vire HTML
function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const findProfile = id => profiles.find(p => p.id === id);
// A pessoa curte você desde o início ou curtiu de volta depois
const likesYouNow = profile => Boolean(profile && (profile.likesYou || reciprocated.has(profile.id)));
const isMatch = id => likedProfiles.has(id) && likesYouNow(findProfile(id));
const getMatches = () => [...likedProfiles].map(findProfile).filter(p => p && likesYouNow(p));
const getPending = () => [...likedProfiles].map(findProfile).filter(p => p && !likesYouNow(p));

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
    saveMyProfile();
    renderProfiles();
}

function renderProfiles() {
    if (!grid) return;
    grid.innerHTML = '';
    updateDiscoverFilter();

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
                <div class="location-tag">${profile.location}</div>
            </div>
            <div class="card-info">
                <h2>${profile.name} <span>${profile.age}</span></h2>
                <p>${profile.bio}</p>
                <div class="actions">
                    <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver Perfil</button>
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

// Contador no menu
function updateBadge() {
    if (!matchesBadge) return;
    const total = getMatches().length;
    matchesBadge.textContent = total > 0 ? total : '';
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
function handleLike(id) {
    if (likedProfiles.has(id)) return;

    const profile = findProfile(id);
    if (!profile) return;

    likedProfiles.add(id);
    saveLikes();

    const matched = likesYouNow(profile);

    if (matched) {
        // a pessoa já curtia você: dá match na hora
        startMatch(profile, true);
    } else {
        // simulação: algumas pessoas curtem de volta depois de um tempo
        scheduleLikeBack(profile);
    }

    refreshAll();

    if (matched) {
        showToast(`Deu match com ${profile.name}!`, 'Ver matches', goToMatches);
    } else {
        showToast(`Você curtiu ${profile.name}. Agora é esperar a resposta.`);
    }
}

// Registra o match: aviso com o nome da pessoa e conversa liberada
function startMatch(profile, readNow) {
    if (!(messageStore.threads[profile.id] || []).length) {
        addMessage(profile.id, 'them', `Oi! Vi que a gente curte ${profile.interests[0].toLowerCase()}. Como foi seu dia?`, true);
    }
    addNotification('match', profile.id, readNow);
    markNotificationRead('like', profile.id);
}

// Simulação: a pessoa curte você de volta depois de alguns segundos
function scheduleLikeBack(profile) {
    if (!profile.likesBackAfter || likesYouNow(profile) || likeBackTimers[profile.id]) return;

    likeBackTimers[profile.id] = setTimeout(() => {
        delete likeBackTimers[profile.id];
        if (!likedProfiles.has(profile.id)) return; // você cancelou a curtida

        reciprocated.add(profile.id);
        saveReciprocated();
        startMatch(profile, false);
        refreshAll();

        showToast(`${profile.name} curtiu você de volta. Deu match!`, 'Ver aviso', goToNotifications);
    }, profile.likesBackAfter);
}

function removeLike(id) {
    if (!likedProfiles.has(id)) return;

    const profile = findProfile(id);
    likedProfiles.delete(id);
    saveLikes();

    clearTimeout(likeBackTimers[id]);
    delete likeBackTimers[id];

    // Sem match, sem conversa
    delete messageStore.threads[id];
    delete messageStore.unread[id];
    saveMessages();
    if (currentChatId === id) currentChatId = null;
    if (typingFor === id) typingFor = null;

    // o aviso de match some; se a pessoa ainda curte você, volta o aviso de curtida
    notifications = notifications.filter(n => !(n.type === 'match' && n.profileId === id));
    saveNotifications();
    syncIncomingLikes();

    refreshAll();
    showToast(profile ? `Curtida em ${profile.name} desfeita.` : 'Curtida desfeita.');
}

// ---------- Páginas ----------
function showPage(pageId) {
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
                    ${isMatch(id)
                        ? `<button class="btn-msg btn-msg-lg" onclick="goToMessages('${profile.id}')">Enviar mensagem</button>`
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
// ==========================================================
const unreadNotifications = () => notifications.filter(n => !n.read).length;

// Cria o aviso (sem repetir o mesmo aviso para a mesma pessoa)
function addNotification(type, profileId, read = false) {
    if (notifications.some(n => n.type === type && n.profileId === profileId)) return false;
    notifications.unshift({ type, profileId, time: Date.now(), read });
    saveNotifications();
    return true;
}

function markNotificationRead(type, profileId) {
    notifications.forEach(n => {
        if (n.type === type && n.profileId === profileId) n.read = true;
    });
    saveNotifications();
}

function markAllNotificationsRead() {
    if (!unreadNotifications()) return;
    notifications.forEach(n => { n.read = true; });
    saveNotifications();
    updateNotificationsBadge();
}

function updateNotificationsBadge() {
    if (!notificationsBadge) return;
    const total = unreadNotifications();
    notificationsBadge.textContent = total > 0 ? total : '';
}

// Quem já curte você aparece nos avisos, mesmo antes de você curtir de volta
function syncIncomingLikes() {
    profiles.forEach(profile => {
        if (profile.likesYou && !likedProfiles.has(profile.id)) {
            addNotification('like', profile.id, false);
        }
    });
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
    const items = notifications
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
// Mensagens — só quem deu match pode conversar
// ==========================================================
const getThread = id => messageStore.threads[id] || [];
const getLastMessage = id => getThread(id).slice(-1)[0] || null;
const totalUnread = () => Object.values(messageStore.unread).reduce((sum, n) => sum + n, 0);

const isMessagesPageVisible = () => {
    const page = document.getElementById('page-mensagens');
    return Boolean(page) && page.style.display === 'block';
};

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function addMessage(id, from, text, markUnread = false) {
    if (!messageStore.threads[id]) messageStore.threads[id] = [];
    messageStore.threads[id].push({ from, text, time: Date.now() });

    // mensagem recebida em uma conversa que não está na tela
    const chatOnScreen = isMessagesPageVisible() && currentChatId === id;
    if (from === 'them' && (markUnread || !chatOnScreen)) {
        messageStore.unread[id] = (messageStore.unread[id] || 0) + 1;
    }
    saveMessages();
}

function updateMessagesBadge() {
    if (!messagesBadge) return;
    const total = totalUnread();
    messagesBadge.textContent = total > 0 ? total : '';
}

// Quando a pessoa responde (simulado)
function buildReply(profile, count) {
    const interest = profile.interests[count % profile.interests.length].toLowerCase();
    const replies = [
        `Que legal! Eu curto muito ${interest}. E você?`,
        'Haha, boa! Me conta mais sobre isso.',
        'Estou gostando de conversar com você. Que tal marcar um café?',
        `Por aqui em ${profile.location} está tudo bem. E por aí?`
    ];
    return replies[count % replies.length];
}

function scheduleReply(id) {
    if (typingFor === id) return; // já está digitando
    const profile = findProfile(id);
    if (!profile) return;

    typingFor = id;
    updateThread();

    setTimeout(() => {
        if (typingFor !== id) return; // conversa foi desfeita
        typingFor = null;

        if (!isMatch(id)) return;

        const theirCount = getThread(id).filter(m => m.from === 'them').length;
        addMessage(id, 'them', buildReply(profile, theirCount));
        updateThread();
        renderChatList();
        updateMessagesBadge();

        const chatOnScreen = isMessagesPageVisible() && currentChatId === id;
        if (!chatOnScreen) {
            showToast(`${profile.name} respondeu.`, 'Ver conversa', () => goToMessages(id));
        }
    }, 1800);
}

// Monta a tela de mensagens
function renderMessages() {
    if (!messagesContent) return;
    updateMessagesBadge();

    const matches = getMatches();

    // Sem matches: mensagens bloqueadas
    if (!matches.length) {
        currentChatId = null;
        messagesContent.innerHTML = `
            <div class="empty-state">
                <h2>Mensagens liberadas só após o match</h2>
                <p>Você só pode trocar mensagens com quem curtiu você de volta. Curte perfis no Descobrir e, quando houver match, a conversa começa aqui.</p>
                <button class="btn-primary" onclick="backToDiscover()">Descobrir pessoas</button>
            </div>
        `;
        return;
    }

    // Se a conversa aberta deixou de ser um match, fecha
    if (currentChatId && !isMatch(currentChatId)) currentChatId = null;

    // Cria a estrutura uma vez só
    if (!document.getElementById('chat-shell')) {
        messagesContent.innerHTML = `
            <div class="chat-shell" id="chat-shell">
                <aside class="chat-list" id="chat-list"></aside>
                <section class="chat-window" id="chat-window"></section>
            </div>
        `;
    }

    renderChatList();
    renderChatWindow();
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    const shell = document.getElementById('chat-shell');
    if (!list || !shell) return;

    shell.classList.toggle('chat-open', Boolean(currentChatId));

    // conversas mais recentes primeiro
    const matches = getMatches().sort((a, b) => {
        const timeA = getLastMessage(a.id)?.time || 0;
        const timeB = getLastMessage(b.id)?.time || 0;
        return timeB - timeA;
    });

    const pending = getPending();

    list.innerHTML = matches.map(profile => {
        const last = getLastMessage(profile.id);
        const unread = messageStore.unread[profile.id] || 0;
        const preview = last
            ? (last.from === 'me' ? 'Você: ' : '') + escapeHtml(last.text)
            : 'Comece a conversa';

        return `
            <button class="chat-item ${currentChatId === profile.id ? 'active' : ''}" onclick="openChat('${profile.id}')">
                <img src="${profile.photo}" alt="Foto de ${profile.name}">
                <span class="chat-item-info">
                    <strong>${profile.name}</strong>
                    <span class="${unread ? 'unread' : ''}">${preview}</span>
                </span>
                <span class="chat-item-meta">
                    ${last ? `<small>${formatTime(last.time)}</small>` : ''}
                    ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
                </span>
            </button>
        `;
    }).join('') + (pending.length
        ? `<p class="chat-note">${pending.length === 1 ? '1 pessoa que você curtiu ainda não deu' : pending.length + ' pessoas que você curtiu ainda não deram'} match. As mensagens liberam quando a curtida for recíproca.</p>`
        : '');
}

function renderChatWindow() {
    const win = document.getElementById('chat-window');
    if (!win) return;

    // guarda o que a pessoa já estava digitando
    const typed = document.getElementById('chat-input')?.value || '';

    const profile = currentChatId ? findProfile(currentChatId) : null;

    if (!profile) {
        win.innerHTML = `
            <div class="chat-placeholder">
                <h2>Suas conversas</h2>
                <p>Escolha um match na lista para começar a conversar.</p>
            </div>
        `;
        return;
    }

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

        <div class="chat-thread" id="chat-thread"></div>

        <form class="chat-form" onsubmit="sendMessage(event)">
            <input id="chat-input" type="text" placeholder="Escreva uma mensagem para ${profile.name}" autocomplete="off" maxlength="500">
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
    const messages = getThread(currentChatId);

    let html = messages.length
        ? ''
        : `<p class="thread-empty">Você e ${profile.name} deram match. Mande a primeira mensagem.</p>`;

    html += messages.map(m => `
        <div class="bubble ${m.from === 'me' ? 'me' : 'them'}">
            <span>${escapeHtml(m.text)}</span>
            <small>${formatTime(m.time)}</small>
        </div>
    `).join('');

    if (typingFor === currentChatId) {
        html += '<div class="bubble them typing" aria-label="Digitando"><i></i><i></i><i></i></div>';
    }

    thread.innerHTML = html;
    thread.scrollTop = thread.scrollHeight;
}

function scrollThreadToEnd() {
    const thread = document.getElementById('chat-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
}

function openChat(id) {
    // Regra principal: só conversa quem deu match
    if (!isMatch(id)) {
        showToast('Você só pode enviar mensagem depois do match.');
        return;
    }

    currentChatId = id;
    delete messageStore.unread[id];
    saveMessages();
    renderMessages();
    scrollThreadToEnd();

    // no computador, deixa o cursor pronto para digitar
    if (window.matchMedia('(min-width: 861px)').matches) {
        document.getElementById('chat-input')?.focus();
    }
}

function closeChat() {
    currentChatId = null;
    renderMessages();
}

function sendMessage(event) {
    event.preventDefault();

    const input = document.getElementById('chat-input');
    const text = input ? input.value.trim() : '';
    if (!text || !currentChatId || !isMatch(currentChatId)) return;

    addMessage(currentChatId, 'me', text);
    input.value = '';
    updateThread();
    renderChatList();
    scheduleReply(currentChatId);
}

// Abre a conversa com alguém (botões "Mensagem")
function goToMessages(id) {
    if (!isMatch(id)) {
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
                        <button type="button" class="me-link-btn" onclick="removeMyPhoto()">Remover foto</button>
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

                        <section class="me-step">
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
                                    <div class="input-wrap no-icon">
                                        <input id="me-age-input" type="number" min="18" max="99" inputmode="numeric"
                                               placeholder="18+" value="${escapeHtml(myProfile.age)}">
                                    </div>
                                </label>
                            </div>

                            <label class="field">
                                <span>Cidade</span>
                                <div class="input-wrap">
                                    ${meIcon('pin')}
                                    <input id="me-location-input" type="text" maxlength="60" autocomplete="address-level2"
                                           placeholder="Ex.: Porto Velho, RO" value="${escapeHtml(myProfile.location)}">
                                </div>
                            </label>
                        </section>

                        <section class="me-step">
                            <div class="me-step-head">
                                <i>2</i>
                                <div><h3>Sobre você</h3><p>Uma frase boa vale mais que um texto longo.</p></div>
                            </div>

                            <label class="field">
                                <span>Bio <small id="me-bio-count">${myProfile.bio.length}/200</small></span>
                                <textarea id="me-bio-input" rows="4" maxlength="200"
                                          placeholder="Conte um pouco sobre você"
                                          oninput="document.getElementById('me-bio-count').textContent = this.value.length + '/200'">${escapeHtml(myProfile.bio)}</textarea>
                            </label>
                        </section>

                        <section class="me-step">
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

                            <div class="me-suggest">
                                ${INTEREST_SUGGESTIONS.map(item => `<button type="button" onclick="quickInterest('${item}')">+ ${item}</button>`).join('')}
                            </div>
                        </section>

                        <div class="me-save-bar">
                            <p>Confira a prévia ao lado e salve quando estiver pronto.</p>
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
                                <p>Apaga seu perfil, curtidas, mensagens e avisos deste navegador.</p>
                            </div>
                            <button type="button" class="btn-ghost btn-danger" onclick="resetAppData()">Apagar meus dados</button>
                        </div>
                    </section>
                </div>

                <aside class="me-preview-col">
                    <p class="me-preview-label"><span class="live-dot"></span>Prévia ao vivo · como te veem</p>
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
function saveProfileForm(event) {
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

    myProfile = {
        name, age, location, bio,
        interests: [...draftInterests],
        photo: draftPhoto,
        interestedIn: [...myProfile.interestedIn]
    };

    if (saveMyProfile()) {
        showToast('Perfil salvo!');
    } else {
        showToast('Não deu para salvar neste navegador (a foto pode estar grande demais).');
    }
    updateProfileSummary();
    renderProfiles(); // o Descobrir passa a mostrar só os gêneros escolhidos
}

// ----- Sair da conta -----
function logoutUser() {
    Auth.logout('login.html');
}

// ----- Apagar tudo -----
// ----- Janela de confirmação (substitui o confirm() do navegador) -----
function askConfirm({ title, message, items = [], confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
    return new Promise(resolve => {
        const previousFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal ${danger ? 'danger' : ''}" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-text">
                <div class="modal-icon">${meIcon(danger ? 'trash' : 'check')}</div>
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

async function resetAppData() {
    const ok = await askConfirm({
        title: 'Apagar todos os seus dados?',
        message: 'Isso não pode ser desfeito. Vai sumir tudo que está salvo neste navegador:',
        items: ['Seu perfil e sua foto', 'Curtidas e matches', 'Mensagens', 'Avisos'],
        confirmText: 'Sim, apagar tudo',
        cancelText: 'Cancelar',
        danger: true
    });
    if (!ok) return;

    try {
        [PROFILE_KEY, STORAGE_KEY, MESSAGES_KEY, RECIPROCATED_KEY, NOTIFICATIONS_KEY]
            .forEach(key => localStorage.removeItem(key));
    } catch (error) {
        // sem armazenamento: só recarrega
    }
    location.reload();
}


// Inicia a aplicação
renderMyProfile();
syncIncomingLikes();
getPending().forEach(scheduleLikeBack); // curtidas que ainda aguardam resposta
refreshAll();
