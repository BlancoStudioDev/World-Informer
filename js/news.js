/* news.js — layer News da data/events.json: stato, filtri, feed paginato, marker WebGL, pannello dettaglio, auto-refresh a diff */
import {
    h, $, $$, clear, clamp, esc, fetchJSON, num, parseTime, timeAgo, fmtDateTime, fmtTime, tip, toast, bus, debounce,
    sevInfo, SECTOR_LABELS, normSector, sectorLabel, REGIONS, regionLabel, regionOfCountry, emptyState, skeleton, setText,
} from './util.js';

const EVENTS_URL = 'data/events.json';
const FRESH_MS = 60 * 60 * 1000;      // anello pulsante: eventi con first_seen < 1h
const NEW_BADGE_MS = 5 * 60 * 1000;   // badge "NUOVO" dopo un refresh
const PAGE = 50;                      // card renderizzate per volta nel feed
const MAX_RINGS = 15;

export const store = {
    events: [],
    byId: new Map(),
    view: [],                     // eventi filtrati e ordinati (lista corrente)
    status: 'loading',            // loading | ok | missing
    generatedAt: null,
    fetchedAt: 0,
    selectedId: null,
    limit: PAGE,
    filters: { types: new Set(), minSev: 0, region: '', sector: '', q: '', sort: 'score' },
};

/* ── Normalizzazione evento ─────────────────────────────────────── */
const rawSig = (r) => `${r.last_seen}|${r.global_score}|${r.severity_band}|${r.n_sources}|${r.title}`;
function prep(raw) {
    const e = { ...raw };
    e.countries = Array.isArray(e.countries) ? e.countries : [];
    e.articles = Array.isArray(e.articles) ? e.articles : [];
    e.sources = Array.isArray(e.sources) ? e.sources : [];
    e.explanation = Array.isArray(e.explanation) ? e.explanation : [];
    e.severity = num(e.severity);
    e.global_score = num(e.global_score);
    e.confidence = num(e.confidence);
    e._ss = {};
    for (const [k, v] of Object.entries(e.sector_scores || {})) e._ss[normSector(k)] = num(v);
    const primary = [...e.countries].sort((a, b) => num(b.weight) - num(a.weight))[0];
    e._primary = primary || null;
    e._regions = new Set(e.countries.map(regionOfCountry).filter(Boolean));
    e._region = primary ? regionOfCountry(primary) : null;
    e._t = (parseTime(e.first_seen) || new Date(0)).getTime();
    e.hasGeo = typeof e.lat === 'number' && typeof e.lng === 'number' && isFinite(e.lat) && isFinite(e.lng);
    e._text = [e.title, e.summary, e.location_label, e.event_label, ...e.countries.map((c) => c.name), ...e.sources]
        .filter(Boolean).join(' ').toLowerCase();
    e._sig = rawSig(raw);
    return e;
}
const isFresh = (e) => Date.now() - e._t < FRESH_MS;

/* ── Caricamento / diff ─────────────────────────────────────────── */
export async function loadEvents() {
    // un solo fetch condiviso per ciclo di refresh; richiesta condizionale (304 se invariato)
    const doc = await fetchJSON(EVENTS_URL, { revalidate: true, ttl: 5000 });
    store.fetchedAt = Date.now();
    if (!doc || !Array.isArray(doc.events)) {
        if (store.status !== 'ok') { store.status = 'missing'; bus.emit('news:changed'); }
        return false;
    }
    const first = store.status !== 'ok';
    if (!first && doc.generated_at === store.generatedAt && doc.events.length === store.events.length) {
        bus.emit('news:tick');         // niente da ridisegnare: solo età relative e orologio
        return true;
    }

    const prevById = store.byId;
    const added = [];
    store.events = doc.events.map((raw) => {
        const old = prevById.get(raw.id);
        if (old && old._sig === rawSig(raw)) return old;        // identità stabile → card e marker riusati
        const e = prep(raw);
        if (old) e._newAt = old._newAt; else if (!first) { e._newAt = Date.now(); added.push(e); }
        return e;
    });
    store.byId = new Map(store.events.map((e) => [e.id, e]));
    store.generatedAt = doc.generated_at || null;
    store.status = 'ok';
    refreshView();

    if (store.selectedId && !store.byId.has(store.selectedId)) closeDetail();
    bus.emit('news:changed', { added });
    if (!first && added.length) {
        toast(`${added.length} ${added.length === 1 ? 'nuova notizia' : 'nuove notizie'}`, {
            kind: 'new', ms: 6000,
            action: { label: 'Mostra', run: () => { $('#newsFeed')?.scrollTo({ top: 0, behavior: 'smooth' }); bus.emit('tab', 'news'); } },
        });
    }
    return true;
}

