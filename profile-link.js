// Link para cada perfil: https://seusite/#/u/ID_DA_PESSOA
// - ao abrir "Ver perfil" o endereço muda para o link da pessoa
// - quem abre o link entra direto no perfil (se não estiver logado, entra e volta para ele)
// - botão "Copiar link" no perfil; botão Voltar do navegador fecha o perfil
(function () {
    const KEY = 'nx_open_profile';
    const RE = /^#\/u\/(.+)$/;
    const hashId = () => { const m = RE.exec(location.hash); return m ? decodeURIComponent(m[1]) : null; };
    const linkFor = id => location.origin + location.pathname + '#/u/' + encodeURIComponent(id);

    // guarda o link durante o login (o login redireciona e perde o #)
    try {
        const h = hashId();
        if (h) sessionStorage.setItem(KEY, h);
        else {
            const s = sessionStorage.getItem(KEY);
            if (s) history.replaceState(null, '', '#/u/' + encodeURIComponent(s));
        }
    } catch (e) { /* sem sessionStorage: só não volta sozinho depois do login */ }

    const pageEl = () => document.getElementById('page-perfil-pessoa');
    const profileOpen = () => { const p = pageEl(); return !!p && p.style.display === 'block'; };
    const clearKey = () => { try { sessionStorage.removeItem(KEY); } catch (e) {} };
    const cleanUrl = () => history.replaceState(null, '', location.pathname + location.search);

    let orig = null;

    function wrap() {
        orig = window.viewProfile;
        window.viewProfile = function (id) {
            orig.apply(this, arguments);
            if (profileOpen()) {
                const h = '#/u/' + encodeURIComponent(id);
                if (location.hash !== h) history.pushState(null, '', h);
            }
        };
        // perfil fechou (Voltar, menu...) → tira o link da barra de endereço
        const p = pageEl();
        if (p) new MutationObserver(() => {
            if (!profileOpen() && hashId()) cleanUrl();
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
        return m ? m[1] : hashId();
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
            if (!id) return;
            const url = linkFor(id);
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
        const id = hashId();
        if (id) orig(id);
        else if (profileOpen() && window.goBack) window.goBack();
    });

    // espera o app carregar (login + perfis do Firebase) e abre o perfil do link
    let tries = 0;
    const timer = setInterval(() => {
        tries++;
        if (!orig && typeof window.viewProfile === 'function') wrap();
        const id = hashId();
        if (orig && id && !profileOpen()) window.viewProfile(id);
        if (orig && (!id || profileOpen())) { clearKey(); clearInterval(timer); return; }
        if (tries > 60) {                      // ~18 s: perfil não existe ou saiu da plataforma
            clearInterval(timer); clearKey();
            if (id) { cleanUrl(); if (window.showToast) window.showToast('Esse perfil não está disponível.'); }
        }
    }, 300);
})();
