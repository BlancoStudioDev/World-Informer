/* layers.js — gestore dei layer: News, Rischio paesi e layer OSINT (FIRMS, terremoti, nucleare, voli, navi, satelliti, GPS jam, radiazioni)
 *
 * Tutti i marker puntuali sono "point items" disegnati in WebGL (vedi globe.js): { lat, lng, alt, r (gradi), color, tip(), click() }.
 * Dati pesanti (FIRMS ~37 MB, TLE dei satelliti) sono elaborati in Web Worker e caricati solo quando il layer viene acceso.
 */
import { h, $, $$, esc, fetchJSON, num, clamp, fmtDateTime, toast, bus, safeUrl, setText } from './util.js';
import * as news from './news.js';
import { mkt, decorateCountry, buildFlatRiskLayer, loadConflictsFallback } from './markets.js';
import { polar2xyz } from './globe.js';

let G = null;   // vista globo
let F = null;   // vista mappa piatta
let countryFeatures = [];
let flatActive = false;

export const state = {
    news: true, risk: true, firms: false, quakes: false, nuclear: false,
    flights: false, ships: false, satellites: false, gpsjam: false, radiation: false,
};
const openExternal = (url) => window.open(safeUrl(url), '_blank', 'noopener,noreferrer');
const absUrl = (p) => new URL(p, location.href).href;

/* ── Definizione layer ──────────────────────────────────────────── */
const defs = {};
function define(def) { defs[def.id] = { status: 'idle', items: [], ...def }; return defs[def.id]; }

function setStatus(def, status, count) {
    def.status = status;
    const btn = $(`#layer-${def.id}`);
    if (!btn) return;
    btn.classList.toggle('loading', status === 'loading');
    btn.classList.toggle('unavailable', status === 'missing');
    btn.setAttribute('aria-busy', String(status === 'loading'));
    setText($('.layer-count', btn), status === 'loading' ? '…' : status === 'missing' ? 'n/d' : count != null ? String(count) : '');
    btn.title = status === 'missing' ? `${def.title || def.label} — dati non disponibili` : (def.title || '');
}
const setCount = (def, n) => setText($(`#layer-${def.id} .layer-count`), String(n));

/** Punti WebGL standard: ogni layer puntuale li produce da def.items. */
const pointsGlobe = (def) => (on) => G.setPoints(def.id, on ? def.points() : []);

/* ── Anelli (≤ 20 in totale: notizie recenti + terremoti forti) ── */
function refreshRings() {
    const rings = [];
    if (state.news) rings.push(...news.ringItems());
    if (state.quakes && defs.quakes.items.length) {
        defs.quakes.items.filter((q) => q.mag >= 5).sort((a, b) => b.mag - a.mag).slice(0, 5)
            .forEach((q) => rings.push({ lat: q.lat, lng: q.lng, maxR: Math.max(2, q.mag * 0.6), fade: (t) => `rgba(255,122,26,${((1 - t) * 0.85).toFixed(2)})` }));
    }
    G.setRings(rings);
}

/* News (marker da events.json) */
define({
    id: 'news', loader: false,
    globe(on) { G.setPoints('news', on ? news.pointItems() : []); refreshRings(); },
    flat(on) { return on ? news.buildFlatLayer() : null; },
});

/* Rischio paesi (poligoni colorati da markets.json, fallback data_conflicts.json) */
define({
    id: 'risk', loader: false,
    globe(on) { mkt.riskOn = on; G.restylePolygons(); },
    flat(on) { return on && countryFeatures.length ? buildFlatRiskLayer(countryFeatures) : null; },
});

