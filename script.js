// Dados simulados
const profiles = [
    {
        id: '1', name: 'Ana', age: 24, location: 'Porto Velho, RO',
        bio: 'Dev e apaixonada por tecnologia e café.',
        interests: ['Tecnologia', 'Café', 'Programação', 'Séries'],
        photo: 'https://i.pravatar.cc/800?img=5'
    },
    {
        id: '2', name: 'Carlos', age: 28, location: 'São Paulo, SP',
        bio: 'Designer UX em busca de novas conexões.',
        interests: ['Design', 'Fotografia', 'Música', 'Viagens'],
        photo: 'https://i.pravatar.cc/800?img=11'
    },
    {
        id: '3', name: 'Beatriz', age: 22, location: 'Curitiba, PR',
        bio: 'Amo viajar, ler livros de sci-fi e codar.',
        interests: ['Viagens', 'Sci-fi', 'Leitura', 'Programação'],
        photo: 'https://i.pravatar.cc/800?img=9'
    },
    {
        id: '4', name: 'Marcos', age: 26, location: 'Rio de Janeiro, RJ',
        bio: 'Focado em cloud computing e esportes radicais.',
        interests: ['Cloud', 'Esportes radicais', 'Trilhas', 'Tecnologia'],
        photo: 'https://i.pravatar.cc/800?img=12'
    }
];

const likedProfiles = new Set();
const grid = document.getElementById('profiles-grid');
const detail = document.getElementById('profile-detail');
let currentProfileId = null; // perfil aberto na página de detalhe

// Renderiza os perfis na tela principal
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

// Controla o botão de "Curtir"
function handleLike(id) {
    if (!likedProfiles.has(id)) {
        likedProfiles.add(id);
        renderProfiles();
        // Se o perfil dessa pessoa está aberto, atualiza a página dele também
        if (currentProfileId === id) renderProfileDetail(id);
    }
}

// Mostra só uma das páginas
function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    document.getElementById('page-' + pageId).style.display = 'block';
}

// Monta a página de perfil da pessoa
function renderProfileDetail(id) {
    const profile = profiles.find(p => p.id === id);
    if (!profile || !detail) return;

    const isLiked = likedProfiles.has(id);
    const interests = profile.interests
        .map(item => `<span class="chip">${item}</span>`)
        .join('');

    detail.innerHTML = `
        <button class="btn-back" onclick="backToDiscover()">Voltar</button>

        <div class="profile-layout">
            <div class="profile-photo">
                <img src="${profile.photo}" alt="Foto de ${profile.name}">
                <div class="location-tag">${profile.location}</div>
            </div>

            <div class="profile-panel">
                <h2 class="profile-name">${profile.name} <span>${profile.age}</span></h2>
                <p class="profile-location">${profile.location}</p>

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
                    <button class="btn-view" onclick="backToDiscover()">Ver outros perfis</button>
                </div>
            </div>
        </div>
    `;
}

// Abre a PÁGINA do perfil da pessoa (antes abria um modal)
function viewProfile(id) {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;

    currentProfileId = id;
    renderProfileDetail(id);
    showPage('perfil-pessoa');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Volta para o mural de conexões
function backToDiscover() {
    currentProfileId = null;
    showPage('descobrir');

    document.querySelectorAll('nav a').forEach((link, index) => {
        link.classList.toggle('active', index === 0);
    });

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
renderProfiles();
