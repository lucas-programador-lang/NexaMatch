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
        likesYou: false
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
        likesYou: false
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

const likedProfiles = loadLikes();
const grid = document.getElementById('profiles-grid');
const detail = document.getElementById('profile-detail');
const matchesContent = document.getElementById('matches-content');
const matchesBadge = document.getElementById('matches-badge');
const toast = document.getElementById('toast');
let currentProfileId = null; // perfil aberto na página de detalhe
let previousPage = 'descobrir'; // de onde a pessoa veio (para o botão Voltar)
let toastTimer = null;

const findProfile = id => profiles.find(p => p.id === id);
const isMatch = id => likedProfiles.has(id) && Boolean(findProfile(id)?.likesYou);
const getMatches = () => [...likedProfiles].map(findProfile).filter(p => p && p.likesYou);
const getPending = () => [...likedProfiles].map(findProfile).filter(p => p && !p.likesYou);

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
                    <div class="actions">
                        <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver perfil</button>
                        <button class="btn-ghost" onclick="removeLike('${profile.id}')">Desfazer</button>
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
    updateBadge();
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
    refreshAll();

    if (profile.likesYou) {
        showToast(`Deu match com ${profile.name}!`, 'Ver matches', goToMatches);
    } else {
        showToast(`Você curtiu ${profile.name}. Agora é esperar a resposta.`);
    }
}

function removeLike(id) {
    if (!likedProfiles.has(id)) return;

    const profile = findProfile(id);
    likedProfiles.delete(id);
    saveLikes();
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
                    <button class="btn-view" onclick="goBack()">${previousPage === 'matches' ? 'Voltar aos matches' : 'Ver outros perfis'}</button>
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

function goBack() {
    currentProfileId = null;
    showPage(previousPage);
    setActiveNav(previousPage === 'matches' ? 1 : 0);
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

// Controla a navegação entre as telas no Menu
function changePage(pageId, element) {
    currentProfileId = null;

    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
    });

    element.classList.add('active');
    showPage(pageId);
}

// Inicia a aplicação
refreshAll();