/* FIRMS — hotspot termici (download e parsing in worker) */
let frpMin = 100;
const FIRMS_CAP = 3000;
const firmsColor = (frp) => (frp > 50 ? '#ff3228' : frp > 10 ? '#ff6e1e' : '#ffa028');
let firmsWorker = null, firmsQuery = 0;
function firmsTip(d) {
    return `<strong>Hotspot termico</strong><span class="tt-loc">${esc(d.lat.toFixed(2))}, ${esc(d.lng.toFixed(2))}</span>
        <span class="tt-badge" style="--c:#f97316">FRP ${esc(d.frp)} MW</span>
        <span class="tt-meta">${esc(d.confidence ?? '')} · ${esc(d.date ?? '')} ${esc(d.time ?? '')} · ${esc(d.sensor ?? '')}</span>`;
}
function queryFirms(def) {
    return new Promise((resolve) => {
        const id = ++firmsQuery;
        const onMsg = (e) => {
            if (e.data.type !== 'items' || e.data.id !== id) return;
            firmsWorker.removeEventListener('message', onMsg);
            def.items = e.data.items; def.matched = e.data.matched; resolve(true);
        };
        firmsWorker.addEventListener('message', onMsg);
        firmsWorker.postMessage({ type: 'query', min: frpMin, cap: FIRMS_CAP, id });
    });
}
define({
    id: 'firms', group: 'env', label: 'Incendi', title: 'NASA FIRMS — hotspot termici (FRP)',
    async load(def) {
        if (typeof Worker === 'undefined') return false;
        firmsWorker = new Worker('js/workers/firms.worker.js');
        const ok = await new Promise((resolve) => {
            firmsWorker.onmessage = (e) => { if (e.data.type === 'loaded') resolve(true); else if (e.data.type === 'error') resolve(false); };
            firmsWorker.onerror = () => resolve(false);
            firmsWorker.postMessage({ type: 'load', url: absUrl('data/data_firms.json') });
        });
        if (!ok) { firmsWorker.terminate(); firmsWorker = null; return false; }
        return queryFirms(def);
    },
    count: (def) => def.items.length,
    points: () => defs.firms.items.map((f) => ({
        kind: 'fire', lat: f.lat, lng: f.lng, alt: 0.003, r: clamp(0.22 + (f.frp || 0) / 900, 0.22, 0.6), color: firmsColor(f.frp || 0), tip: () => firmsTip(f),
    })),
    globe(on, def) { pointsGlobe(def)(on); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        const renderer = L.canvas();
        def.items.forEach((f) => L.circleMarker([f.lat, f.lng], { renderer, radius: Math.min(5, 1.5 + (f.frp || 0) / 150), fillColor: firmsColor(f.frp), fillOpacity: 0.8, stroke: false })
            .bindTooltip(`<strong>FRP ${esc(f.frp)} MW</strong><br>${esc(f.date ?? '')} ${esc(f.time ?? '')}`).addTo(grp));
        return grp;
    },
});

/* Terremoti USGS (live) */
const quakeColor = (m) => (m >= 6 ? '#ff2a55' : m >= 4.5 ? '#ff7a1a' : '#ffc81e');
define({
    id: 'quakes', group: 'env', label: 'Terremoti', title: 'USGS — terremoti M2.5+ nelle ultime 24h', refreshMs: 5 * 60 * 1000,
    async load(def) {
        const geo = await fetchJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { ttl: 60000 });
        if (!geo || !Array.isArray(geo.features)) return false;
        def.items = geo.features.map((f) => ({
            kind: 'quake', lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], depth: f.geometry.coordinates[2],
            mag: num(f.properties.mag), place: f.properties.place, time: f.properties.time, url: f.properties.url,
        }));
        return true;
    },
    points: () => defs.quakes.items.map((q) => ({
        kind: 'quake', lat: q.lat, lng: q.lng, alt: 0.004, r: clamp(0.35 + q.mag * 0.16, 0.45, 1.5), color: quakeColor(q.mag),
        tip: () => `<strong>Terremoto M${esc(q.mag.toFixed(1))}</strong><span class="tt-loc">${esc(q.place)}</span>
            <span class="tt-meta">Profondità ${esc(Math.round(q.depth))} km · ${esc(fmtDateTime(q.time))}</span><span class="tt-meta">Clicca per i dettagli USGS</span>`,
        click: () => q.url && openExternal(q.url),
    })),
    globe(on, def) { pointsGlobe(def)(on); refreshRings(); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        def.items.forEach((q) => L.circleMarker([q.lat, q.lng], { radius: clamp(q.mag * 2, 3, 12), fillColor: quakeColor(q.mag), color: '#fff', weight: 1, fillOpacity: 0.8 })
            .bindTooltip(`<strong>M${q.mag.toFixed(1)}</strong> · ${esc(q.place)}<br>Profondità ${esc(Math.round(q.depth))} km · ${esc(fmtDateTime(q.time))}`).addTo(grp));
        return grp;
    },
});

