/* markets.js — impatto mercati (markets.json), colorazione paesi per rischio, global risk strip */
import {
    h, $, clear, esc, fetchJSON, num, clamp, fmtTime, timeAgo, riskColor, riskMix, riskLabel, bus,
    sectorLabel, normSector, REGIONS, emptyState, skeleton,
} from './util.js';
import { store as news, selectEvent } from './news.js';

const MARKETS_URL = 'data/markets.json';
const CONFLICTS_URL = 'data/data_conflicts.json';

export const mkt = {
    doc: null,
    status: 'loading',                 // loading | ok | missing
    byIso: new Map(),                  // iso2 → {risk_score, n_events, name, lat, lng}
    conflicts: [],                     // fallback statico (data_conflicts.json)
    conflictsByName: new Map(),        // nome inglese paese → intensity
    riskOn: true,                      // layer "Rischio paesi" attivo
};

const CONFLICT_RISK = { high: 80, medium: 55, low: 30 };

/* ── Caricamento ────────────────────────────────────────────────── */
export async function loadMarkets() {
    const doc = await fetchJSON(MARKETS_URL, { revalidate: true, ttl: 5000 });
    if (!doc || !Array.isArray(doc.sectors)) {
        if (mkt.status !== 'ok') mkt.status = 'missing';
        bus.emit('markets:changed');
        return false;
    }
    mkt.doc = doc;
    mkt.status = 'ok';
    mkt.byIso = new Map((doc.countries || []).map((c) => [String(c.iso2).toUpperCase(), c]));
    bus.emit('markets:changed');
    return true;
}

/** Fallback: carica data_conflicts.json solo se markets.json non è disponibile. */
export async function loadConflictsFallback() {
    if (mkt.conflicts.length) return;
    const data = await fetchJSON(CONFLICTS_URL);
    if (!Array.isArray(data)) return;
    mkt.conflicts = data;
    mkt.conflictsByName = new Map();
    data.forEach((c) => (c.countries || []).forEach((n) => mkt.conflictsByName.set(n, { intensity: c.intensity, name: c.name })));
    bus.emit('markets:changed');
}

/* ── Paesi: iso2 del poligono + rischio ─────────────────────────── */
const A3_FIX = { NOR: 'NO', FRA: 'FR', KOS: 'XK' };
export function featureIso(f) {
    const p = f.properties || {};
    for (const k of ['ISO_A2', 'WB_A2']) {
        const v = p[k];
        if (v && v !== '-99' && /^[A-Z]{2}$/.test(v)) return v;
    }
    return A3_FIX[p.ADM0_A3] || null;
}

/** {risk, n, name, source:'markets'|'conflicts'|null} per un poligono paese. */
export function countryInfo(f) {
    const p = f.properties || {};
    const iso = featureIso(f);
    const c = iso && mkt.byIso.get(iso);
    if (c) return { risk: num(c.risk_score), n: num(c.n_events), name: c.name || p.NAME || p.ADMIN, source: 'markets' };
    if (mkt.status !== 'ok') {
        const cf = mkt.conflictsByName.get(p.ADMIN);
        if (cf) return { risk: CONFLICT_RISK[cf.intensity] || 30, n: null, name: p.ADMIN, source: 'conflicts', conflict: cf };
    }
    return { risk: 0, n: 0, name: p.ADMIN || p.NAME, source: null };
}

/* Tinta base per paese: 7 sfumature quasi impercettibili (MAPCOLOR7) al posto delle linee di confine,
 * che costerebbero una draw call per anello (≈ 290). Le linee restano solo per i paesi a rischio. */
const tint = (hex, k) => `#${[1, 3, 5].map((i) => Math.max(0, Math.min(255, parseInt(hex.slice(i, i + 2), 16) + k)).toString(16).padStart(2, '0')).join('')}`;
const BASE_DARK = '#1a2133', BASE_LIGHT = '#cdd3de';

/** Aggiunge alla feature gli accessor di stile usati da globe.gl. */
export function decorateCountry(f) {
    const info = () => (mkt.riskOn ? countryInfo(f) : { risk: 0, n: 0, name: f.properties?.ADMIN });
    const k = ((f.properties?.MAPCOLOR7 || 4) - 4);          // -3..+3
    const baseD = tint(BASE_DARK, k * 4), baseL = tint(BASE_LIGHT, k * -4);
    f.__cap = (dark) => riskMix(info().risk, dark ? baseD : baseL);
    f.__side = null;
    f.__stroke = (dark) => (info().risk > 0 ? riskColor(info().risk, 1.6) : null);
    Object.defineProperty(f, '__alt', { get: () => (mkt.riskOn && info().risk >= 50 ? 0.012 : 0.006), configurable: true });
    f.__label = () => countryTooltip(f);
    return f;
}

