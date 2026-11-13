// background.js — fundo animado: bolhas de luz e corações subindo devagar.
// Independente do script.js. Se falhar, o site continua com o degradê de fundo.
(function () {
    'use strict';

    if (document.getElementById('bg-fx')) return;

    const layer = document.createElement('div');
    layer.id = 'bg-fx';
    layer.setAttribute('aria-hidden', 'true');

    // pares de cor da marca (ciano, violeta, rosa, coral)
    const palettes = [
        ['#2de2f5', '#8b5cf6'],
        ['#8b5cf6', '#ff4fa3'],
        ['#ff4fa3', '#ff8a5c'],
        ['#2de2f5', '#ff4fa3']
    ];

    const rnd = (min, max) => min + Math.random() * (max - min);
    const small = window.innerWidth < 700;
    const total = small ? 10 : 18;

    for (let i = 0; i < total; i++) {
        const isHeart = i % 4 === 3;               // 1 em cada 4 é um coraçãozinho
        const depth = Math.random();                // 0 = longe (pequeno, apagado) · 1 = perto
        const size = isHeart ? rnd(14, 28) : rnd(34, 150) * (0.55 + depth * 0.6);
        const [from, to] = palettes[Math.floor(rnd(0, palettes.length))];

        const el = document.createElement('i');
        el.className = isHeart ? 'fx-heart' : 'fx-orb';
        el.style.cssText = [
            `--x:${rnd(0, 100).toFixed(1)}%`,
            `--s:${size.toFixed(0)}px`,
            `--sway:${rnd(-70, 70).toFixed(0)}px`,
            `--dur:${rnd(38, 80).toFixed(0)}s`,
            `--delay:-${rnd(0, 80).toFixed(1)}s`,
            `--o:${(isHeart ? rnd(0.35, 0.6) : rnd(0.20, 0.38) + depth * 0.10).toFixed(2)}`,
            `--c1:${from}`,
            `--c2:${to}`
        ].join(';');
        layer.appendChild(el);
    }

    document.body.prepend(layer);
})();
