// Dados simulados (no futuro virão do Cloudflare Worker)
const profiles = [
    { id: '1', name: 'Ana', age: 24, location: 'Porto Velho, RO', bio: 'Dev e apaixonada por tecnologia e café.', photo: 'https://i.pravatar.cc/400?img=5' },
    { id: '2', name: 'Carlos', age: 28, location: 'São Paulo, SP', bio: 'Designer UX em busca de novas conexões.', photo: 'https://i.pravatar.cc/400?img=11' },
    { id: '3', name: 'Beatriz', age: 22, location: 'Curitiba, PR', bio: 'Amo viajar, ler livros de sci-fi e codar.', photo: 'https://i.pravatar.cc/400?img=9' },
    { id: '4', name: 'Marcos', age: 26, location: 'Rio de Janeiro, RJ', bio: 'Focado em cloud computing e esportes radicais.', photo: 'https://i.pravatar.cc/400?img=12' }
];

// Set para armazenar os IDs dos perfis curtidos
const likedProfiles = new Set();
const grid = document.getElementById('profiles-grid');

// Função para renderizar os perfis na tela
function renderProfiles() {
    grid.innerHTML = ''; // Limpa o grid

    profiles.forEach(profile => {
        const isLiked = likedProfiles.has(profile.id);
        
        // Criação do elemento card
        const card = document.createElement('div');
        card.className = 'card';
        
        // Estrutura interna do card
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

// Função executada ao clicar no botão de like
function handleLike(id) {
    if (!likedProfiles.has(id)) {
        likedProfiles.add(id);
        console.log(`Você curtiu o perfil ID: ${id}`);
        
        // Aqui você chamará a API futuramente:
        // fetch('URL_DO_SEU_WORKER/api/swipe', { method: 'POST', body: JSON.stringify({ to_user_id: id, action: 'like' }) })

        renderProfiles(); // Atualiza a interface
    }
}

// Função simples para o botão "Ver Perfil"
function viewProfile(id) {
    alert(`Abrindo detalhes do perfil ${id}`);
}

// Inicializa a página renderizando os dados
renderProfiles();