/* Impianti nucleari (file statico) */
define({
    id: 'nuclear', group: 'mil', label: 'Nucleare', title: 'Impianti nucleari e siti strategici',
    async load(def) {
        const data = await fetchJSON('data/data_nuclear.json', { ttl: 60000 });
        if (!Array.isArray(data)) return false;
        def.items = data.filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number');
        return true;
    },
    points: () => defs.nuclear.items.map((d) => ({
        kind: 'nuclear', lat: d.lat, lng: d.lng, alt: 0.005, r: 0.7, color: '#facc15',
        tip: () => `<strong>${esc(d.name)}</strong><span class="tt-loc">${esc(d.lat.toFixed(2))}, ${esc(d.lng.toFixed(2))}</span>${d.output ? `<span class="tt-meta">Potenza ${esc(d.output)}</span>` : ''}`,
    })),
    globe(on, def) { pointsGlobe(def)(on); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        def.items.forEach((n) => L.circleMarker([n.lat, n.lng], { radius: 4.5, fillColor: '#facc15', color: '#713f12', weight: 1.2, fillOpacity: 0.95 })
            .bindTooltip(`<strong>${esc(n.name)}</strong>${n.output ? `<br>${esc(n.output)}` : ''}`).addTo(grp));
        return grp;
    },
});

/* Voli militari / emergenza (data/data_flights.json, scaricato lato server) */
const isEmergency = (a) => a.category === 'emergency' || String(a.squawk) === '7700';
const flightTip = (a) => `<strong>${isEmergency(a) ? 'EMERGENZA' : 'MIL'}</strong> ${esc((a.flight || a.hex || '').trim() || 'n/d')}<br>${esc(a.type || '?')} · ${esc(a.alt === 'ground' ? 'a terra' : a.alt != null ? `${a.alt} ft` : '?')} · ${esc(a.gs != null ? `${Math.round(a.gs)} kt` : '?')}`;
define({
    id: 'flights', group: 'mil', skipIfSame: true, label: 'Voli', title: 'Voli militari e in emergenza (adsb.lol)', refreshMs: 60 * 1000,
    async load(def) {
        const doc = await fetchJSON('data/data_flights.json', { revalidate: true, ttl: 20000 });
        const list = Array.isArray(doc) ? doc : doc && doc.aircraft;
        if (!Array.isArray(list)) return false;
        const stamp = doc && doc.timestamp;
        if (def.timestamp && stamp && stamp === def.timestamp && def.items.length) return true;   // invariato: niente rebuild
        def.timestamp = stamp;
        def.items = list.filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number');
        def.changed = true;
        return true;
    },
    points: () => defs.flights.items.map((a) => ({
        kind: 'flight', lat: a.lat, lng: a.lng, alt: 0.01, r: 0.6, color: isEmergency(a) ? '#ff2a2a' : '#ffa31a',
        tip: () => flightTip(a),
        click: () => a.hex && openExternal(`https://globe.adsb.lol/?icao=${encodeURIComponent(a.hex)}`),
    })),
    globe(on, def) { pointsGlobe(def)(on); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        def.items.forEach((a) => {
            const col = isEmergency(a) ? '#ff2a2a' : '#ffa31a';
            L.circleMarker([a.lat, a.lng], { radius: 4, fillColor: col, color: '#fff', weight: 1, fillOpacity: 0.9 })
                .bindTooltip(flightTip(a)).on('click', () => openExternal(`https://globe.adsb.lol/?icao=${encodeURIComponent(a.hex)}`)).addTo(grp);
        });
        return grp;
    },
});

