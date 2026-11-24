/* globe.js — vista 3D (globe.gl) e vista piatta (Leaflet, caricato solo se serve) dietro un'interfaccia comune.
 *
 * Prestazioni: i marker NON sono elementi DOM. Tutti i punti (notizie, terremoti, incendi, voli…) finiscono in un
 * unico mesh WebGL "merged" (pointsData + pointsMerge) = 1 draw call. Hover e click sono risolti sulla CPU con una
 * proiezione schermo (poche migliaia di punti per movimento del mouse, throttled a un frame).
 * Elementi HTML solo per ≤ 3 etichette (evento selezionato, ISS).
 */
import { prefs, bus, tip, h } from './util.js';

// Esri Canvas: basemap grigia senza chiave API (i tile Carto ora richiedono una chiave)
const TILE_DARK = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const TILE_LIGHT = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const GLOBE_R = 100;                     // raggio del globo in three-globe

export const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Coordinate cartesiane di three-globe (stessa formula di getCoords, senza allocare oggetti). */
export function polar2xyz(lat, lng, alt, out, o) {
    const phi = ((90 - lat) * Math.PI) / 180, th = ((90 - lng) * Math.PI) / 180, r = GLOBE_R * (1 + alt);
    out[o] = r * Math.sin(phi) * Math.cos(th);
    out[o + 1] = r * Math.cos(phi);
    out[o + 2] = r * Math.sin(phi) * Math.sin(th);
}

/* ══════════════════════════════════════════════════════════════════
 *  Globo 3D
 * ═════════════════════════════════════════════════════════════════ */