/* ── Filtri ─────────────────────────────────────────────────────── */
export function filtersActive() {
    const f = store.filters;
    return f.types.size > 0 || f.minSev > 0 || !!f.region || !!f.sector || !!f.q.trim();
}
function activeFilterCount() {
    const f = store.filters;
    return (f.types.size ? 1 : 0) + (f.minSev > 0 ? 1 : 0) + (f.region ? 1 : 0) + (f.sector ? 1 : 0) + (f.q.trim() ? 1 : 0);
}
export function resetFilters() {
    Object.assign(store.filters, { types: new Set(), minSev: 0, region: '', sector: '', q: '' });
    syncFilterControls();
    onFiltersChanged();
}
export function filteredEvents() {
    const f = store.filters, q = f.q.trim().toLowerCase();
    const list = store.events.filter((e) =>
        (!f.types.size || f.types.has(e.event_type)) &&
        e.severity >= f.minSev &&
        (!f.region || e._regions.has(f.region)) &&
        (!f.sector || (e._ss[f.sector] ?? 0) >= 0.3) &&
        (!q || e._text.includes(q)));
    list.sort(f.sort === 'recent' ? (a, b) => b._t - a._t : (a, b) => b.global_score - a.global_score);
    return list;
}
function refreshView() { store.view = filteredEvents(); }
function onFiltersChanged() {
    refreshView();
    store.limit = PAGE;
    renderFeed({ resetScroll: true });
    bus.emit('news:filtered');
}

/** Filtro regione cliccando la risk strip (secondo click = rimuove il filtro). */
export function toggleRegionFilter(key) {
    store.filters.region = store.filters.region === key ? '' : key;
    syncFilterControls();
    onFiltersChanged();
}

/* ── Marker (globo, WebGL) ──────────────────────────────────────── */
const itemCache = new Map();   // id → item riusato finché l'evento non cambia
const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

function markerSig(e) { return `${e._sig}|${isFresh(e)}`; }
function tipHtml(e) {
    const sev = sevInfo(e.severity_band);
    return `<strong>${esc(e.title)}</strong>
        <span class="tt-loc">${esc(e.location_label || 'Posizione n/d')}</span>
        <span class="tt-badge" style="--c:${sev.color}">${esc(sev.label)}</span>
        <span class="tt-meta">Impatto ${Math.round(e.global_score)} · ${esc(timeAgo(e.first_seen))}</span>`;
}

/** Punti per globe.gl: colore = gravità, raggio = impatto (global_score). */
export function pointItems() {
    const out = [], live = new Set();
    for (const e of store.view) {
        if (!e.hasGeo) continue;
        live.add(e.id);
        let it = itemCache.get(e.id);
        const sig = markerSig(e);
        if (!it || it.sig !== sig) {
            it = {
                kind: 'news', id: e.id, sig, lat: e.lat, lng: e.lng, alt: 0.006, ev: e,
                r: 0.55 + 1.35 * Math.sqrt(clamp(e.global_score, 0, 100) / 100),
                color: sevInfo(e.severity_band).color,
                tip: () => tipHtml(e),
                click: () => selectEvent(e.id, { fly: true, fromMarker: true }),
            };
            itemCache.set(e.id, it);
        }
        out.push(it);
    }
    for (const id of itemCache.keys()) if (!live.has(id)) itemCache.delete(id);
    return out;
}

