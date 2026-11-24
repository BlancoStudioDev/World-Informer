/* app.js — bootstrap: tema, viste mappa, tab, bottom sheet, scorciatoie da tastiera, caricamento dati e auto-refresh */
import { $, $$, bus, prefs, toast } from './util.js';
import { createGlobe, createFlatMap, applyTheme, isDark } from './globe.js';
import * as news from './news.js';
import * as markets from './markets.js';
import * as layers from './layers.js';
import * as panels from './panels.js';
import { initWidgets } from './widgets.js';
import { initLive, isLiveOpen, closeLive } from './live.js';

const REFRESH_MS = 60 * 1000;
const NARROW = '(max-width: 820px)';
let G = null;
let F = null;
let is3D = true;

/* Stub no-op: se WebGL non è disponibile i layer continuano a funzionare sulla mappa piatta. */
const noop = new Proxy(function () { }, { get: () => noop, apply: () => noop });

/* ── Tema ───────────────────────────────────────────────────────── */
const SUN = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
const MOON = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';

function paintThemeButton() {
    const dark = isDark();
    $('#themeIcon').innerHTML = dark ? SUN : MOON;   // markup statico locale (nessun dato remoto)
    $('#themeToggle').setAttribute('aria-label', dark ? 'Passa al tema chiaro' : 'Passa al tema scuro');
}
function initTheme() {
    applyTheme(prefs.get('theme', 'dark') !== 'light');
    paintThemeButton();
    $('#themeToggle').addEventListener('click', () => { applyTheme(!isDark()); paintThemeButton(); });
}

/* ── Vista 3D / piatta (Leaflet scaricato solo alla prima apertura) ── */
function initMapToggle() {
    const btn = $('#mapToggle');
    btn.addEventListener('click', async () => {
        const next = !is3D;
        if (!next) {      // → piatta
            btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
            const ok = await F.show();
            btn.removeAttribute('aria-busy'); btn.disabled = false;
            if (!ok) { toast('Mappa 2D non disponibile al momento. Controlla la connessione e riprova.', { kind: 'warn' }); return; }
            $('#globe').hidden = true; $('#flatmap').hidden = false;
            G.setActive(false);
            layers.onFlatShown();
        } else {          // → globo
            $('#flatmap').hidden = true; $('#globe').hidden = false;
            layers.onFlatHidden();
            G.setActive(true);
        }
        is3D = next;
        btn.textContent = is3D ? 'Mappa 2D' : 'Globo 3D';
        btn.setAttribute('aria-pressed', String(!is3D));
        F.resize?.();
    });
}

function flyTo({ lat, lng, altitude = 1.5, zoom = 5 }) {
    if (is3D) G.flyTo(lat, lng, altitude);
    else F.flyTo(lat, lng, zoom);
}

/* ── Tab laterali ───────────────────────────────────────────────── */
let marketsDirty = true;
let reportAt = 0;
let currentTab = 'news';

function renderMarketsIfVisible() {
    if (currentTab !== 'markets') { marketsDirty = true; return; }
    markets.renderRiskStrip(); markets.renderMarkets(); marketsDirty = false;
}

function selectTab(name, { focus = false } = {}) {
    currentTab = name;
    $$('.tab').forEach((t) => {
        const on = t.dataset.tab === name;
        t.classList.toggle('on', on);
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
    });
    $$('.panel').forEach((p) => { p.hidden = p.id !== `panel-${name}`; });
    if (name === 'markets' && marketsDirty) { markets.renderRiskStrip(); markets.renderMarkets(); marketsDirty = false; }
    if (name === 'telegram' && !telegramStarted) startTelegram();
    if (name === 'report' && Date.now() - reportAt > 60000) {
        reportAt = Date.now();
        panels.loadReportInto($('#reportView'), $('#reportInlineTs'));
    }
    if (matchMedia(NARROW).matches && $('#sidebar').dataset.sheet === 'peek') setSheet('half');
}
let telegramStarted = false;
function startTelegram() {
    telegramStarted = true;
    panels.renderTelegram();
    panels.loadTelegram();
    setInterval(() => { if (!document.hidden) panels.loadTelegram(); }, 2 * REFRESH_MS);
}
function initTabs() {
    const tabs = $$('.tab');
    tabs.forEach((t, i) => {
        t.addEventListener('click', () => selectTab(t.dataset.tab));
        t.addEventListener('keydown', (e) => {
            let n = -1;
            if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
            else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') n = 0;
            else if (e.key === 'End') n = tabs.length - 1;
            if (n >= 0) { e.preventDefault(); selectTab(tabs[n].dataset.tab, { focus: true }); }
        });
    });
    bus.on('tab', (n) => selectTab(n));
    $$('.subnav [data-cat]').forEach((b) => b.addEventListener('click', () => panels.setNewsView(b.dataset.cat)));
    $('#telegramSearch')?.addEventListener('input', (() => { let t; return (e) => { clearTimeout(t); t = setTimeout(() => panels.setTelegramQuery(e.target.value), 150); }; })());
}