export function countryTooltip(f) {
    const i = countryInfo(f);
    if (!mkt.riskOn || !i.name) return '';
    const col = i.risk > 0 ? `hsl(${Math.round(48 * Math.pow(1 - clamp(i.risk / 100, 0, 1), 1.3))}, 90%, 58%)` : '#94a3b8';
    const extra = i.source === 'conflicts'
        ? `<div class="tt-meta">${esc(i.conflict.name)} · intensità ${esc(i.conflict.intensity)} (dati statici)</div>`
        : i.source === 'markets' ? `<div class="tt-meta">${esc(i.n)} ${i.n === 1 ? 'evento' : 'eventi'} in corso</div>`
            : '<div class="tt-meta">Nessun evento rilevante</div>';
    return `<div class="gl-tip"><strong>${esc(i.name)}</strong>
        <span class="tt-badge" style="--c:${col}">Rischio ${Math.round(i.risk)} · ${esc(riskLabel(i.risk))}</span>${extra}</div>`;
}

/** Layer Leaflet dei paesi colorati per rischio. */
export function buildFlatRiskLayer(features) {
    return L.geoJSON(features, {
        style: (f) => {
            const i = countryInfo(f);
            const fill = riskColor(i.risk);
            return { fillColor: fill || 'transparent', fillOpacity: fill ? 1 : 0, color: fill ? riskColor(i.risk, 1.6) : 'rgba(120,130,150,.25)', weight: fill ? 1.2 : 0.4 };
        },
        onEachFeature: (f, layer) => {
            const i = countryInfo(f);
            if (i.risk > 0) layer.bindTooltip(`<strong>${esc(i.name)}</strong><br>Rischio ${Math.round(i.risk)} (${esc(riskLabel(i.risk))})${i.n != null ? `<br>${esc(i.n)} eventi` : ''}`, { sticky: true });
        },
    });
}

/* ── Tab "Mercati" ──────────────────────────────────────────────── */
const TREND = {
    up: { sym: '▲', label: 'in aumento', cls: 'up' },
    down: { sym: '▼', label: 'in calo', cls: 'down' },
    flat: { sym: '▬', label: 'stabile', cls: 'flat' },
};
const scoreColor = (s) => `hsl(${Math.round(150 - clamp(s, 0, 100) * 1.5)}, 78%, 50%)`; // verde → rosso

const openSectors = new Set();
let openInit = false;