/* Navi: militari + soccorso + forze dell'ordine */
const SHIP_KINDS = {
    military: { label: 'MIL', color: '#94a3c4' },
    rescue: { label: 'SAR', color: '#22d3ee' },
    law: { label: 'POL', color: '#818cf8' },
};
function shipKind(s) {
    const t = `${s.category || ''} ${s.type || ''}`.toLowerCase();
    if (/rescue|\bsar\b|search/.test(t)) return 'rescue';
    if (/law|police|polizia|coast ?guard|customs|patrol|enforcement|guardia/.test(t)) return 'law';
    if (/milit|navy|naval|warship|defen/.test(t)) return 'military';
    return null;
}
const shipTip = (s) => `<strong>${esc(SHIP_KINDS[s.shipKind].label)}</strong> ${esc(s.name || s.mmsi)}<br>${esc(s.type || '')} · ${esc(s.speed != null ? `${s.speed} kt` : 'n/d')}`;
define({
    id: 'ships', group: 'mil', label: 'Navi', title: 'Navi militari, di soccorso e forze dell\'ordine (AIS)', refreshMs: 60 * 1000,
    async load(def) {
        const doc = await fetchJSON('data/data_ships.json', { revalidate: true, ttl: 20000 });
        const list = Array.isArray(doc) ? doc : doc && doc.ships;
        if (!Array.isArray(list)) return false;
        def.items = list.map((s) => ({ s, k: shipKind(s) })).filter((x) => x.k && typeof x.s.lat === 'number' && typeof x.s.lng === 'number')
            .map(({ s, k }) => ({ ...s, shipKind: k }));
        return true;
    },
    points: () => defs.ships.items.map((s) => ({
        kind: 'ship', lat: s.lat, lng: s.lng, alt: 0.007, r: 0.55, color: SHIP_KINDS[s.shipKind].color, tip: () => shipTip(s),
    })),
    globe(on, def) { pointsGlobe(def)(on); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        def.items.forEach((s) => L.circleMarker([s.lat, s.lng], { radius: 4, fillColor: SHIP_KINDS[s.shipKind].color, color: '#fff', weight: 1, fillOpacity: 0.9 })
            .bindTooltip(shipTip(s)).addTo(grp));
        return grp;
    },
});

/* GPS jamming (esagoni come poligoni) */
const jamColor = (pct, a = 0.6) => (pct >= 80 ? `rgba(239,68,68,${a})` : pct >= 40 ? `rgba(245,158,11,${a})` : `rgba(251,191,36,${a * 0.85})`);
define({
    id: 'gpsjam', group: 'mil', label: 'GPS Jam', title: 'Interferenze GNSS / GPS jamming', refreshMs: 120 * 1000,
    async load(def) {
        const data = await fetchJSON('data/data_gpsjam.json', { revalidate: true, ttl: 30000 });
        if (!Array.isArray(data)) return false;
        def.items = data.filter((d) => d.severity !== 'green' && Array.isArray(d.polygon));
        def.features = def.items.map((d) => ({
            // globe.gl (d3-geo) vuole anelli esterni in senso orario: i poligoni del file sono antiorari
            geometry: { type: 'Polygon', coordinates: [[...d.polygon].reverse()] },
            __cap: () => jamColor(d.bad_pct || 0), __stroke: () => jamColor(d.bad_pct || 0, 0.95),
            __alt: 0.008 + ((d.bad_pct || 0) / 100) * 0.03,
            __label: () => `<div class="gl-tip"><strong>Interferenza GPS</strong>
                <span class="tt-badge" style="--c:${jamColor(d.bad_pct || 0, 1)}">${esc((d.bad_pct || 0).toFixed(1))}% incertezza</span>
                <span class="tt-meta">Aerei affetti ${esc(d.bad_ac)} / ${esc(d.total_ac)}</span></div>`,
        }));
        return true;
    },
    globe(on, def) { G.setPolygons('gpsjam', on ? def.features || [] : []); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        def.items.forEach((j) => L.polygon(j.polygon.map((p) => [p[1], p[0]]), { color: jamColor(j.bad_pct || 0, 0.95), weight: 1, fillColor: jamColor(j.bad_pct || 0, 1), fillOpacity: 0.45 })
            .bindTooltip(`<strong>Interferenza GPS</strong><br>${esc((j.bad_pct || 0).toFixed(1))}% · ${esc(j.bad_ac)}/${esc(j.total_ac)} aerei`).addTo(grp));
        return grp;
    },
});