/* ── Bottom sheet (mobile) ──────────────────────────────────────── */
const SHEETS = ['peek', 'half', 'full'];
function setSheet(s) { $('#sidebar').dataset.sheet = s; }
function initSheet() {
    const handle = $('#sheetHandle');
    let y0 = null;
    const step = (d) => {
        const i = SHEETS.indexOf($('#sidebar').dataset.sheet);
        setSheet(SHEETS[Math.max(0, Math.min(SHEETS.length - 1, i + d))]);
    };
    handle.addEventListener('pointerdown', (e) => { y0 = e.clientY; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointerup', (e) => {
        if (y0 == null) return;
        const dy = e.clientY - y0; y0 = null;
        if (dy < -24) step(1); else if (dy > 24) step(-1);
        else { const cur = $('#sidebar').dataset.sheet; setSheet(cur === 'full' ? 'peek' : cur === 'peek' ? 'half' : 'full'); }
    });
    handle.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); step(1); }
        if (e.key === 'ArrowDown') { e.preventDefault(); step(-1); }
    });
    if (matchMedia(NARROW).matches) setSheet('peek');
}

/* ── Pannello layer ─────────────────────────────────────────────── */
function initLayerPanel() {
    const panel = $('#layers'), btn = $('#layersToggle');
    const set = (open) => { panel.classList.toggle('collapsed', !open); btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => set(panel.classList.contains('collapsed')));
    set(!matchMedia(NARROW).matches);
    const sum = () => { const n = Object.values(layers.state).filter(Boolean).length; $('#layersSum').textContent = n ? `${n} attiv${n === 1 ? 'o' : 'i'}` : 'nessuno'; };
    $$('.layer-toggle').forEach((b) => b.addEventListener('click', () => setTimeout(sum, 0)));
    sum();
}

/* ── Caricamento dati ───────────────────────────────────────────── */
let refreshing = false;
async function refreshData({ manual = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    const btn = $('#statusBtn');
    btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true');
    try {
        // un solo giro di fetch condivisi: events.json è scaricato una volta e distribuito ai moduli via bus
        const [nOk, mOk] = await Promise.all([news.loadEvents(), markets.loadMarkets()]);
        if (!mOk) await markets.loadConflictsFallback();
        if (manual) toast(nOk ? 'Dati aggiornati' : 'Aggiornamento non riuscito: riprovo tra poco', { kind: nOk ? 'info' : 'warn', ms: 2500 });
    } finally {
        refreshing = false;
        btn.classList.remove('busy'); btn.removeAttribute('aria-busy');
    }
    news.updateClock();
}

/* ── Tastiera ───────────────────────────────────────────────────── */
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
function focusSearch() {
    selectTab('news');
    panels.setNewsView('all');
    if (matchMedia(NARROW).matches) setSheet('full');
    const input = $('#newsSearch');
    input?.focus(); input?.select();
}
function initKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
        const typing = isTyping(e.target);
        if (e.key === 'Escape') {
            if (!$('#reportModal').hidden) return;            // gestito dal modale
            if (typing && e.target.value) { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); return; }
            if (typing) { e.target.blur(); return; }
            if (isLiveOpen()) { closeLive(); return; }
            if (news.store.selectedId) { news.closeDetail(); return; }
            if (!$('#issCard').hidden) { $('#issClose').click(); return; }
            return;
        }
        if (typing) return;
        if (e.key === '/') { e.preventDefault(); focusSearch(); }
        else if (e.key === 'j' || e.key === 'J') { e.preventDefault(); news.stepSelection(1); }
        else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); news.stepSelection(-1); }
        else if (e.key === '?') toast('Scorciatoie: J / K evento successivo o precedente · / cerca · Esc chiude', { ms: 5000 });
    });
}

async function main() {
    initTheme();

    try { G = createGlobe($('#globe')); } catch (e) {
        console.error('Globo 3D non disponibile:', e);
        G = noop;
        toast('Globo 3D non disponibile: uso la mappa piatta', { kind: 'warn', ms: 6000 });
    }
    F = createFlatMap($('#flatmap'));
    if (location.search.includes('debug')) window.__wi = { get G() { return G; }, get F() { return F; }, layers, news };
    G.setTheme(isDark());

    initMapToggle();
    initTabs();
    initSheet();
    initLayerPanel();
    initKeyboard();
    news.initNewsUI();
    panels.initReport();
    initWidgets();
    initLive();

    $('#detailClose').addEventListener('click', news.closeDetail);
    $('#statusBtn').addEventListener('click', () => refreshData({ manual: true }));

    bus.on('fly', flyTo);
    bus.on('retry', () => refreshData({ manual: true }));
    bus.on('region-filter', (key) => { news.toggleRegionFilter(key); selectTab('news'); });
    bus.on('news:selected', ({ event, fly }) => {
        document.body.classList.toggle('has-detail', !!event);
        if (event && fly) flyTo({ lat: event.lat, lng: event.lng, altitude: 1.35, zoom: 6 });
        if (event && matchMedia(NARROW).matches) setSheet('peek');
    });
    bus.on('news:changed', () => { renderMarketsIfVisible(); news.updateClock(); });
    bus.on('news:filtered', () => { if (currentTab === 'markets') markets.renderRiskStrip(); else marketsDirty = true; });
    bus.on('news:tick', news.updateClock);
    bus.on('markets:changed', renderMarketsIfVisible);

    news.renderFeed();                 // skeleton finché i dati non arrivano

    // confini paesi ed eventi/mercati partono in parallelo (events.json: una sola fetch condivisa)
    await Promise.all([layers.initLayers({ globe: G, flat: F }), refreshData()]);
    $('#globeSkel')?.remove();

    // refresh periodici: si fermano a scheda nascosta e riprendono alla riapertura
    setInterval(() => { if (!document.hidden) refreshData(); }, REFRESH_MS);
    setInterval(news.updateClock, 15000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - news.store.fetchedAt > REFRESH_MS) refreshData(); });
}

main().catch((e) => { console.error(e); toast(`Errore di avvio: ${e.message}`, { kind: 'warn', ms: 8000 }); });
