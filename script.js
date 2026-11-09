// ==========================================================
// NexaMatch — dados simulados
// "likesYou" indica se a pessoa também curte você.
// Quando você curte alguém que também curte você, dá MATCH.
// ==========================================================
const profiles = [
    {
        id: '1', name: 'Ana', age: 24, location: 'Porto Velho, RO',
        bio: 'Dev e apaixonada por tecnologia e café.',
        interests: ['Tecnologia', 'Café', 'Programação', 'Séries'],
        photo: 'https://i.pravatar.cc/800?img=5',
        likesYou: true
    },
    {
        id: '2', name: 'Carlos', age: 28, location: 'São Paulo, SP',
        bio: 'Designer UX em busca de novas conexões.',
        interests: ['Design', 'Fotografia', 'Música', 'Viagens'],
        photo: 'https://i.pravatar.cc/800?img=11',
        likesYou: false,
        likesBackAfter: 8000   // simulação: curte você de volta 8s depois que você curtir
    },
    {
        id: '3', name: 'Beatriz', age: 22, location: 'Curitiba, PR',
        bio: 'Amo viajar, ler livros de sci-fi e codar.',
        interests: ['Viagens', 'Sci-fi', 'Leitura', 'Programação'],
        photo: 'https://i.pravatar.cc/800?img=9',
        likesYou: true
    },
    {
        id: '4', name: 'Marcos', age: 26, location: 'Rio de Janeiro, RJ',
        bio: 'Focado em cloud computing e esportes radicais.',
        interests: ['Cloud', 'Esportes radicais', 'Trilhas', 'Tecnologia'],
        photo: 'https://i.pravatar.cc/800?img=12',
        likesYou: false,
        likesBackAfter: 15000  // simulação: curte você de volta 15s depois que você curtir
    }
];

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
function renderProfiles() {
    if (!grid) return;
    grid.innerHTML = '';

    profiles.forEach(profile => {
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

    notificationsContent.innerHTML = '<div class="pending-list">' + items.map(({ n, profile }) => {
        const isMatchNote = n.type === 'match';
        const text = isMatchNote
            ? `Deu match com <strong>${profile.name}</strong>!`
            : `<strong>${profile.name}</strong> curtiu você`;
        const action = isMatchNote
            ? `<button class="btn-msg" onclick="goToMessages('${profile.id}')">Mensagem</button>`
            : `<button class="btn-msg" onclick="handleLike('${profile.id}')">Curtir de volta</button>`;

        return `
            <div class="pending-item notification-item ${n.read ? '' : 'unread'}">
                <img src="${profile.photo}" alt="Foto de ${profile.name}" onclick="viewProfile('${profile.id}')">
                <div class="pending-info">
                    <span class="notification-text">${text}</span>
                    <span>${profile.name}, ${profile.age} · ${profile.location} · ${formatNotificationTime(n.time)}</span>
                </div>
                <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver perfil</button>
                ${action}
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

// Inicia a aplicação
syncIncomingLikes();
getPending().forEach(scheduleLikeBack); // curtidas que ainda aguardam resposta
refreshAll();
