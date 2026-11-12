// nav.js — indicador deslizante do menu (computador e celular).
// Mede o item ativo e escreve --ind-x / --ind-w no <nav>; o CSS faz a pílula deslizar até lá.
// É independente do script.js (que espera o login) e, se falhar, o menu continua funcionando.
(function () {
    'use strict';

    const nav = document.querySelector('header nav');
    if (!nav) return;

    const indicator = document.createElement('i');
    indicator.className = 'nx-ind';
    indicator.setAttribute('aria-hidden', 'true');
    nav.appendChild(indicator); // por último, para não mexer na ordem dos links (:nth-child)

    const badgeText = new Map();
    let frame = 0;

    function place() {
        frame = 0;
        const active = nav.querySelector('a.active');
        nav.classList.toggle('nx-none', !active);
        if (!active || !active.offsetWidth) return; // menu oculto: não dá para medir

        nav.style.setProperty('--ind-x', active.offsetLeft + 'px');
        nav.style.setProperty('--ind-w', active.offsetWidth + 'px');

        if (!nav.classList.contains('nx-ready')) {
            // primeira posição sem animação; depois liga o deslizar
            indicator.classList.add('nx-still');
            nav.classList.add('nx-ready');
            requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.remove('nx-still')));
        }

        // contador: dá uma "pulada" quando o número muda
        nav.querySelectorAll('.nav-badge').forEach(badge => {
            const text = badge.textContent.trim();
            if (badgeText.get(badge) !== text) {
                if (badgeText.has(badge) && text) {
                    badge.classList.remove('nx-pop');
                    void badge.offsetWidth; // reinicia a animação
                    badge.classList.add('nx-pop');
                }
                badgeText.set(badge, text);
            }
        });
    }

    function schedule() {
        if (!frame) frame = requestAnimationFrame(place);
    }

    // troca de aba (classe .active), contadores aparecendo/sumindo, etc.
    new MutationObserver(schedule).observe(nav, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        characterData: true
    });

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('load', schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(nav);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    schedule();
})();