/** Anelli solo per i "nuovi < 1h" più rilevanti (max 15): gli anelli sono mesh animate, costano. */
export function ringItems() {
    return store.view.filter((e) => e.hasGeo && isFresh(e)).slice().sort((a, b) => b.global_score - a.global_score)
        .slice(0, MAX_RINGS).map((e) => {
            const [r, g, b] = hexRgb(sevInfo(e.severity_band).color);
            return { lat: e.lat, lng: e.lng, maxR: 2.5 + 3 * (e.global_score / 100), fade: (t) => `rgba(${r},${g},${b},${((1 - t) * 0.85).toFixed(2)})` };
        });
}
export const eventHighlight = (id) => {
    const e = store.byId.get(id);
    return e && e.hasGeo ? { lat: e.lat, lng: e.lng, label: e.title } : null;
};

/** Layer Leaflet per la mappa piatta. */
export function buildFlatLayer() {
    const grp = L.layerGroup();
    for (const e of store.view) {
        if (!e.hasGeo) continue;
        const color = sevInfo(e.severity_band).color;
        const m = L.circleMarker([e.lat, e.lng], {
            radius: 3.5 + 8 * Math.sqrt(clamp(e.global_score, 0, 100) / 100), fillColor: color, color: '#fff', weight: 1.2,
            opacity: 0.95, fillOpacity: 0.85, className: isFresh(e) ? 'lf-fresh' : '',
        });
        m.bindTooltip(`<strong>${esc(e.title)}</strong><br>${esc(e.location_label || '')} · ${esc(sevInfo(e.severity_band).label)}`, { direction: 'top', offset: [0, -4] });
        m.on('click', () => selectEvent(e.id, { fly: false, fromMarker: true }));
        m.addTo(grp);
    }
    return grp;
}

/* ── Feed ───────────────────────────────────────────────────────── */
const cardCache = new Map();   // id → { el, sig }

function eventCard(e) {
    const sev = sevInfo(e.severity_band);
    const isNew = !!(e._newAt && Date.now() - e._newAt < NEW_BADGE_MS);
    const fresh = isFresh(e);
    const sig = `${e._sig}|${isNew}|${fresh}`;
    const hit = cardCache.get(e.id);
    if (hit && hit.sig === sig) return hit.el;
    const nSrc = e.n_sources || e.sources.length || 1;
    const card = h('article', {
        class: 'ev-card', tabindex: '0', role: 'button', dataset: { id: e.id }, style: { '--c': sev.color },
        'aria-label': `${e.title}. Gravità ${sev.label}.`,
        onClick: () => selectEvent(e.id, { fly: true }),
        onKeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectEvent(e.id, { fly: true }); } },
    },
        h('div', { class: 'ev-top' },
            h('span', { class: 'sev' }, h('i', { 'aria-hidden': 'true' }), sev.label),
            h('span', { class: 'ev-type', text: e.event_label || e.event_type || 'Evento' }),
            isNew && h('span', { class: 'badge badge-new', text: 'Nuovo' }),
            fresh && !isNew && h('span', { class: 'badge', text: 'Live' }),
            h('span', { class: 'ev-score', title: 'Impatto globale (0–100)', text: String(Math.round(e.global_score)) })),
        h('h3', { text: e.title }),
        h('div', { class: 'ev-foot' },
            h('span', { class: 'ev-age', title: fmtDateTime(e.first_seen), dataset: { t: e.first_seen || '' }, text: timeAgo(e.first_seen) }),
            h('span', { class: 'ev-loc', text: e.location_label || (e.hasGeo ? '' : 'Senza posizione') }),
            h('span', { text: `${nSrc} font${nSrc === 1 ? 'e' : 'i'}` })));
    cardCache.set(e.id, { el: card, sig });
    if (store.selectedId === e.id) card.classList.add('selected');
    return card;
}

let moreObserver = null;
function updateSelectedClass() {
    const feed = $('#newsFeed');
    if (!feed) return;
    $$('.ev-card.selected', feed).forEach((c) => { if (c.dataset.id !== store.selectedId) { c.classList.remove('selected'); c.removeAttribute('aria-current'); } });
    if (store.selectedId) {
        const c = cardCache.get(store.selectedId)?.el;
        if (c && c.isConnected) { c.classList.add('selected'); c.setAttribute('aria-current', 'true'); }
    }
}

