// Dados simulados
const profiles = [
    { id: '1', name: 'Ana', age: 24, location: 'Porto Velho, RO', bio: 'Dev e apaixonada por tecnologia e café.', photo: 'https://i.pravatar.cc/400?img=5' },
    { id: '2', name: 'Carlos', age: 28, location: 'São Paulo, SP', bio: 'Designer UX em busca de novas conexões.', photo: 'https://i.pravatar.cc/400?img=11' },
    { id: '3', name: 'Beatriz', age: 22, location: 'Curitiba, PR', bio: 'Amo viajar, ler livros de sci-fi e codar.', photo: 'https://i.pravatar.cc/400?img=9' },
    { id: '4', name: 'Marcos', age: 26, location: 'Rio de Janeiro, RJ', bio: 'Focado em cloud computing e esportes radicais.', photo: 'https://i.pravatar.cc/400?img=12' }
];

const likedProfiles = new Set();
const grid = document.getElementById('profiles-grid');

// Renderiza os perfis na tela principal
function renderProfiles() {
    if (!grid) return;
    grid.innerHTML = ''; 

    profiles.forEach(profile => {
        const isLiked = likedProfiles.has(profile.id);
        
        const card = document.createElement('div');
        card.className = 'card';
        
        card.innerHTML = `
            <div class="card-image-wrapper">
                <img src="${profile.photo}" alt="Foto de ${profile.name}">
                <div class="location-tag">${profile.location}</div>
            </div>
            <div class="card-info">
                <h2>${profile.name} <span>${profile.age}</span></h2>
                <p>${profile.bio}</p>
                <div class="actions">
                    <button class="btn-view" onclick="viewProfile('${profile.id}')">Ver Perfil</button>
                    <button class="btn-like ${isLiked ? 'liked' : ''}" onclick="handleLike('${profile.id}')">
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
    }
}

// Abre a janela modal com os detalhes do perfil
function viewProfile(id) {
    const profile = profiles.find(p => p.id === id);
    if (!profile) return;

    const modal = document.getElementById('profile-modal');
    const modalBody = document.getElementById('modal-body');
    const isLiked = likedProfiles.has(id);

    modalBody.innerHTML = `
        <img src="${profile.photo}" alt="Foto de ${profile.name}" class="modal-body-img">
        <h2 style="font-size: 1.5rem; margin-bottom: 0.5rem;">${profile.name} <span style="color: var(--text-muted); font-size: 1.2rem;">${profile.age}</span></h2>
        <p style="color: var(--gold); font-weight: 500; margin-bottom: 1rem;">📍 ${profile.location}</p>
        <p style="color: var(--text-main); line-height: 1.5; margin-bottom: 1.5rem;">${profile.bio}</p>
        
        <button class="btn-like ${isLiked ? 'liked' : ''}" style="width: 100%; padding: 0.75rem; font-size: 1rem;" onclick="handleLike('${profile.id}'); closeModal();">
            ${isLiked ? '✔ Perfil Curtido' : '❤ Curtir Perfil'}
        </button>
    `;

    modal.style.display = 'flex';
}

// Fecha a janela modal
function closeModal() {
    document.getElementById('profile-modal').style.display = 'none';
}

// Controla a navegação entre as telas no Menu Superior
function changePage(pageId, element) {
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
    });
    
    element.classList.add('active');

    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    
    document.getElementById('page-' + pageId).style.display = 'block';
}

// Inicia a aplicação
renderProfiles();