export function renderMarkets() {
    const root = $('#marketsView');
    if (!root) return;
    clear(root);
    if (mkt.status === 'loading') { root.append(skeleton(5, 'skel-row')); return; }
    if (mkt.status !== 'ok') {
        root.append(emptyState('Dati di mercato non disponibili', 'Il file data/markets.json non è stato trovato. Il pannello si aggiorna appena la pipeline lo produce.',
            { label: 'Riprova ora', run: () => bus.emit('retry') }));
        return;
    }
    const doc = mkt.doc;
    const sectors = [...doc.sectors].sort((a, b) => num(b.score) - num(a.score));
    if (!openInit) { sectors.slice(0, 2).forEach((s) => openSectors.add(s.sector)); openInit = true; }

    root.append(h('div', { class: 'mk-head' },
        h('h2', { text: 'Impatto sui settori' }),
        h('span', { class: 'muted', title: doc.generated_at, text: doc.generated_at ? `Aggiornato ${fmtTime(doc.generated_at)} · ${timeAgo(doc.generated_at)}` : '' })));
    root.append(h('p', { class: 'hint', text: 'Pressione degli eventi in corso sui settori GICS (0–100). Clicca un settore per vedere gli eventi che lo guidano.' }));

    const list = h('ul', { class: 'sector-list' });
    sectors.forEach((s) => {
        const score = clamp(num(s.score), 0, 100);
        const tr = TREND[s.trend] || TREND.flat;
        const events = (s.top_events || []).map((id) => news.byId.get(id)).filter(Boolean);
        const isOpen = openSectors.has(s.sector);
        const label = sectorLabel(s.sector, s.label);
        const row = h('li', { class: `sector${isOpen ? ' open' : ''}` },
            h('button', {
                class: 'sector-btn', type: 'button', 'aria-expanded': String(isOpen),
                onClick: () => { if (openSectors.has(s.sector)) openSectors.delete(s.sector); else openSectors.add(s.sector); renderMarkets(); },
            },
                h('span', { class: 'sector-name', text: label }),
                h('span', { class: 'gauge', role: 'img', 'aria-label': `${label}: ${Math.round(score)} su 100` },
                    h('i', { style: { width: `${Math.max(2, score)}%`, background: scoreColor(score) } })),
                h('span', { class: 'sector-score', text: String(Math.round(score)) }),
                h('span', { class: `trend ${tr.cls}`, title: `Trend ${tr.label}`, 'aria-label': `trend ${tr.label}`, text: tr.sym })),
            isOpen && h('ul', { class: 'drivers' },
                events.length
                    ? events.slice(0, 4).map((e) => h('li', {},
                        h('button', { class: 'driver', type: 'button', onClick: () => selectEvent(e.id, { fly: true }) },
                            h('span', { class: 'dot', style: { background: `var(--sev-${e.severity_band || 'minimal'})` } }),
                            h('span', { class: 'driver-t', text: e.title }),
                            h('span', { class: 'driver-v', title: 'Impatto su questo settore', text: String(Math.round((e._ss[normSector(s.sector)] ?? 0) * 100)) }))))
                    : h('li', { class: 'muted small', text: 'Nessun evento trainante nella finestra corrente.' })));
        list.append(row);
    });
    root.append(list);

    /* Paesi per rischio */
    const countries = [...(doc.countries || [])].sort((a, b) => num(b.risk_score) - num(a.risk_score)).slice(0, 10);
    root.append(h('div', { class: 'mk-head' }, h('h2', { text: 'Paesi a maggior rischio' })));
    if (!countries.length) { root.append(h('p', { class: 'muted small', text: 'Nessun paese con rischio rilevante.' })); return; }
    const cl = h('ol', { class: 'country-list' });
    countries.forEach((c, i) => {
        const r = clamp(num(c.risk_score), 0, 100);
        cl.append(h('li', {},
            h('button', {
                class: 'country-btn', type: 'button', title: 'Mostra sulla mappa',
                onClick: () => { if (typeof c.lat === 'number' && typeof c.lng === 'number') bus.emit('fly', { lat: c.lat, lng: c.lng, altitude: 1.7, zoom: 5 }); },
            },
                h('span', { class: 'rank', text: String(i + 1) }),
                h('span', { class: 'country-name', text: c.name || c.iso2 }),
                h('span', { class: 'gauge slim', role: 'img', 'aria-label': `rischio ${Math.round(r)}` },
                    h('i', { style: { width: `${Math.max(2, r)}%`, background: scoreColor(r) } })),
                h('span', { class: 'sector-score', text: String(Math.round(r)) }),
                h('span', { class: 'muted small n-ev', text: `${num(c.n_events)} ev.` }))));
    });
    root.append(cl);
}

/* ── Global risk strip (da events.json) ─────────────────────────── */
const LEVELS = [
    { min: 50, label: 'Alto', cls: 'hi' },
    { min: 30, label: 'Medio', cls: 'md' },
    { min: 0, label: 'Basso', cls: 'lo' },
];

export function computeRegionRisk(events) {
    return REGIONS.map((r) => {
        const evs = events.filter((e) => e._region === r.key);
        if (!evs.length) return { ...r, n: 0, critical: 0, avg: 0, level: null };
        const scores = evs.map((e) => e.global_score);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const max = Math.max(...scores);
        const composite = 0.6 * avg + 0.4 * max;
        const critical = evs.filter((e) => e.severity_band === 'high' || e.severity_band === 'severe').length;
        return { ...r, n: evs.length, critical, avg, max, composite, level: LEVELS.find((l) => composite >= l.min) };
    });
}

export function renderRiskStrip() {
    const box = $('#riskItems');
    if (!box) return;
    clear(box);
    if (news.status !== 'ok') { box.append(skeleton(5, 'skel-row')); return; }
    computeRegionRisk(news.events).forEach((r) => {
        const active = news.filters.region === r.key;
        box.append(h('button', {
            class: `risk-chip${active ? ' active' : ''}`, type: 'button', 'aria-pressed': String(active),
            title: r.level ? `Punteggio medio ${r.avg.toFixed(0)}, massimo ${r.max.toFixed(0)}. Clicca per filtrare le notizie.` : 'Nessun evento nella regione',
            onClick: () => bus.emit('region-filter', r.key),
        },
            h('span', { class: 'risk-name', text: r.label }),
            h('span', { class: `risk-badge ${r.level ? r.level.cls : 'na'}`, text: r.level ? r.level.label : 'n/d' }),
            h('span', { class: 'risk-meta', text: `${r.n} ev.` }),
            r.critical > 0 && h('span', { class: 'risk-meta crit', text: `${r.critical} critici` })));
    });
}