export function renderFeed({ resetScroll = false } = {}) {
    const feed = $('#newsFeed'), count = $('#newsCount');
    if (!feed) return;
    const top = resetScroll ? 0 : feed.scrollTop;
    moreObserver?.disconnect();
    if (store.status === 'missing') {
        clear(feed).append(emptyState('Dati non disponibili', 'Non riesco a leggere data/events.json. Riprovo ogni minuto, oppure puoi ricaricare subito.',
            { label: 'Riprova ora', run: () => bus.emit('retry') }));
        setText(count, '0 eventi');
        return;
    }
    if (store.status === 'loading') { clear(feed).append(skeleton(6)); return; }
    const list = store.view;
    setText(count, `${list.length} di ${store.events.length} eventi`);
    const n = activeFilterCount();
    $('#resetFilters')?.toggleAttribute('hidden', n === 0);
    const badge = $('#filtersBadge');
    if (badge) { badge.textContent = String(n); badge.hidden = n === 0; }
    if (!list.length) {
        clear(feed).append(emptyState('Nessun evento corrisponde ai filtri', 'Allarga i filtri o azzerali per vedere tutti gli eventi.',
            { label: 'Azzera filtri', run: resetFilters }));
        return;
    }
    const shown = list.slice(0, store.limit);
    const frag = document.createDocumentFragment();
    shown.forEach((e) => frag.append(eventCard(e)));
    if (shown.length < list.length) {
        const rest = list.length - shown.length;
        const more = h('button', { class: 'btn more', type: 'button', id: 'feedMore', text: `Mostra altri ${Math.min(PAGE, rest)} di ${rest}`, onClick: showMore });
        frag.append(more);
        // caricamento progressivo: quando il bottone entra in vista, aggiunge un'altra pagina
        moreObserver = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) showMore(); }, { root: feed, rootMargin: '200px' });
        queueMicrotask(() => moreObserver && more.isConnected && moreObserver.observe(more));
    }
    clear(feed).append(frag);
    feed.scrollTop = top;
    // elimina dalla cache le card di eventi spariti
    if (cardCache.size > store.events.length + 50) { for (const id of cardCache.keys()) if (!store.byId.has(id)) cardCache.delete(id); }
    updateSelectedClass();
}
function showMore() { store.limit += PAGE; renderFeed(); }

/** Aggiorna le età relative senza ridisegnare il feed. */
export function updateAges() {
    $$('#newsFeed .ev-age').forEach((el) => setText(el, timeAgo(el.dataset.t)));
}

