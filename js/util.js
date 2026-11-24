/* util.js — helper condivisi: escaping, DOM, fetch, tempo, costanti di dominio, bus eventi, tooltip */

/* ── Escaping / DOM ─────────────────────────────────────────────── */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Unico punto di escaping per testo remoto inserito in stringhe HTML. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Consente solo URL http(s); altrimenti '#'. */
export function safeUrl(u) {
    try {
        const url = new URL(String(u), location.href);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
    } catch { return '#'; }
}

/**
 * Mini hyperscript. Il testo passa sempre da textContent (mai innerHTML).
 * attrs: class, text, dataset, style (oggetto), on<Evento>, href (validato) e attributi normali.
 */
export function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
        for (const [k, v] of Object.entries(attrs)) {
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k === 'text') el.textContent = v;
            else if (k === 'dataset') Object.assign(el.dataset, v);
            else if (k === 'style' && typeof v === 'object') {
                for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
            }
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'href') el.setAttribute('href', safeUrl(v));
            else el.setAttribute(k, v === true ? '' : v);
        }
    }
    for (const c of children.flat()) {
        if (c == null || c === false) continue;
        el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* ── Fetch tollerante + cache condivisa ─────────────────────────── */
const inflight = new Map();   // path → Promise (richieste in corso condivise)
const cached = new Map();     // path → { t, data }

/**
 * Scarica un JSON con URL RELATIVO (funziona sotto sottocartella). Ritorna i dati oppure null: non lancia mai.
 * - richieste concorrenti allo stesso path condividono una sola fetch
 * - ttl (ms): riusa il risultato già scaricato se più recente (un solo fetch per ciclo di refresh)
 * - revalidate: cache 'no-cache' → richiesta condizionale (If-None-Match / If-Modified-Since), 304 se invariato
 */
export function fetchJSON(path, { revalidate = false, bust = false, ttl = 0 } = {}) {
    const c = cached.get(path);
    if (ttl && c && Date.now() - c.t < ttl) return Promise.resolve(c.data);
    if (inflight.has(path)) return inflight.get(path);
    const p = (async () => {
        try {
            const res = await fetch(path, { cache: revalidate || bust ? 'no-cache' : 'default' });
            if (!res.ok) return null;
            const data = await res.json();
            cached.set(path, { t: Date.now(), data });
            return data;
        } catch (e) {
            console.warn('fetchJSON fallito:', path, e.message);
            return null;
        } finally { inflight.delete(path); }
    })();
    inflight.set(path, p);
    return p;
}

/** Esegue fn al massimo ogni `ms` (trailing) — usato per hover/resize. */
export function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ── Matematica / formattazione ─────────────────────────────────── */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

/** Accetta ISO8601 oppure epoch (secondi o millisecondi). Ritorna Date o null. */
export function parseTime(v) {
    if (v == null || v === '') return null;
    let d;
    if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v);
    else d = new Date(v);
    return isNaN(d) ? null : d;
}

