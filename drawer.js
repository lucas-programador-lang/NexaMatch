// drawer.js — menu lateral (estilo app) que abre pelo avatar no topo.
// É independente do script.js: se algo falhar, o menu de baixo/topo continua funcionando.
// Itens com data-go="pagina" clicam no link real do menu (assim o app segue as mesmas regras de sempre,
// como o aviso de "salvar antes de sair"). Itens com data-action chamam funções do app (sair, copiar link).
(function () {
    'use strict';

    const panel = document.getElementById('dw-panel');
    const scrim = document.getElementById('dw-scrim');
    const opener = document.getElementById('dw-open');
    const nav = document.querySelector('header nav');
    if (!panel || !scrim || !opener || !nav) return;

    const body = document.body;
    let isOpen = false;

    function pageOf(link) {
        const match = /changePage\('([a-z-]+)'/.exec(link.getAttribute('onclick') || '');
        return match ? match[1] : '';
    }

    function linkFor(page) {
        return Array.from(nav.querySelectorAll('a')).find(link => pageOf(link) === page) || null;
    }

    function open() {
        if (isOpen) return;
        isOpen = true;
        body.classList.add('dw-on');
        panel.setAttribute('aria-hidden', 'false');
        opener.setAttribute('aria-expanded', 'true');
        syncActive();
        syncBadges();
        panel.focus({ preventScroll: true });
    }

    function close(restoreFocus = true) {
        if (!isOpen) return;
        isOpen = false;
        body.classList.remove('dw-on');
        panel.setAttribute('aria-hidden', 'true');
        opener.setAttribute('aria-expanded', 'false');
        if (restoreFocus) opener.focus({ preventScroll: true });
    }

    // marca no menu lateral a mesma página que está ativa no menu principal
    function syncActive() {
        const active = nav.querySelector('a.active');
        const page = active ? pageOf(active) : '';
        panel.querySelectorAll('[data-go]').forEach(item => {
            const on = item.getAttribute('data-go') === page;
            item.classList.toggle('is-active', on);
            if (on) item.setAttribute('aria-current', 'page');
            else item.removeAttribute('aria-current');
        });
    }

    // copia os contadores (matches, mensagens, avisos) do menu principal
    function syncBadges() {
        let anyNews = false;
        panel.querySelectorAll('[data-badge]').forEach(badge => {
            const source = document.getElementById(badge.getAttribute('data-badge'));
            const text = source ? source.textContent.trim() : '';
            badge.textContent = text;
            if (text) anyNews = true;
        });
        opener.classList.toggle('has-news', anyNews);
    }

    opener.addEventListener('click', () => (isOpen ? close() : open()));
    scrim.addEventListener('click', () => close());

    panel.addEventListener('click', event => {
        const closeBtn = event.target.closest('[data-dw-close]');
        if (closeBtn) { close(); return; }

        const go = event.target.closest('[data-go]');
        if (go) {
            const link = linkFor(go.getAttribute('data-go'));
            close(false);
            if (link) link.click();
            return;
        }

        const action = event.target.closest('[data-action]');
        if (!action) return;
        const name = action.getAttribute('data-action');
        if (name === 'logout') {
            close(false);
            if (typeof window.logoutUser === 'function') window.logoutUser();
        } else if (name === 'copylink') {
            if (typeof window.copyMyLink === 'function') window.copyMyLink();
        }
        // "sound" é o interruptor de sons: o próprio script.js liga/desliga (onclick no botão)
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isOpen) close();
    });

    // arrastar o menu para a esquerda fecha (celular)
    let startX = null;
    let startY = null;
    panel.addEventListener('touchstart', event => {
        const t = event.touches[0];
        startX = t.clientX;
        startY = t.clientY;
    }, { passive: true });
    panel.addEventListener('touchend', event => {
        if (startX === null) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = Math.abs(t.clientY - startY);
        startX = startY = null;
        if (dx < -70 && dy < 60) close();
    }, { passive: true });

    // mantém tudo em dia: aba ativa e contadores
    const observer = new MutationObserver(() => { syncActive(); syncBadges(); });
    observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true, characterData: true });

    syncActive();
    syncBadges();
})();