/* ── Controlli filtri ───────────────────────────────────────────── */
function renderTypeChips() {
    const box = $('#typeChips');
    if (!box) return;
    clear(box);
    const counts = new Map();
    store.events.forEach((e) => {
        const c = counts.get(e.event_type) || { label: e.event_label || e.event_type, n: 0 };
        c.n++; counts.set(e.event_type, c);
    });
    store.filters.types.forEach((t) => { if (!counts.has(t)) store.filters.types.delete(t); });
    [...counts.entries()].sort((a, b) => b[1].n - a[1].n).forEach(([type, c]) => {
        const on = store.filters.types.has(type);
        box.append(h('button', {
            class: `chip${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on),
            onClick: () => {
                if (store.filters.types.has(type)) store.filters.types.delete(type); else store.filters.types.add(type);
                renderTypeChips(); onFiltersChanged();
            },
        }, c.label, h('span', { class: 'chip-n', text: String(c.n) })));
    });
}
function syncFilterControls() {
    const f = store.filters;
    const q = $('#newsSearch'); if (q) q.value = f.q;
    const s = $('#minSev'); if (s) s.value = String(f.minSev);
    const o = $('#minSevOut'); if (o) o.textContent = f.minSev > 0 ? `≥ ${f.minSev}` : 'Tutte';
    const r = $('#regionSel'); if (r) r.value = f.region;
    const se = $('#sectorSel'); if (se) se.value = f.sector;
    syncSortButtons();
    renderTypeChips();
}
function syncSortButtons() {
    $$('[data-sort]').forEach((b) => {
        const on = b.dataset.sort === store.filters.sort;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
}

export function initNewsUI() {
    const f = store.filters;
    const reg = $('#regionSel');
    if (reg) REGIONS.forEach((r) => reg.append(h('option', { value: r.key, text: r.label })));
    const sec = $('#sectorSel');
    if (sec) Object.entries(SECTOR_LABELS).forEach(([k, l]) => sec.append(h('option', { value: k, text: l })));

    $('#newsSearch')?.addEventListener('input', debounce((e) => { f.q = e.target.value; onFiltersChanged(); }, 150));
    $('#minSev')?.addEventListener('input', (e) => {
        f.minSev = Number(e.target.value); $('#minSevOut').textContent = f.minSev > 0 ? `≥ ${f.minSev}` : 'Tutte'; onFiltersChanged();
    });
    reg?.addEventListener('change', (e) => { f.region = e.target.value; onFiltersChanged(); });
    sec?.addEventListener('change', (e) => { f.sector = e.target.value; onFiltersChanged(); });
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => { f.sort = b.dataset.sort; syncSortButtons(); onFiltersChanged(); }));
    $('#resetFilters')?.addEventListener('click', resetFilters);
    const ft = $('#filtersToggle'), fb = $('#filtersBody');
    ft?.addEventListener('click', () => {
        const open = ft.getAttribute('aria-expanded') !== 'true';
        ft.setAttribute('aria-expanded', String(open)); fb.hidden = !open;
    });
    $('#detailPrev')?.addEventListener('click', () => stepSelection(-1));
    $('#detailNext')?.addEventListener('click', () => stepSelection(1));
    syncFilterControls();

    bus.on('news:changed', () => { renderTypeChips(); renderFeed(); });
    // le età relative si aggiornano in place: nessun rebuild del feed
    setInterval(() => { if (!document.hidden && store.status === 'ok') updateAges(); }, 30000);
}

/* ── Selezione + pannello dettaglio ─────────────────────────────── */
export function selectEvent(id, { fly = true, fromMarker = false } = {}) {
    const e = store.byId.get(id);
    if (!e) return;
    store.selectedId = id;
    // se la card non è ancora tra quelle renderizzate, estendi la pagina
    const idx = store.view.findIndex((x) => x.id === id);
    if (idx >= store.limit) { store.limit = idx + 1 + 10; renderFeed(); }
    updateSelectedClass();
    const card = cardCache.get(id)?.el;
    if (card && card.isConnected && !fromMarker) card.scrollIntoView({ block: 'nearest' });
    if (card && card.isConnected && fromMarker) card.scrollIntoView({ block: 'nearest' });
    renderDetail(e);
    bus.emit('news:selected', { event: e, fly: fly && e.hasGeo });
}

/** Selezione con tastiera/pulsanti: evento successivo (+1) o precedente (-1) nella lista corrente. */
export function stepSelection(dir) {
    const list = store.view;
    if (!list.length) return;
    let i = list.findIndex((e) => e.id === store.selectedId);
    i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : clamp(i + dir, 0, list.length - 1);
    selectEvent(list[i].id, { fly: true });
}

export function closeDetail() {
    const had = store.selectedId != null;
    store.selectedId = null;
    $('#detail')?.classList.remove('open');
    updateSelectedClass();
    if (had) bus.emit('news:selected', { event: null });
}

function metric(label, value, sub) {
    return h('div', { class: 'metric' }, h('span', { class: 'metric-l', text: label }), h('strong', { text: value }), sub && h('span', { class: 'metric-s', text: sub }));
}

function renderDetail(e) {
    const panel = $('#detail');
    if (!panel) return;
    const sev = sevInfo(e.severity_band);
    const body = $('#detailBody');
    clear(body);

    body.append(
        h('div', { class: 'd-head', style: { '--c': sev.color } },
            h('span', { class: 'sev sev-lg' }, h('i', { 'aria-hidden': 'true' }), sev.label),
            h('span', { class: 'd-type', text: e.event_label || e.event_type || '' })),
        h('h2', { class: 'd-title', id: 'detailTitle', text: e.title }),
        h('div', { class: 'd-sub' },
            h('span', { text: e.location_label || (e.hasGeo ? 'Posizione approssimata' : 'Posizione non individuata') }),
            h('span', { text: `Primo rilevamento ${fmtDateTime(e.first_seen)} (${timeAgo(e.first_seen)})` }),
            e.last_seen && e.last_seen !== e.first_seen && h('span', { text: `Aggiornato ${fmtDateTime(e.last_seen)}` })),
        e.summary && h('p', { class: 'd-summary', text: e.summary }),
        h('div', { class: 'metrics' },
            metric('Gravità', `${e.severity.toFixed(1)}/10`, sev.label),
            metric('Impatto', String(Math.round(e.global_score)), 'su 100'),
            metric('Confidenza', `${Math.round(e.confidence * 100)}%`, `${e.n_sources || e.sources.length} fonti`),
            metric('Persistenza', e.persistence_days != null ? `${e.persistence_days} g` : 'n/d', 'stimata')),
    );

    /* Impatto settoriale */
    const entries = Object.entries(e._ss).sort((a, b) => b[1] - a[1]);
    if (entries.length) {
        const rows = entries.map(([k, v]) => h('li', { class: `bar-row${v >= 0.3 ? ' hit' : ''}` },
            h('span', { class: 'bar-l', text: sectorLabel(k) }),
            h('span', { class: 'bar', role: 'img', 'aria-label': `${sectorLabel(k)} ${Math.round(v * 100)} su 100` },
                h('i', { style: { width: `${Math.max(2, Math.min(100, v * 100))}%` } })),
            h('span', { class: 'bar-v', text: String(Math.round(v * 100)) })));
        body.append(h('section', { class: 'd-sec' }, h('h3', { text: 'Impatto sui settori' }), h('ul', { class: 'bars' }, rows),
            h('p', { class: 'hint', text: 'Evidenziati i settori con impatto ≥ 30.' })));
    }

    if (e.explanation.length) {
        body.append(h('section', { class: 'd-sec' }, h('h3', { text: 'Perché questo punteggio' }),
            h('ul', { class: 'bullets' }, e.explanation.map((x) => h('li', { text: x })))));
    }

    if (e.countries.length) {
        body.append(h('section', { class: 'd-sec' }, h('h3', { text: 'Paesi coinvolti' }),
            h('div', { class: 'chips-static' }, e.countries.map((c) => h('span', { class: 'chip-s', title: regionLabel(regionOfCountry(c)), text: `${c.name || c.iso2}` })))));
    }

    /* Fonti (il titolo dell'articolo può mancare quando coincide con quello dell'evento) */
    const arts = e.articles;
    const srcList = arts.length
        ? arts.map((a) => h('li', {},
            h('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer' }, a.title || e.title || a.url),
            h('span', { class: 'src-meta', text: `${a.source || ''}${a.published_at ? ` · ${fmtDateTime(a.published_at)}` : ''}` })))
        : e.sources.map((s) => h('li', {}, h('span', { text: s })));
    if (srcList.length) body.append(h('section', { class: 'd-sec' }, h('h3', { text: `Fonti (${srcList.length})` }), h('ul', { class: 'sources' }, srcList)));

    if (e.hasGeo) body.append(h('button', { class: 'btn', type: 'button', text: 'Mostra sulla mappa', onClick: () => bus.emit('fly', { lat: e.lat, lng: e.lng, altitude: 1.3, zoom: 6 }) }));

    panel.classList.add('open');
    body.scrollTop = 0;
}

/* ── Orologio "ultimo aggiornamento" ────────────────────────────── */
export function updateClock() {
    const el = $('#lastUpdate'), dot = $('#liveDot');
    if (!el) return;
    if (store.status !== 'ok') {
        el.textContent = store.status === 'missing' ? 'dati non disponibili' : 'caricamento…';
        dot?.classList.toggle('off', store.status === 'missing');
        return;
    }
    const gen = parseTime(store.generatedAt) || new Date(store.fetchedAt);
    const stale = Date.now() - gen.getTime() > 45 * 60 * 1000;
    const label = timeAgo(gen), abs = fmtTime(gen);
    if (el.dataset.k !== `${abs}|${label}`) {
        el.dataset.k = `${abs}|${label}`;
        clear(el).append(h('span', { class: 'status-abs', text: `${abs} · ` }), h('span', { text: label }));
    }
    el.title = `Dati generati: ${gen.toLocaleString('it-IT')} · ultimo controllo ${fmtTime(store.fetchedAt, true)}`;
    dot?.classList.toggle('stale', stale);
    dot?.classList.remove('off');
}
