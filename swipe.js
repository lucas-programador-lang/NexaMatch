// Descobrir: arrastar os cards para o lado (mouse) + setas. No celular o dedo já rola sozinho.
(function () {
    const grid = document.getElementById('profiles-grid');
    if (!grid || grid.parentNode.classList.contains('swipe-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'swipe-wrap';
    grid.parentNode.insertBefore(wrap, grid);
    wrap.appendChild(grid);

    const mk = (cls, label, txt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swipe-arrow ' + cls;
        b.setAttribute('aria-label', label);
        b.textContent = txt;
        wrap.appendChild(b);
        return b;
    };
    const prev = mk('prev', 'Anterior', '‹');
    const next = mk('next', 'Próximo', '›');

    const step = () => {
        const c = grid.querySelector('.card');
        return c ? c.getBoundingClientRect().width + 20 : 300;
    };
    prev.onclick = () => grid.scrollBy({ left: -step(), behavior: 'smooth' });
    next.onclick = () => grid.scrollBy({ left: step(), behavior: 'smooth' });

    function updateArrows() {
        const max = grid.scrollWidth - grid.clientWidth - 2;
        prev.hidden = grid.scrollLeft <= 2;
        next.hidden = grid.scrollLeft >= max;
    }
    grid.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    new MutationObserver(updateArrows).observe(grid, { childList: true });
    updateArrows();

    // arrastar com o mouse
    let down = false, moved = false, startX = 0, startLeft = 0, lastX = 0, lastT = 0, vel = 0, raf = 0;

    grid.addEventListener('pointerdown', e => {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        cancelAnimationFrame(raf);
        down = true; moved = false;
        startX = lastX = e.clientX; startLeft = grid.scrollLeft; lastT = performance.now(); vel = 0;
    });
    window.addEventListener('pointermove', e => {
        if (!down) return;
        const dx = e.clientX - startX;
        if (!moved && Math.abs(dx) > 6) { moved = true; grid.classList.add('is-dragging'); }
        if (!moved) return;
        grid.scrollLeft = startLeft - dx;
        const now = performance.now();
        vel = (lastX - e.clientX) / Math.max(1, now - lastT);
        lastX = e.clientX; lastT = now;
    });
    function end() {
        if (!down) return;
        down = false;
        if (!moved) return;
        grid.classList.remove('is-dragging');
        // inércia curta, depois o snap assume
        let v = vel * 16;
        const glide = () => {
            if (Math.abs(v) < 0.5) return;
            grid.scrollLeft += v; v *= 0.93;
            raf = requestAnimationFrame(glide);
        };
        glide();
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // se arrastou, não deixa o clique abrir o perfil
    grid.addEventListener('click', e => {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
    grid.addEventListener('dragstart', e => e.preventDefault());
})();