export function createGlobe(container) {
    if (typeof Globe !== 'function') throw new Error('globe.gl non caricato');

    const pointGroups = new Map();   // key → items[] (marker WebGL)
    const pickSets = new Map();      // key → { n, xyz:Float32Array, get(i) }
    const polyGroups = new Map();    // key → features[] (paesi, esagoni GPS jam)
    const htmlGroups = new Map();    // key → items[] (≤ qualche elemento DOM)
    let pointsDirty = false;
    let active = true;

    const world = Globe({ animateIn: false })
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(false)
        .showGraticules(true)
        .polygonsTransitionDuration(0)
        .pointsMerge(true).pointResolution(8).pointsTransitionDuration(0)
        .pointLat('lat').pointLng('lng').pointAltitude('alt').pointRadius('r').pointColor('color')
        .ringLat('lat').ringLng('lng').ringAltitude(0.004).ringMaxRadius('maxR').ringPropagationSpeed(1.2)
        .ringRepeatPeriod(2400).ringColor((d) => d.fade)
        .htmlTransitionDuration(0)
        .htmlLat((d) => d.lat).htmlLng((d) => d.lng).htmlAltitude((d) => d.alt ?? 0.01)
        .htmlElement((d) => d.el)
        (container);

    // pixel ratio limitato: a DPR 2–3 il fill rate domina senza benefici visibili sul globo
    const renderer = world.renderer();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    /* Superficie del globo secondo il tema */
    const gMat = world.globeMaterial();
    function applySurface(dark) {
        const c = dark ? '#0f1524' : '#dfe4ec';
        gMat.color.set(c);
        gMat.emissive.set(c);
        gMat.emissiveIntensity = dark ? 0.12 : 0.06;
    }

    /* Ciclo giorno/notte: riuso le luci create da globe.gl */
    const scene = world.scene();
    const lights = [];
    scene.traverse((o) => { if (o.isLight) lights.push(o); });
    const ambient = lights.find((l) => l.isAmbientLight);
    const sun = lights.find((l) => l.isDirectionalLight);
    if (ambient) ambient.intensity = 1.25;
    if (sun) { sun.intensity = 2.4; if (sun.parent !== scene) scene.add(sun); }

    function sunPosition(date) {
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const lat = 23.45 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365.25);
        const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
        let lng = (12 - hours) * 15;
        if (lng > 180) lng -= 360;
        if (lng < -180) lng += 360;
        return { lat, lng };
    }
    function updateSun() {
        if (!sun || document.hidden) return;
        const p = sunPosition(new Date());
        const c = world.getCoords(p.lat, p.lng, 10);
        sun.position.set(c.x, c.y, c.z);
    }
    updateSun();
    setInterval(updateSun, 60000);

    /* Camera e rotazione: rotazione lenta, si ferma alla prima interazione */
    const controls = world.controls();
    controls.autoRotate = !reducedMotion();
    controls.autoRotateSpeed = 0.3;
    controls.enableDamping = true;
    world.pointOfView({ lat: 30, lng: 15, altitude: container.clientWidth < 600 ? 3.6 : 2.3 });
    container.addEventListener('pointerdown', () => { controls.autoRotate = false; });
    container.addEventListener('dblclick', () => { if (!reducedMotion()) controls.autoRotate = true; });

    /* Ridimensionamento reattivo */
    const ro = new ResizeObserver(() => {
        const w = container.clientWidth, hh = container.clientHeight;
        if (w > 0 && hh > 0) world.width(w).height(hh);
    });
    ro.observe(container);

    /* Niente lavoro a vuoto con scheda nascosta o globo non visibile (mappa 2D) */
    function applyPause() { if (active && !document.hidden) world.resumeAnimation(); else world.pauseAnimation(); }
    document.addEventListener('visibilitychange', () => { applyPause(); if (!document.hidden) updateSun(); });

    /* ── Punti WebGL ── */
    function setPoints(key, items) {
        const list = items || [];
        pointGroups.set(key, list);
        const xyz = new Float32Array(list.length * 3);
        list.forEach((it, i) => polar2xyz(it.lat, it.lng, it.alt, xyz, i * 3));
        pickSets.set(key, { n: list.length, xyz, list, get: (i) => list[i] });
        if (!pointsDirty) { pointsDirty = true; requestAnimationFrame(flushPoints); }
    }
    function flushPoints() {
        pointsDirty = false;
        world.pointsData([].concat(...pointGroups.values()));
    }

    /* ── Picking sulla CPU ── */
        function pick(px, py) {
        const cam = world.camera();
        const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements;
        const cp = cam.position, cl = Math.hypot(cp.x, cp.y, cp.z) || 1;
        const w = container.clientWidth, hh = container.clientHeight;
        const focal = P[5] * hh / 2;                      // px per unità di distanza a profondità 1
        const limit = GLOBE_R * GLOBE_R * 0.999;
        let bestSet = null, bestI = -1, bestScore = 1;
        for (const set of pickSets.values()) {
            const { n, xyz, list } = set;
            for (let i = 0; i < n; i++) {
                const x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
                if (x * cp.x + y * cp.y + z * cp.z < limit) continue;      // lato opposto del globo
                const vx = V[0] * x + V[4] * y + V[8] * z + V[12];
                const vy = V[1] * x + V[5] * y + V[9] * z + V[13];
                const vz = V[2] * x + V[6] * y + V[10] * z + V[14];
                const cw = -vz; if (cw <= 0) continue;
                const sx = ((P[0] * vx / cw + 1) / 2) * w;
                const sy = ((1 - P[5] * vy / cw) / 2) * hh;
                const dx = sx - px, dy = sy - py;
                const rdeg = set.r != null ? set.r : list[i].r || 0;
                const rad = Math.max(7, (rdeg * Math.PI / 180) * GLOBE_R * focal / cw + 4);
                const d2 = dx * dx + dy * dy;
                if (d2 > rad * rad) continue;
                const score = d2 / (rad * rad);
                if (score < bestScore) { bestScore = score; bestSet = set; bestI = i; }
            }
        }
        return bestSet ? bestSet.get(bestI) : null;
    }

    let ptr = null, rafId = 0, hovered = null, down = null;
    const rectOf = () => container.getBoundingClientRect();
    function doHover() {
        rafId = 0;
        if (!ptr || (ptr.buttons & 1)) return;
        const hit = pick(ptr.x, ptr.y);
        if (hit !== hovered) {
            hovered = hit;
            container.style.cursor = hit ? 'pointer' : '';
            if (hit && hit.tip) tip.show(hit.tip(), ptr.ev); else tip.hide();
        } else if (hit) tip.move(ptr.ev);
    }
    container.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        const r = rectOf();
        ptr = { x: e.clientX - r.left, y: e.clientY - r.top, buttons: e.buttons, ev: e };
        if (!rafId) rafId = requestAnimationFrame(doHover);
    });
    container.addEventListener('pointerleave', () => { ptr = null; if (hovered) { hovered = null; tip.hide(); container.style.cursor = ''; } });
    container.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; tip.hide(); });
    container.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
        down = null;
        if (moved > 6 || dt > 600) return;
        const r = rectOf();
        const hit = pick(e.clientX - r.left, e.clientY - r.top);
        if (hit) {
            if (hit.click) hit.click(hit);
            else if (hit.tip && e.pointerType === 'touch') { tip.show(hit.tip(), e); setTimeout(tip.hide, 2500); }
        } else bus.emit('globe:empty-click');
    });

    /* ── Poligoni ── */
    function stylePolys() {
        world
            .polygonGeoJsonGeometry((d) => d.geometry)
            .polygonCapColor((d) => d.__cap(isDark()))
            .polygonSideColor((d) => (d.__side ? d.__side(isDark()) : null))        // senza fianchi né bordi: 1 draw call per paese invece di 3
            .polygonStrokeColor((d) => (d.__stroke ? d.__stroke(isDark()) : null))
            .polygonAltitude((d) => d.__alt)
            .polygonLabel((d) => (d.__label ? d.__label() : ''));
    }
    stylePolys();

    /* ── Evento selezionato: un solo elemento HTML (anello + etichetta) ── */
    let selEl = null, selLabel = null;
    function highlight(item) {
        if (!item) { htmlGroups.set('sel', []); pushHtml(); return; }
        if (!selEl) {
            selLabel = h('span', { class: 'sel-label' });
            selEl = h('div', { class: 'sel-mk', 'aria-hidden': 'true' }, h('span', { class: 'sel-ring' }), selLabel);
        }
        selLabel.textContent = item.label || '';
        htmlGroups.set('sel', [{ lat: item.lat, lng: item.lng, alt: 0.012, el: selEl }]);
        pushHtml();
    }
    function pushHtml() { world.htmlElementsData([].concat(...htmlGroups.values())); }

    return {
        kind: 'globe',
        world,
        setPoints,
        /** Anelli animati: pochi elementi (≤ 15 notizie recenti + qualche terremoto forte). */
        setRings(items) { world.ringsData((items || []).slice(0, 20)); },
        /** Sorgente di picking esterna { n, xyz:Float32Array, r (gradi), get(i) } (satelliti). */
        setPickSource(key, src) { if (src) pickSets.set(key, src); else pickSets.delete(key); },
        setHtml(key, items) { htmlGroups.set(key, items || []); pushHtml(); },
        highlight,
        setPolygons(key, features) {
            polyGroups.set(key, features || []);
            world.polygonsData([].concat(...polyGroups.values()));
        },
        /** Riapplica i colori (cambio tema / nuovi dati di rischio) senza ricreare i dati. */
        restylePolygons() { stylePolys(); },
        setTheme(dark) { applySurface(dark); stylePolys(); },
        flyTo(lat, lng, altitude = 1.5, ms = 900) {
            controls.autoRotate = false;
            world.pointOfView({ lat, lng, altitude }, reducedMotion() ? 0 : ms);
        },
        /** Il globo non renderizza quando è nascosto (vista 2D). */
        setActive(on) { active = on; applyPause(); if (on) { requestAnimationFrame(() => this.resize()); } },
        resize() { const w = container.clientWidth, hh = container.clientHeight; if (w && hh) world.width(w).height(hh); },
    };
}