/* Radiazioni — Safecast (letture ultimi 12 mesi, scaricate dal server) */
define({
    id: 'radiation', group: 'env', label: 'Radiazioni', title: 'Safecast — misure di radioattività', refreshMs: 10 * 60 * 1000,
    async load(def) {
        // scaricato lato server (collectors/radiation.py): l'API Safecast non consente fetch dal browser (CORS)
        const data = await fetchJSON('data/data_radiation.json', { ttl: 60000 });
        if (!data || !Array.isArray(data.points) || !data.points.length) return false;
        def.items = data.points.filter((d) => d.lat != null && d.lng != null).map((d) => ({
            lat: d.lat, lng: d.lng, value: num(d.value), unit: d.unit || 'cpm', captured: d.captured,
        }));
        return true;
    },
    points: () => defs.radiation.items.map((d) => ({
        kind: 'radiation', lat: d.lat, lng: d.lng, alt: 0.003, r: 0.4, color: d.value > 50 ? '#e879f9' : '#22d3ee',
        tip: () => `<strong>Sensore radiazioni</strong><span class="tt-meta">${esc(d.value)} ${esc(d.unit)} · ${esc(fmtDateTime(d.captured))}</span>`,
    })),
    globe(on, def) { pointsGlobe(def)(on); },
    flat(on, def) {
        if (!on) return null;
        const grp = L.layerGroup();
        def.items.forEach((r) => L.circleMarker([r.lat, r.lng], { radius: 4, fillColor: r.value > 50 ? '#e879f9' : '#22d3ee', stroke: false, fillOpacity: 0.8 })
            .bindTooltip(`<strong>${esc(r.value)} ${esc(r.unit)}</strong><br>${esc(fmtDateTime(r.captured))}`).addTo(grp));
        return grp;
    },
});

/* ── Satelliti: TLE propagati in un Web Worker, resi come particelle GPU ── */
const SAT_COLORS = {
    starlink: '#22d3ee', oneweb: '#fb923c', iridium: '#c084fc', flock: '#4ade80',
    globalstar: '#f472b6', stations: '#fde047', other: '#8aa4ff',
};
const SAT_INTERVAL = 5000;
let satWorker = null, satMeta = null, satObjs = null, satGroups = null, satXYZ = null, satLLA = null, satPickReady = false;

