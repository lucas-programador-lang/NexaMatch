// Descobrir: um card por vez.
// Arrastar para a DIREITA = curtir · para a ESQUERDA = não curtir (passa para a próxima pessoa).
(function () {
    const grid = document.getElementById('profiles-grid');
    if (!grid || grid.parentNode.classList.contains('swipe-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'swipe-wrap';
    grid.parentNode.insertBefore(wrap, grid);
    wrap.appendChild(grid);

    const bar = document.createElement('div');
    bar.className = 'swipe-bar';
    bar.innerHTML =
        '<button type="button" class="swipe-act pass" aria-label="Não curtir"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        '<button type="button" class="swipe-act chat" aria-label="Enviar mensagem"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-4.6A8 8 0 1 1 21 12z"/></svg></button>' +
        '<button type="button" class="swipe-act like" aria-label="Curtir"><svg viewBox="0 0 24 24"><path d="M12 20.5S3.5 15.4 3.5 9.3A4.8 4.8 0 0 1 12 6.6a4.8 4.8 0 0 1 8.5 2.7c0 6.1-8.5 11.2-8.5 11.2z"/></svg></button>';
    const count = document.createElement('div');
    count.className = 'swipe-count';
    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.textContent = 'Arraste para a direita para curtir · para a esquerda para passar';
    const end = document.createElement('div');
    end.className = 'swipe-end';
    end.hidden = true;
    end.innerHTML = '<h2>Você viu todo mundo por agora</h2><p>Quem você curtiu aparece em Meus Matches. Gente nova entra aqui sozinha.</p><button type="button" class="btn-primary">Rever quem passei</button>';
    wrap.append(bar, count, hint, end);

    const [passBtn, chatBtn, likeBtn] = bar.children;
    const skipped = new Set();          // quem você passou (vale até recarregar a página)
    let index = 0, busy = false;

    const idOf = c => {
        const m = /'([^']+)'/.exec((c.querySelector('.btn-view') || {}).getAttribute?.('onclick') || '');
        return m ? m[1] : '';
    };
    const cards = () => [...grid.querySelectorAll(':scope > .card')].filter(c => !skipped.has(idOf(c)) && !c.querySelector('.btn-like.liked'));
    const all = () => [...grid.querySelectorAll(':scope > .card')];
    const cur = () => cards()[index];

    function show(enter) {
        const list = cards();
        all().forEach(c => { c.classList.remove('is-current', 'is-next', 'is-enter'); });
        const hasCards = all().length > 0;
        const finished = hasCards && !list.length;
        grid.hidden = finished;
        end.hidden = !finished;
        bar.hidden = count.hidden = hint.hidden = !list.length;
        if (index >= list.length) index = Math.max(0, list.length - 1);
        list.forEach((c, i) => {
            c.classList.toggle('is-current', i === index);
            c.classList.toggle('is-next', i === index + 1);
            c.style.transition = c.style.transform = c.style.opacity = '';
        });
        const c = list[index];
        if (enter && c) { void c.offsetWidth; c.classList.add('is-enter'); }
                count.textContent = list.length ? (index + 1) + ' / ' + list.length : '';
    }

    // o Firebase redesenha a lista sozinho: mantém a pessoa atual
    new MutationObserver(() => show(false)).observe(grid, { childList: true });
    show(false);
    end.querySelector('button').onclick = () => { skipped.clear(); index = 0; show(true); };

    function fly(card, dir, after) {
        busy = true;
        card.style.transition = 'transform .3s ease-in, opacity .3s';
        card.style.transform = 'translateX(' + (dir * window.innerWidth) + 'px) rotate(' + (dir * 20) + 'deg)';
        card.style.opacity = '0';
        setTimeout(() => { busy = false; after(); show(true); }, 300);
    }
    function like() {
        const c = cur(); if (!c || busy) return;
        const id = idOf(c);
        if (id && !c.querySelector('.btn-like.liked') && typeof window.handleLike === 'function') window.handleLike(id);
        fly(c, 1, () => { if (id) skipped.add(id); });   // curtida sai do baralho; a próxima assume o lugar
    }
    function pass() {
        const c = cur(); if (!c || busy) return;
        const id = idOf(c);
        fly(c, -1, () => { if (id) skipped.add(id); });   // a próxima pessoa assume o mesmo lugar
    }
    likeBtn.onclick = like;
    passBtn.onclick = pass;
    chatBtn.onclick = () => {
        const c = cur();
        if (c && typeof window.goToMessages === 'function') window.goToMessages(idOf(c));
    };
    document.addEventListener('keydown', e => {
        if (!grid.offsetParent || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
        if (e.key === 'ArrowRight') like();
        if (e.key === 'ArrowLeft') pass();
    });

    // arrastar (mouse e dedo)
    let down = false, moved = false, sx = 0, sy = 0, dx = 0, card = null, sL = null, sN = null;
    grid.addEventListener('pointerdown', e => {
        if (busy || (e.pointerType === 'mouse' && e.button !== 0)) return;
        card = cur();
        if (!card || !card.contains(e.target)) return;
        down = true; moved = false; sx = e.clientX; sy = e.clientY; dx = 0;
    });
    window.addEventListener('pointermove', e => {
        if (!down) return;
        const x = e.clientX - sx, y = e.clientY - sy;
        if (!moved) {
            if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) { down = false; return; } // rolagem vertical
            if (Math.abs(x) < 6) return;
            moved = true; grid.classList.add('is-dragging');
            card.classList.remove('is-enter'); card.style.transition = 'none';
            sL = document.createElement('div'); sL.className = 'swipe-stamp like'; sL.textContent = 'CURTI';
            sN = document.createElement('div'); sN.className = 'swipe-stamp nope'; sN.textContent = 'PASSO';
            card.append(sL, sN);
        }
        dx = x;
        card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
        const k = Math.min(1, Math.abs(dx) / 100);
        sL.style.opacity = dx > 0 ? k : 0;
        sN.style.opacity = dx < 0 ? k : 0;
    });
    function stop() {
        if (!down) return;
        down = false;
        if (!moved) return;
        grid.classList.remove('is-dragging');
        const limit = Math.min(110, grid.clientWidth * 0.25);
        if (Math.abs(dx) > limit) { dx > 0 ? like() : pass(); }
        else {
            card.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)'; card.style.transform = '';
            sL && sL.remove(); sN && sN.remove();
        }
    }
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);

    // arrastou? não abre perfil
    grid.addEventListener('click', e => {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
    grid.addEventListener('dragstart', e => e.preventDefault());
})();