export function timeAgo(v, now = Date.now()) {
    const d = parseTime(v);
    if (!d) return '';
    const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
    if (s < 45) return 'adesso';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min fa`;
    const hh = Math.round(m / 60);
    if (hh < 48) return `${hh} h fa`;
    return `${Math.round(hh / 24)} g fa`;
}

export function fmtDateTime(v) {
    const d = parseTime(v);
    return d ? d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
export function fmtTime(v, withSeconds = false) {
    const d = parseTime(v);
    return d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) }) : '';
}

/* ── Dominio: severità ──────────────────────────────────────────── */
export const SEVERITY = {
    minimal: { label: 'Minima', color: '#64748b', rank: 0 },
    low: { label: 'Bassa', color: '#22c55e', rank: 1 },
    moderate: { label: 'Moderata', color: '#eab308', rank: 2 },
    high: { label: 'Alta', color: '#f97316', rank: 3 },
    severe: { label: 'Grave', color: '#ef4444', rank: 4 },
};
export const sevInfo = (band) => SEVERITY[band] || SEVERITY.minimal;
export const bandFromSeverity = (s) => (s < 2 ? 'minimal' : s < 4 ? 'low' : s < 6 ? 'moderate' : s < 8 ? 'high' : 'severe');

/* ── Dominio: settori GICS (etichette italiane) ─────────────────── */
export const SECTOR_LABELS = {
    energy: 'Energia',
    materials: 'Materiali',
    industrials: 'Industriali',
    consumer_discretionary: 'Beni di consumo ciclici',
    consumer_staples: 'Beni di consumo primari',
    health_care: 'Sanità',
    financials: 'Finanziari',
    information_technology: 'Tecnologia',
    communication_services: 'Comunicazioni',
    utilities: 'Pubblica utilità',
    real_estate: 'Immobiliare',
};
export const SECTOR_KEYS = Object.keys(SECTOR_LABELS);
const SECTOR_ALIAS = {
    technology: 'information_technology', tech: 'information_technology', it: 'information_technology',
    healthcare: 'health_care', health: 'health_care',
    communication: 'communication_services', communications: 'communication_services', telecom: 'communication_services',
    consumer_cyclical: 'consumer_discretionary', consumer_defensive: 'consumer_staples',
    utility: 'utilities', realestate: 'real_estate',
};
export function normSector(k) {
    const n = String(k || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    return SECTOR_ALIAS[n] || n;
}
/** Etichetta italiana del settore; `fallback` = label dal file dati. */
export function sectorLabel(key, fallback) {
    return SECTOR_LABELS[normSector(key)] || fallback || String(key).replace(/_/g, ' ');
}

/* ── Dominio: regioni (per rischio e filtri) ────────────────────── */
export const REGIONS = [
    { key: 'EU', label: 'Europa', icon: '🇪🇺' },
    { key: 'ME', label: 'Medio Oriente', icon: '🕌' },
    { key: 'AS', label: 'Asia-Pacifico', icon: '🌏' },
    { key: 'AM', label: 'Americhe', icon: '🌎' },
    { key: 'AF', label: 'Africa', icon: '🌍' },
];
const REGION_CODES = {
    EU: 'AD AL AM AT AX AZ BA BE BG BY CH CY CZ DE DK EE ES EU FI FO FR GB GE GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
    ME: 'AE BH EG IL IQ IR JO KW LB OM PS QA SA SY TR YE',
    AS: 'AF AU BD BN BT CN FJ GU HK ID IN JP KG KH KP KR KZ LA LK MM MN MO MV MY NC NP NZ PF PG PH PK SB SG TH TJ TL TM TO TW UZ VN VU WS',
    AM: 'AG AI AR AW BB BM BO BR BS BZ CA CL CO CR CU CW DM DO EC GD GL GT GY HN HT JM KN KY LC MX NI PA PE PR PY SR SV TT US UY VC VE VG VI',
    AF: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW',
};
export const ISO2_REGION = {};
for (const [region, codes] of Object.entries(REGION_CODES)) codes.split(' ').forEach((c) => { ISO2_REGION[c] = region; });

const REGION_ALIAS = {
    europe: 'EU', europa: 'EU', 'middle east': 'ME', 'medio oriente': 'ME', mena: 'ME',
    asia: 'AS', 'asia-pacifico': 'AS', 'asia pacific': 'AS', 'asia-pacific': 'AS', oceania: 'AS', oceania_: 'AS',
    americas: 'AM', america: 'AM', americhe: 'AM', 'north america': 'AM', 'south america': 'AM', 'latin america': 'AM',
    'nord america': 'AM', 'sud america': 'AM', africa: 'AF',
};
export const regionLabel = (key) => (REGIONS.find((r) => r.key === key) || {}).label || key;

/** Regione di un paese: usa c.region se presente (normalizzata), altrimenti la mappa iso2. */
export function regionOfCountry(c) {
    if (!c) return null;
    if (c.region) {
        const r = REGION_ALIAS[String(c.region).toLowerCase().trim()];
        if (r) return r;
        if (REGIONS.some((x) => x.key === c.region)) return c.region;
    }
    return ISO2_REGION[String(c.iso2 || '').toUpperCase()] || null;
}

/* ── Bus eventi minimale ────────────────────────────────────────── */
const listeners = new Map();
export const bus = {
    on(evt, fn) { (listeners.get(evt) || listeners.set(evt, []).get(evt)).push(fn); },
    emit(evt, payload) { (listeners.get(evt) || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(`bus ${evt}:`, e); } }); },
};

/* ── Tooltip flottante condiviso (html già escapato dal chiamante) ── */
let tipEl = null;
function ensureTip() {
    if (!tipEl) {
        tipEl = h('div', { class: 'tip', role: 'tooltip' });
        document.body.append(tipEl);
    }
    return tipEl;
}
export const tip = {
    show(html, ev) {
        const el = ensureTip();
        el.innerHTML = html; // html costruito solo con esc()
        el.style.display = 'block';
        this.move(ev);
    },
    move(ev) {
        if (!tipEl || !ev) return;
        const pad = 14, w = tipEl.offsetWidth, hh = tipEl.offsetHeight;
        let x = ev.clientX + pad, y = ev.clientY + pad;
        if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
        if (y + hh > innerHeight - 8) y = ev.clientY - hh - pad;
        tipEl.style.left = `${Math.max(8, x)}px`;
        tipEl.style.top = `${Math.max(8, y)}px`;
    },
    hide() { if (tipEl) tipEl.style.display = 'none'; },
    /** Collega mouseenter/move/leave a un elemento. `htmlFn()` ritorna HTML già escapato. */
    attach(el, htmlFn) {
        el.addEventListener('mouseenter', (e) => tip.show(htmlFn(), e));
        el.addEventListener('mousemove', (e) => tip.move(e));
        el.addEventListener('mouseleave', () => tip.hide());
    },
};

/* ── Toast ──────────────────────────────────────────────────────── */
export function toast(message, { kind = 'info', ms = 4000, action } = {}) {
    let host = document.getElementById('toasts');
    if (!host) { host = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(host); }
    const t = h('div', { class: `toast toast-${kind}` }, h('span', { text: message }));
    if (action) t.append(h('button', { class: 'toast-action', type: 'button', text: action.label, onClick: () => { action.run(); t.remove(); } }));
    host.append(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
}

/* ── Preferenze (localStorage può essere indisponibile) ─────────── */
export const prefs = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage bloccato */ } },
};

/** Colore rischio paese 0..100 → css hsla (null se rischio nullo). */
export function riskColor(risk, alphaBoost = 1) {
    if (!risk || risk <= 0) return null;
    const t = clamp(risk / 100, 0, 1);
    const hue = Math.round(48 * Math.pow(1 - t, 1.3));
    return `hsla(${hue}, 88%, 52%, ${Math.min(1, (0.08 + 0.52 * t * t) * alphaBoost)})`;
}
/** Colore pieno (miscelato con la base) per i cap dei poligoni: evita trasparenze sul globo. */
export function riskMix(risk, base) {
    const col = riskColor(risk);
    if (!col) return base;
    const m = /hsla\((\d+), (\d+)%, (\d+)%, ([\d.]+)\)/.exec(col);
    const [hh, ss, ll, a] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100, Number(m[4])];
    const k = ss * Math.min(ll, 1 - ll);
    const f = (n) => { const q = (n + hh / 30) % 12; return ll - k * Math.max(-1, Math.min(q - 3, 9 - q, 1)); };
    const b = [1, 3, 5].map((i) => parseInt(base.slice(i, i + 2), 16));
    const rgb = [f(0), f(8), f(4)].map((v, i) => Math.round(b[i] * (1 - a) + v * 255 * a));
    return `rgb(${rgb.join(',')})`;
}
export const riskLabel = (r) => (r >= 70 ? 'Critico' : r >= 50 ? 'Alto' : r >= 30 ? 'Medio' : 'Basso');

/* ── Stati vuoti e skeleton condivisi ───────────────────────────── */
/** Stato vuoto: titolo, una frase di spiegazione e (opzionale) un'azione verbo-first. */
export function emptyState(title, text, action) {
    return h('div', { class: 'empty', role: 'status' },
        h('strong', { text: title }), h('p', { text }),
        action && h('button', { class: 'btn', type: 'button', text: action.label, onClick: action.run }));
}
/** Skeleton con la stessa geometria delle card reali. */
export function skeleton(n = 5, cls = 'skel-card') {
    return h('div', { class: 'skeleton-list', 'aria-busy': 'true', 'aria-label': 'Caricamento' },
        Array.from({ length: n }, () => h('div', { class: `skeleton ${cls}` })));
}

/** Modifica un elemento solo se il testo è cambiato (evita reflow inutili). */
export function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
