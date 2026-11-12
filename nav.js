// nav.js — menu com indicador deslizante (computador e celular).
// Mede o item ativo e escreve --ind-x / --ind-w no <nav>; o CSS faz a pílula deslizar até lá.
// É independente do script.js (que espera o login) e, se falhar, o menu continua funcionando.
(function () {
    'use strict';

    const nav = document.querySelector('header nav');
    if (!nav) return;

    // luz que segue o mouse (só aparece em quem tem mouse)
    const spot = document.createElement('i');
    spot.className = 'nx-spot';
    spot.setAttribute('aria-hidden', 'true');

    // a pílula que desliza
    const indicator = document.createElement('i');
    indicator.className = 'nx-ind';
    indicator.setAttribute('aria-hidden', 'true');

    // por último, para não mexer na ordem dos links (regras :nth-child dos ícones)
    nav.appendChild(spot);
    nav.appendChild(indicator);

    const badgeText = new Map();
    let frame = 0;
    let lastActive = null;
    let lastX = null;

    function jelly() {
        indicator.classList.remove('nx-moving');
        void indicator.offsetWidth; // reinicia a animação
        indicator.classList.add('nx-moving');
    }

    indicator.addEventListener('animationend', event => {
        if (event.animationName === 'nxJelly') indicator.classList.remove('nx-moving');
    });

    function place() {
        frame = 0;
        const active = nav.querySelector('a.active');
        nav.classList.toggle('nx-none', !active);
        if (!active || !active.offsetWidth) return; // menu oculto: não dá para medir

        const x = active.offsetLeft;
        nav.style.setProperty('--ind-x', x + 'px');
        nav.style.setProperty('--ind-w', active.offsetWidth + 'px');

        if (!nav.classList.contains('nx-ready')) {
            // primeira posição sem animação; depois liga o deslizar
            indicator.classList.add('nx-still');
            nav.classList.add('nx-ready');
            requestAnimationFrame(() => requestAnimationFrame(() => indicator.classList.remove('nx-still')));
        } else if (!indicator.classList.contains('nx-still') &&
                   (active !== lastActive || Math.abs(x - lastX) > 8)) {
            jelly(); // trocou de aba: a pílula "estica" no caminho
        }
        lastActive = active;
        lastX = x;

        // contador: dá uma "pulada" quando o número muda
        nav.querySelectorAll('.nav-badge').forEach(badge => {
            const text = badge.textContent.trim();
            if (badgeText.get(badge) !== text) {
                if (badgeText.has(badge) && text) {
                    badge.classList.remove('nx-pop');
                    void badge.offsetWidth;
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

    // a luz acompanha o ponteiro dentro da barra
    nav.addEventListener('pointermove', event => {
        if (event.pointerType === 'touch') return;
        const box = nav.getBoundingClientRect();
        nav.style.setProperty('--mx', (event.clientX - box.left) + 'px');
    });

    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('load', schedule);
    if (window.ResizeObserver) new ResizeObserver(schedule).observe(nav);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);

    schedule();
})();
