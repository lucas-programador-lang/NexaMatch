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
        console.log(`Você curtiu o perfil ID: ${id}`);
        renderProfiles(); 
    }
}

// Controla o botão de "Ver Perfil"
function viewProfile(id) {
    alert(`Abrindo detalhes do perfil ${id}`);
}

// Controla a navegação entre as telas no Menu Superior
function changePage(pageId, element) {
    // Remove a marcação de ativo de todos os links
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
    });
    
    // Marca o link clicado como ativo
    element.classList.add('active');

    // Esconde todo o conteúdo das páginas
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    
    // Mostra apenas a página selecionada
    document.getElementById('page-' + pageId).style.display = 'block';
}

// Inicia a aplicação
renderProfiles();
