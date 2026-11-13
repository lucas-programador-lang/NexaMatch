// Link de cada perfil: https://seusite/@username
// - ao abrir "Ver perfil" o endereço vira o link da pessoa (se ela tiver username)
// - quem abre o link entra direto no perfil (se não estiver logado, entra e volta para ele)
// - botão "Copiar link" no perfil; o Voltar do navegador fecha o perfil
(function () {
    const KEY = 'nx_open_profile';
    const pathKey = () => {
        const m = /^\/@([^\/]+)\/?$/.exec(location.pathname);
        if (m) { try { return decodeURIComponent(m[1]).toLowerCase(); } catch (e) { return m[1].toLowerCase(); } }
        return null;
    };
    const usernameOf = id => (window.profileKeyOf ? window.profileKeyOf(id) : '');
    const urlFor = username => location.origin + '/@' + encodeURIComponent(username);

    // guarda o link durante o login (o login redireciona e perde o endereço)
    try {
        const k = pathKey();
        if (k) {
            sessionStorage.setItem(KEY, k);
        } else {
            const s = sessionStorage.getItem(KEY);
            if (s) history.replaceState(null, '', '/@' + encodeURIComponent(s));
        }
    } catch (e) { /* sem sessionStorage: só não volta sozinho depois do login */ }

    const pageEl = () => document.getElementById('page-perfil-pessoa');
    const profileOpen = () => { const p = pageEl(); return !!p && p.style.display === 'block'; };
    const clearKey = () => { try { sessionStorage.removeItem(KEY); } catch (e) {} };
    const cleanUrl = () => history.replaceState(null, '', '/' + location.search);

    let orig = null;

    function wrap() {
        orig = window.viewProfile;
        window.viewProfile = function (id) {
            orig.apply(this, arguments);
            if (!profileOpen()) return;
            const u = usernameOf(id);
            const path = u ? '/@' + encodeURIComponent(u) : '/';
            if (location.pathname !== path) history.pushState(null, '', path + location.search);
        };
        // perfil fechou (Voltar, menu...) → volta o endereço ao normal
        const p = pageEl();
        if (p) new MutationObserver(() => {
            if (!profileOpen() && pathKey()) cleanUrl();
        }).observe(p, { attributes: true, attributeFilter: ['style'] });
        // botão Copiar link
        const d = document.getElementById('profile-detail');
        if (d) new MutationObserver(addShare).observe(d, { childList: true });
        addShare();
    }

    function currentId() {
        const d = document.getElementById('profile-detail');
        const b = d && d.querySelector('[onclick^="handleLike("]');
        const m = b && /'([^']+)'/.exec(b.getAttribute('onclick'));
        return m ? m[1] : null;
    }

    function addShare() {
        const box = document.querySelector('#profile-detail .profile-actions');
        if (!box || box.querySelector('.btn-share')) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-share';
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>Copiar link';
        btn.onclick = async () => {
            const id = currentId();
            const u = id ? usernameOf(id) : '';
            if (!u) {
                if (window.showToast) window.showToast('Essa pessoa ainda não escolheu um username.');
                return;
            }
            const url = urlFor(u);
            const name = (document.querySelector('#profile-detail .profile-name') || {}).firstChild;
            try {
                if (navigator.share && matchMedia('(hover: none)').matches) {
                    await navigator.share({ title: 'NexaMatch', text: 'Veja o perfil de ' + ((name && name.textContent.trim()) || 'alguém') + ' no NexaMatch', url });
                    return;
                }
            } catch (e) { if (e && e.name === 'AbortError') return; }
            try { await navigator.clipboard.writeText(url); }
            catch (e) {
                const t = document.createElement('textarea');
                t.value = url; document.body.appendChild(t); t.select();
                try { document.execCommand('copy'); } catch (e2) {}
                t.remove();
            }
            if (window.showToast) window.showToast('Link do perfil copiado!');
        };
        box.appendChild(btn);
    }

    // botão Voltar / Avançar do navegador
    window.addEventListener('popstate', () => {
        if (!orig) return;
        const key = pathKey();
        const r = key && window.resolveProfileKey ? window.resolveProfileKey(key) : null;
        if (r && r.id) orig(r.id);
        else if (profileOpen() && window.goBack) window.goBack();
    });

    // espera o app carregar (login + perfis do Firebase) e abre o perfil do link
    let tries = 0;
    const timer = setInterval(() => {
        tries++;
        if (!orig && typeof window.viewProfile === 'function') wrap();
        const key = pathKey();
        const r = orig && key && window.resolveProfileKey ? window.resolveProfileKey(key) : null;
        if (r && r.me) {                       // é o seu próprio link: abre Meu Perfil
            const links = document.querySelectorAll('nav a');
            if (links[4]) links[4].click();
            cleanUrl(); clearKey(); clearInterval(timer); return;
        }
        if (r && r.id && !profileOpen()) window.viewProfile(r.id);
        if (orig && (!key || profileOpen())) { clearKey(); clearInterval(timer); return; }
        if (tries > 60) {                      // ~18 s: perfil não existe ou saiu da plataforma
            clearInterval(timer); clearKey();
            if (key) { cleanUrl(); if (window.showToast) window.showToast('Esse perfil não está disponível.'); }
        }
    }, 300);
})();