function satLabel(i) {
    const m = satMeta;
    const km = satLLA ? Math.round(satLLA[i * 3 + 2] * 6371) : '?';
    return `<strong>${esc(m.names[i])}</strong><span class="tt-meta">Quota ${esc(km)} km · inclinazione ${esc(m.incl[i].toFixed(1))}° · periodo ${esc(m.period[i] || '?')} min</span><span class="tt-meta">Clicca per l'orbita</span>`;
}
function onSatPos(lla) {
    const m = satMeta, n = m.n;
    satLLA = lla;
    if (!satObjs) {
        satObjs = new Array(n);
        satGroups = m.groupKeys.map((k) => ({ color: SAT_COLORS[k] || SAT_COLORS.other, members: [], items: [] }));
        for (let i = 0; i < n; i++) {
            satObjs[i] = { i, lat: 0, lng: 0, alt: 0 };
            if (i !== m.iss) satGroups[m.group[i]].members.push(satObjs[i]);
        }
        satXYZ = new Float32Array(n * 3);
        G.world.particlesList('items').particleLat('lat').particleLng('lng').particleAltitude('alt')
            .particlesSize(2.2).particlesSizeAttenuation(false).particlesColor((l) => l.color);
    }
    for (let i = 0; i < n; i++) {
        const o = satObjs[i], lat = lla[i * 3];
        if (lat === lat) {       // non NaN
            o.lat = lat; o.lng = lla[i * 3 + 1]; o.alt = lla[i * 3 + 2];
            polar2xyz(o.lat, o.lng, o.alt, satXYZ, i * 3);
        } else { o.lat = NaN; satXYZ[i * 3] = satXYZ[i * 3 + 1] = satXYZ[i * 3 + 2] = 0; }
    }
    satGroups.forEach((g) => { g.items = g.members.filter((o) => o.lat === o.lat); });
    G.world.particlesData(satGroups);
    if (!satPickReady) {
        satPickReady = true;
        G.setPickSource('sat', { n, xyz: satXYZ, r: 0.5, get: (i) => ({ kind: 'sat', tip: () => satLabel(i), click: () => showOrbit(i) }) });
    }
    if (m.iss >= 0 && satObjs[m.iss].lat === satObjs[m.iss].lat) {
        const s = satObjs[m.iss];
        G.setHtml('iss', [{ lat: s.lat, lng: s.lng, alt: s.alt, el: issEl() }]);
    }
}
let issNode = null;
function issEl() {
    if (issNode) return issNode;
    issNode = h('button', {
        class: 'iss-mk', type: 'button', title: 'Stazione Spaziale Internazionale — clicca per la diretta NASA e l\'orbita',
        'aria-label': 'Stazione Spaziale Internazionale: apri diretta e orbita',
        onClick: (e) => { e.stopPropagation(); showOrbit(satMeta.iss); openIssCard(); },
    }, h('span', { 'aria-hidden': 'true' }), h('em', { text: 'ISS' }));
    return issNode;
}
function showOrbit(i) {
    if (!satWorker || i == null || i < 0) return;
    const handler = (e) => {
        if (e.data.type !== 'orbit' || e.data.i !== i) return;
        satWorker.removeEventListener('message', handler);
        const c = e.data.coords, pts = [];
        for (let k = 0; k < c.length; k += 3) pts.push([c[k], c[k + 1], c[k + 2]]);
        const color = SAT_COLORS[satMeta.groupKeys[satMeta.group[i]]] || '#8aa4ff';
        G.world.pathsData([{ pts }]).pathPoints('pts').pathPointLat((p) => p[0]).pathPointLng((p) => p[1]).pathPointAlt((p) => p[2])
            .pathColor(() => color).pathResolution(4).pathStroke(0.6);
    };
    satWorker.addEventListener('message', handler);
    satWorker.postMessage({ type: 'orbit', i });
    const o = satObjs && satObjs[i];
    if (o && o.lat === o.lat) G.flyTo(o.lat, o.lng, o.alt + 1.6);
}
function openIssCard() {
    const card = $('#issCard');
    if (!card) return;
    card.hidden = false;
    const slot = $('.iss-frame', card);
    if (!slot.firstChild) {
        slot.append(h('iframe', {
            src: 'https://www.youtube-nocookie.com/embed/DDU-rZs-NyE?autoplay=1&mute=1', title: 'ISS — diretta NASA',
            allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
        }));
    }
}
function closeIssCard() {
    const card = $('#issCard');
    if (!card) return;
    card.hidden = true;
    const slot = $('.iss-frame', card);
    while (slot.firstChild) slot.removeChild(slot.firstChild);
}
define({
    id: 'satellites', group: 'env', label: 'Satelliti', title: 'Satelliti in tempo reale (TLE) con orbita e ISS',
    async load(def) {
        if (typeof Worker === 'undefined') return false;
        if (satWorker && satMeta) return true;
        satWorker = new Worker('js/workers/sat.worker.js');
        const ok = await new Promise((resolve) => {
            const to = setTimeout(() => resolve(false), 30000);
            satWorker.onmessage = (e) => {
                const d = e.data;
                if (d.type === 'meta') { satMeta = d; clearTimeout(to); resolve(true); }
                else if (d.type === 'error') { clearTimeout(to); resolve(false); }
                else if (d.type === 'pos' && state.satellites) onSatPos(d.lla);
            };
            satWorker.onerror = () => resolve(false);
            satWorker.postMessage({ type: 'init', url: absUrl('data/data_satellites.json') });
        });
        if (!ok) { satWorker.terminate(); satWorker = null; satMeta = null; return false; }
        def.items = new Array(satMeta.n);   // solo per il conteggio
        return true;
    },
    count: () => satMeta ? satMeta.n : 0,
    globe(on) {
        if (!satWorker || !satMeta) return;
        if (on) { satWorker.postMessage({ type: 'start', ms: SAT_INTERVAL }); return; }
        satWorker.postMessage({ type: 'stop' });
        if (satObjs) G.world.particlesData([]);
        G.world.pathsData([]); G.setHtml('iss', []); G.setPickSource('sat', null); satPickReady = false; closeIssCard();
    },
    flat() { return null; },
});

/* ── Gestione ───────────────────────────────────────────────────── */
function renderGlobe(def) { try { def.globe(state[def.id], def); } catch (e) { console.error(`layer ${def.id} (globo):`, e); } }
function renderFlat(def) {
    if (!flatActive || !F.ready) return;
    try { F.setGroup(def.id, def.flat(state[def.id], def)); } catch (e) { console.error(`layer ${def.id} (piatta):`, e); }
}
function render(def) { renderGlobe(def); renderFlat(def); }

