// Descobrir: um card por vez. Arraste para a direita = próxima pessoa, para a esquerda = anterior.
(function () {
    const grid = document.getElementById('profiles-grid');
    if (!grid || grid.parentNode.classList.contains('swipe-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'swipe-wrap';
    grid.parentNode.insertBefore(wrap, grid);
    wrap.appendChild(grid);

    const bar = document.createElement('div');
    bar.className = 'swipe-bar';
    bar.innerHTML = '<button type="button" class="swipe-arrow" data-d="-1" aria-label="Pessoa anterior">‹</button>' +
        '<span class="swipe-count" aria-live="polite"></span>' +
        '<button type="button" class="swipe-arrow" data-d="1" aria-label="Próxima pessoa">›</button>';
    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.textContent = 'Arraste o card para o lado para ver outras pessoas';
    wrap.append(bar, hint);

    const prevBtn = bar.children[0], count = bar.children[1], nextBtn = bar.children[2];
    let index = 0, busy = false;
    const cards = () => [...grid.querySelectorAll(':scope > .card')];

    function show(enter) {
        const list = cards();
        bar.hidden = hint.hidden = list.length < 2;
        if (index >= list.length) index = Math.max(0, list.length - 1);
        list.forEach((c, i) => {
            c.classList.toggle('is-current', i === index);
            c.classList.toggle('is-next', i === index + 1);
            c.classList.remove('is-enter');
            c.style.transition = c.style.transform = c.style.opacity = '';
        });
        if (enter && list[index]) { void list[index].offsetWidth; list[index].classList.add('is-enter'); }
        prevBtn.disabled = index <= 0;
        nextBtn.disabled = index >= list.length - 1;
        count.textContent = list.length ? (index + 1) + ' / ' + list.length : '';
    }

    // o Firebase redesenha a lista sozinho: mantém a pessoa atual
    new MutationObserver(() => show(false)).observe(grid, { childList: true });
    show(false);

    function go(d, fromX) {
        const list = cards(), to = index + d;
        if (busy || to < 0 || to >= list.length) { show(false); return; }
        const cur = list[index];
        busy = true;
        // direita = próxima, esquerda = anterior
        const out = d > 0 ? 1 : -1;
        cur.style.transition = 'transform .28s ease-in, opacity .28s';
        cur.style.transform = 'translateX(' + (out * window.innerWidth * 0.9) + 'px) rotate(' + (out * 18) + 'deg)';
        cur.style.opacity = '0';
        setTimeout(() => { index = to; busy = false; show(true); }, 280);
    }
    bar.addEventListener('click', e => {
        const b = e.target.closest('.swipe-arrow');
        if (b && !b.disabled) go(Number(b.dataset.d));
    });
    document.addEventListener('keydown', e => {
        if (!grid.offsetParent || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
    });

    // arrastar (mouse e dedo)
    let down = false, moved = false, sx = 0, sy = 0, dx = 0, card = null, locked = false;
    grid.addEventListener('pointerdown', e => {
        if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
        card = grid.querySelector(':scope > .card.is-current');
        if (!card || !card.contains(e.target)) return;
        down = true; moved = false; locked = false; sx = e.clientX; sy = e.clientY; dx = 0;
    });
    window.addEventListener('pointermove', e => {
        if (!down) return;
        const x = e.clientX - sx, y = e.clientY - sy;
        if (!moved) {
            if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { down = false; return; } // rolagem vertical
            if (Math.abs(x) < 6) return;
            moved = true; grid.classList.add('is-dragging');
            card.classList.remove('is-enter'); card.style.transition = 'none';
        }
        dx = x;
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
    });
    function end() {
        if (!down) return;
        down = false;
        if (!moved) return;
        grid.classList.remove('is-dragging');
        const limit = Math.min(110, grid.clientWidth * 0.25);
        if (Math.abs(dx) > limit) go(dx > 0 ? 1 : -1);
        else { card.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)'; card.style.transform = ''; }
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // arrastou? não abre perfil nem curte
    grid.addEventListener('click', e => {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
    grid.addEventListener('dragstart', e => e.preventDefault());
})();