/* ══════════════════════════════════════════════════════════════════
 *  Mappa piatta (Leaflet) — scaricata e inizializzata solo alla prima apertura
 * ═════════════════════════════════════════════════════════════════ */
let leafletPromise = null;
function loadLeaflet() {
    if (typeof L !== 'undefined') return Promise.resolve(true);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve) => {
        const css = h('link', { rel: 'stylesheet', href: LEAFLET_CSS });
        const js = h('script', { src: LEAFLET_JS });
        js.onload = () => resolve(typeof L !== 'undefined');
        js.onerror = () => { leafletPromise = null; resolve(false); };
        document.head.append(css, js);
    });
    return leafletPromise;
}

export function createFlatMap(container) {
    let map = null;
    let tiles = null;
    const groups = new Map();   // key → L.Layer

    function ensure() {
        if (map) return true;
        if (typeof L === 'undefined') return false;
        map = L.map(container, { center: [30, 15], zoom: 2, minZoom: 2, worldCopyJump: true, preferCanvas: true, zoomControl: false, attributionControl: false });
        L.control.zoom({ position: 'bottomleft' }).addTo(map);
        L.control.attribution({ prefix: false, position: 'bottomleft' }).addTo(map);
        setTiles(isDark());
        groups.forEach((layer) => layer && layer.addTo(map));
        return true;
    }
    function setTiles(dark) {
        if (!map) return;
        if (tiles) map.removeLayer(tiles);
        tiles = L.tileLayer(dark ? TILE_DARK : TILE_LIGHT, {
            maxZoom: 16,
            attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS',
        }).addTo(map);
        tiles.bringToBack?.();
    }

    return {
        kind: 'flat',
        get ready() { return !!map; },
        /** Scarica Leaflet (una sola volta) e crea la mappa. */
        async show() {
            if (!(await loadLeaflet()) || !ensure()) return false;
            setTimeout(() => map.invalidateSize(), 60);
            return true;
        },
        /** Imposta/sostituisce un gruppo di layer Leaflet (layer = L.Layer o null). */
        setGroup(key, layer) {
            const prev = groups.get(key);
            if (prev && map) map.removeLayer(prev);
            groups.set(key, layer || null);
            if (layer && map) layer.addTo(map);
        },
        setTheme(dark) { setTiles(dark); },
        flyTo(lat, lng, zoom = 5) { if (map) map.flyTo([lat, lng], zoom, { duration: 1 }); },
        resize() { if (map) map.invalidateSize(); },
    };
}

/* Tema globale: attributo sul root + preferenza + notifica ai moduli */
export function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    prefs.set('theme', dark ? 'dark' : 'light');
    bus.emit('theme', dark);
}