async function load(def) {
    if (!def.load) return true;
    if (def.status !== 'ok') setStatus(def, 'loading');
    let ok = false;
    try { ok = await def.load(def); } catch (e) { console.warn(`layer ${def.id}:`, e); }
    if (!ok) {
        setStatus(def, 'missing');
        if (state[def.id]) toast(`${def.label}: dati non disponibili`, { kind: 'warn' });
        return false;
    }
    setStatus(def, 'ok', def.count ? def.count(def) : def.items.length);
    return true;
}

export async function setLayer(id, on) {
    const def = defs[id];
    if (!def) return;
    state[id] = on;
    const btn = $(`#layer-${id}`);
    btn?.classList.toggle('active', on);
    btn?.setAttribute('aria-pressed', String(on));
    if (id === 'firms') $('#frpSliderWrap')?.toggleAttribute('hidden', !on);
    if (on && def.status !== 'ok') {
        if (def.status === 'loading') return;
        if (!(await load(def))) {
            state[id] = false;        // dati non disponibili: il toggle torna spento
            btn?.classList.remove('active'); btn?.setAttribute('aria-pressed', 'false');
            if (id === 'firms') $('#frpSliderWrap')?.toggleAttribute('hidden', true);
            return;
        }
        if (!state[id]) return;       // spento mentre scaricava
    }
    render(def);
    if (id === 'risk' && on && mkt.status !== 'ok') loadConflictsFallback();
    schedule(def);
}

const timers = {};
function schedule(def) {
    clearInterval(timers[def.id]);
    if (!def.refreshMs || !state[def.id]) return;
    timers[def.id] = setInterval(async () => {
        if (document.hidden || !state[def.id]) return;
        def.changed = false;
        if (await load(def) && (!def.skipIfSame || def.changed)) render(def);
    }, def.refreshMs);
}

export function renderNews() {
    render(defs.news);
    setCount(defs.news, news.store.status === 'ok' ? news.store.view.filter((e) => e.hasGeo).length : '');
}
export function renderRisk() {
    if (!G) return;
    G.restylePolygons();
    renderFlat(defs.risk);
}
export function onFlatShown() {
    flatActive = true;
    Object.values(defs).forEach(renderFlat);
}
export function onFlatHidden() { flatActive = false; }

async function loadCountries() {
    // geojson semplificato (≈155 KB invece di ≈480 KB); fallback al file completo
    let geo = await fetchJSON('data/countries.min.geojson');
    if (!geo || !Array.isArray(geo.features)) geo = await fetchJSON('data/countries.geojson');
    if (!geo || !Array.isArray(geo.features)) { toast('Confini dei paesi non disponibili', { kind: 'warn' }); return; }
    countryFeatures = geo.features.map(decorateCountry);
    G.setPolygons('countries', countryFeatures);
    renderFlat(defs.risk);
}

export function initLayers({ globe, flat }) {
    G = globe; F = flat;

    $$('.layer-toggle').forEach((btn) => {
        const id = btn.dataset.layer;
        btn.addEventListener('click', () => setLayer(id, !state[id]));
    });
    const slider = $('#frpSlider'), out = $('#frpValue');
    let fq = null;
    slider?.addEventListener('input', () => {
        frpMin = Number(slider.value);
        if (out) out.textContent = `${frpMin} MW`;
        clearTimeout(fq);
        fq = setTimeout(async () => {
            if (!state.firms || !firmsWorker) return;
            await queryFirms(defs.firms);
            render(defs.firms); setStatus(defs.firms, 'ok', defs.firms.items.length);
        }, 120);
    });
    $('#frpSliderWrap')?.toggleAttribute('hidden', true);
    $('#issClose')?.addEventListener('click', closeIssCard);

    bus.on('theme', (dark) => { G?.setTheme(dark); F?.setTheme(dark); });
    bus.on('markets:changed', () => { renderRisk(); });
    bus.on('news:changed', renderNews);
    bus.on('news:filtered', renderNews);
    bus.on('news:selected', ({ event }) => G.highlight(event ? news.eventHighlight(event.id) : null));
    bus.on('globe:empty-click', () => { G.world.pathsData([]); });
    document.addEventListener('visibilitychange', () => {
        if (!satWorker || !state.satellites) return;
        satWorker.postMessage(document.hidden ? { type: 'stop' } : { type: 'start', ms: SAT_INTERVAL });
    });

    return loadCountries();
}
