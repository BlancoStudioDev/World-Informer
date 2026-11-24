/* live.js — pannello "Dirette": anteprime statiche, l'iframe YouTube nasce solo al click (max un video attivo) */
import { h, $, bus } from './util.js';

const STREAMS = [
    { id: 'iEpJwprxDdk', title: 'Bloomberg Business News' },
    { id: '-zGuR1qVKrU', title: 'Iran HD Camera' },
    { id: 'gmtlJ_m2r5A', title: 'Camere in Israele, Iran, Siria e Medio Oriente' },
    { id: '4E-iFtUM2kk', title: 'Medio Oriente in tempo reale' },
    { id: '9NyxcX3rhQs', title: 'CNBC Marathon' },
    { id: 'gCNeDWCI0vo', title: 'Al Jazeera English' },
];

let panel, btn, list, playing = null, lastFocus = null, built = false;

function stop() {
    if (!playing) return;
    const { slot, thumb } = playing;
    slot.replaceChildren(thumb);
    slot.closest('.live-card')?.classList.remove('playing');
    playing = null;
}

function play(s, slot, thumb) {
    stop();     // un solo video alla volta
    const frame = h('iframe', {
        src: `https://www.youtube-nocookie.com/embed/${s.id}?autoplay=1&mute=1&rel=0`, title: s.title,
        allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
    });
    slot.replaceChildren(frame);
    slot.closest('.live-card')?.classList.add('playing');
    playing = { slot, thumb };
}

function build() {
    if (built) return;
    built = true;
    STREAMS.forEach((s) => {
        const img = h('img', { alt: '', width: '320', height: '180', decoding: 'async', src: `https://i.ytimg.com/vi/${s.id}/mqdefault.jpg` });
        img.addEventListener('error', () => { img.hidden = true; });
        const thumb = h('button', { class: 'live-thumb', type: 'button', 'aria-label': `Avvia la diretta: ${s.title}` }, img,
            h('span', { class: 'play', 'aria-hidden': 'true' }, h('svg', { viewBox: '0 0 24 24', fill: 'currentColor' }, h('polygon', { points: '8 5 19 12 8 19' }))));
        const slot = h('div', { class: 'live-slot' }, thumb);
        thumb.addEventListener('click', () => play(s, slot, thumb));
        list.append(h('li', { class: 'live-card' }, slot, h('span', { class: 'live-name', text: s.title })));
    });
}

export function isLiveOpen() { return panel && !panel.hidden; }

export function closeLive({ restore = true } = {}) {
    if (!isLiveOpen()) return;
    stop();
    panel.classList.remove('open');
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    if (restore) lastFocus?.focus?.();
}

export function openLive() {
    build();
    lastFocus = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    btn.setAttribute('aria-expanded', 'true');
    $('#liveClose').focus();
}

export function initLive() {
    panel = $('#livePanel'); btn = $('#liveBtn'); list = $('#liveList');
    btn.addEventListener('click', () => (isLiveOpen() ? closeLive() : openLive()));
    $('#liveClose').addEventListener('click', () => closeLive());
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); closeLive(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}
