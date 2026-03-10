document.addEventListener('DOMContentLoaded', () => {
    /* ── State ── */
    let allArticles = [];
    let currentSort = 'Date';
    let is3D = true;
    let leafletMap = null;
    let searchQuery = '';
    let currentTileLayer = null;
    let frpThreshold = 100;

    /* ── DOM refs ── */
    const feedContainer = document.getElementById('unified-news-feed');
    const articleCountEl = document.getElementById('sidebar-article-count');
    const trackedCountEl = document.getElementById('tracked-articles-count');
    const sortDateBtn = document.getElementById('sortDateBtn');
    const sortPriorityBtn = document.getElementById('sortPriorityBtn');
    const globeContainer = document.getElementById('globe-container');
    const flatContainer = document.getElementById('flat-map-container');
    const mapToggleBtn = document.getElementById('mapToggleBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const newsSearchInput = document.getElementById('newsSearchInput');

    const priorityWeights = { high: 3, medium: 2, low: 1 };

    /* ══════════════════════════════════════════════ *
     *  3D GLOBE
     * ══════════════════════════════════════════════ */
    const world = Globe()
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(false)
        .showGraticules(true)
        /* We use htmlElements instead of points so markers don't scale on zoom */
        .htmlElementsData([])
        .htmlLat(d => d.lat)
        .htmlLng(d => d.lng)
        .htmlAltitude(0.01)
        .htmlElement(d => {
            const el = document.createElement('div');
            el.className = 'globe-marker';
            const col = getPriorityColor(d.priority);
            el.style.cssText = `
                width: 10px; height: 10px;
                border-radius: 50%;
                background: ${col};
                border: 1.5px solid #fff;
                box-shadow: 0 0 4px ${col}80;
                cursor: pointer;
                pointer-events: auto;
                transform: translate(-5px, -5px);
            `;
            // Tooltip on hover
            el.addEventListener('mouseenter', (e) => {
                tooltip.innerHTML = `
                    <strong>${d.title || ''}</strong>
                    <span class="tt-loc">📍 ${d.location || ''}</span>
                    <span class="tt-sev tt-${(d.priority || 'low').toLowerCase()}">${capitalize(d.priority || 'low')}</span>
                `;
                tooltip.style.display = 'block';
                moveTooltipTo(e);
                document.addEventListener('mousemove', moveTooltipTo);
            });
            el.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
                document.removeEventListener('mousemove', moveTooltipTo);
            });
            el.addEventListener('click', () => {
                if (d.url) window.open(d.url, '_blank');
            });
            return el;
        })
        (globeContainer);

    // Globe surface
    const gMat = world.globeMaterial();
    function applyGlobeSurfaceTheme(dark) {
        if (dark) {
            gMat.color.set('#1a1a2e');
            gMat.emissive.set('#1a1a2e');
            gMat.emissiveIntensity = 0.08;
        } else {
            gMat.color.set('#e8eaed');
            gMat.emissive.set('#e8eaed');
            gMat.emissiveIntensity = 0.05;
        }
    }
    function getConflictForCountry(countryName) {
        if (!conflictData || conflictData.length === 0) return null;
        return conflictData.find(c => c.countries && c.countries.includes(countryName));
    }

    function applyPolygonTheme(dark) {
        world.polygonCapColor(feat => {
            // Conflict countries
            if (layers.conflicts) {
                const conf = getConflictForCountry(feat.properties.ADMIN);
                if (conf) {
                    return conf.intensity === 'high' ? 'rgba(220,30,30,0.6)' :
                        conf.intensity === 'medium' ? 'rgba(255,120,0,0.5)' :
                            'rgba(255,180,0,0.4)';
                }
            }
            return dark ? '#2a2a3e' : '#d1d5db';
        });

        world.polygonSideColor(feat => {
            return dark ? '#1e1e30' : '#b0b5bc';
        });

        world.polygonStrokeColor(feat => {
            if (layers.conflicts) {
                const conf = getConflictForCountry(feat.properties.ADMIN);
                if (conf) return conf.intensity === 'high' ? '#ff4040' : '#ff9900';
            }
            return dark ? '#3a3a4e' : '#ffffff';
        });

        world.polygonAltitude(feat => {
            if (layers.conflicts && getConflictForCountry(feat.properties.ADMIN)) return 0.015;
            return 0.005;
        });

        world.polygonLabel(feat => {
            // Conflict tooltip
            if (layers.conflicts) {
                const conf = getConflictForCountry(feat.properties.ADMIN);
                if (conf) {
                    return `
                        <div style="background:var(--bg-card, #1e1e2d); border:1px solid var(--border, #333); padding:8px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-family:'Inter', sans-serif; color:var(--text, #eee); pointer-events:none;">
                            <strong>\u2694\ufe0f ${conf.name}</strong><br>
                            <span style="color:#aaa;font-size:12px;">${feat.properties.ADMIN} - ${conf.intensity} intensity</span>
                        </div>
                    `;
                }
            }
            return "";
        });
    }
    applyGlobeSurfaceTheme(false);

    // Dynamic solar terminator (Day/Night cycle)
    const scene = world.scene();
    // Remove existing default lights to fully control lighting
    scene.children = scene.children.filter(c => !c.isLight);

    // Add weak ambient light so the night side is visible but dark
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Add strong directional light representing the sun
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(sunLight);

    function getSunPosition(date) {
        const d = new Date(date);
        const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
        // Approximate solar declination
        const declination = 23.45 * Math.sin(2 * Math.PI * (284 + dayOfYear) / 365.25);
        // Approximate GHA (longitude opposite of time)
        const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
        let lng = (12 - hours) * 15;
        if (lng > 180) lng -= 360;
        if (lng < -180) lng += 360;
        return { lat: declination, lng: lng };
    }

    function updateSunLight() {
        const sunPos = getSunPosition(new Date());
        const coords = world.getCoords(sunPos.lat, sunPos.lng, 10);
        sunLight.position.set(coords.x, coords.y, coords.z);
    }
    updateSunLight();
    setInterval(updateSunLight, 60000); // update every minute

    const controls = world.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    world.pointOfView({ lat: 30, lng: 10, altitude: 2.2 });

    // Stop rotation on mouse interaction, restart on double-click
    globeContainer.addEventListener('mousedown', () => {
        controls.autoRotate = false;
    });
    globeContainer.addEventListener('dblclick', () => {
        controls.autoRotate = true;
    });

    const onResize = () => {
        if (globeContainer && is3D) {
            world.width(globeContainer.clientWidth);
            world.height(globeContainer.clientHeight);
        }
    };
    window.addEventListener('resize', onResize);
    setTimeout(onResize, 100);

    /* ══════════════════════════════════════════════ *
     *  DARK / LIGHT THEME TOGGLE
     * ══════════════════════════════════════════════ */
    const MOON_PATH = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';
    const SUN_SVG = `<circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;

    function setTheme(dark) {
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        themeIcon.innerHTML = dark ? SUN_SVG : `<path d="${MOON_PATH}"></path>`;
        applyGlobeSurfaceTheme(dark);
        applyPolygonTheme(dark);
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        // Switch flat map tiles
        if (leafletMap && currentTileLayer) {
            leafletMap.removeLayer(currentTileLayer);
            currentTileLayer = L.tileLayer(dark
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
                { maxZoom: 18, subdomains: 'abcd' }
            ).addTo(leafletMap);
        }
    }

    // Restore saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') setTheme(true);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            setTheme(!isDark);
        });
    }

    /* ── Tooltip ── */
    const tooltip = document.createElement('div');
    tooltip.className = 'globe-tooltip';
    document.body.appendChild(tooltip);

    function moveTooltipTo(e) {
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY + 14) + 'px';
    }

    let countryFeatures = [];

    function updateGlobePolygons() {
        if (!world) return;
        let activePolygons = [...countryFeatures];
        world.polygonsData(activePolygons);

        // --- GPS Jam Layer (using discrete H3 hex polygons for better performance and clarity) ---
        if (layers.gpsjam && gpsJamData && gpsJamData.length > 0) {
            const activeJam = gpsJamData.filter(d => d.severity !== 'green');
            world.hexPolygonsData(activeJam)
                .hexPolygonId(d => d.id)
                .hexPolygonLabel(d => {
                    const pct = d.bad_pct || 0;
                    const color = pct >= 80 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#fbbf24';
                    const severityText = pct >= 80 ? 'CRITICA' : pct >= 40 ? 'ELEVATA' : 'MODERATA';
                    return `
                        <div style="background:rgba(20,20,30,0.95); border:1px solid ${color}; padding:10px 14px; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,0.4); font-family:'Inter',sans-serif; color:#eee; pointer-events:none; min-width:180px; backdrop-filter:blur(4px);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <strong style="color:${color};">📡 GPS Interference</strong>
                                <span style="background:${color}; color:#fff; font-size:9px; padding:2px 5px; border-radius:4px; font-weight:bold;">${severityText}</span>
                            </div>
                            <div style="font-size:12px; margin-bottom:4px;">Aerei Affetti: <b>${d.bad_ac}</b> / ${d.total_ac}</div>
                            <div style="width:100%; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; margin-bottom:8px;">
                                <div style="width:${pct}%; height:100%; background:${color}; border-radius:2px;"></div>
                            </div>
                            <span style="font-size:11px; color:#aaa;">Incertezza: <b>${pct.toFixed(1)}%</b></span><br>
                            <span style="font-size:10px; color:#666; margin-top:4px; display:block;">ID Hex: ${d.id}</span>
                        </div>
                    `;
                })
                .hexPolygonColor(d => {
                    const pct = d.bad_pct || 0;
                    if (pct >= 80) return 'rgba(239, 68, 68, 0.7)';
                    if (pct >= 40) return 'rgba(245, 158, 11, 0.65)';
                    return 'rgba(251, 191, 36, 0.55)';
                })
                .hexPolygonAltitude(d => (d.bad_pct || 0) / 100 * 0.05 + 0.01)
                .hexPolygonMargin(0.1);
        } else {
            world.hexPolygonsData([]);
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyPolygonTheme(isDark);
    }

    /* ── Load country polygons ── */
    fetch('data/countries.geojson')
        .then(r => r.json())
        .then(geo => {
            countryFeatures = geo.features;
            updateGlobePolygons();
        });

    /* ══════════════════════════════════════════════ *
     *  FLAT MAP (Leaflet)
     * ══════════════════════════════════════════════ */
    function initFlatMap() {
        if (leafletMap) {
            leafletMap.invalidateSize();
            return;
        }
        leafletMap = L.map('flat-map-container', {
            center: [30, 10], zoom: 2,
            zoomControl: false, attributionControl: false
        });
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        currentTileLayer = L.tileLayer(isDark
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
            : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            { maxZoom: 18, subdomains: 'abcd' }
        ).addTo(leafletMap);

        // News markers are added via updateFlatMapLayers()
        updateFlatMapLayers();
    }

    /* ── Map Toggle ── */
    if (mapToggleBtn) {
        mapToggleBtn.addEventListener('click', () => {
            is3D = !is3D;
            if (is3D) {
                globeContainer.style.display = 'block';
                flatContainer.style.display = 'none';
                mapToggleBtn.innerHTML = '🗺 Flat Map';
                setTimeout(onResize, 50);
            } else {
                globeContainer.style.display = 'none';
                flatContainer.style.display = 'block';
                mapToggleBtn.innerHTML = '🌍 Globe';
                initFlatMap();
                setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
            }
        });
    }

    /* ══════════════════════════════════════════════ *
     *  LOAD ARTICLES
     * ══════════════════════════════════════════════ */
    fetch('data/map_data.json')
        .then(r => r.json())
        .then(data => {
            allArticles = Array.isArray(data) ? data : (data.articles || Object.values(data));
            updateCounts(allArticles.length);

            // HTML marker data for the globe
            const markers = allArticles.map(a => ({
                lat: a.lat, lng: a.lng,
                title: a.description, priority: a.severity,
                location: a.location, url: a.url || '#',
                continent: getContinent(a.lat, a.lng)
            }));
            world.htmlElementsData(markers);

            calculateRiskLevels(markers);
            renderArticles(allArticles);
        })
        .catch(err => {
            console.error('load error', err);
            feedContainer.innerHTML = '<p style="padding:20px;color:#6b7280">Error loading data.</p>';
        });

    /* ══════════════════════════════════════════════ *
     *  RENDER CARDS
     * ══════════════════════════════════════════════ */
    function renderArticles(articles) {
        feedContainer.innerHTML = '';

        // Apply search filter
        let filtered = articles;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = articles.filter(a =>
                (a.description || '').toLowerCase().includes(q) ||
                (a.location || '').toLowerCase().includes(q)
            );
        }

        let sorted = [...filtered];
        if (currentSort === 'Priority') {
            sorted.sort((a, b) => (priorityWeights[b.severity] || 0) - (priorityWeights[a.severity] || 0));
        }

        // Update count with filtered number
        if (articleCountEl) articleCountEl.textContent = `${sorted.length} articles`;

        if (sorted.length === 0 && searchQuery) {
            feedContainer.innerHTML = `<div class="no-results"><span>🔍</span>No results for "${searchQuery}"</div>`;
            return;
        }

        sorted.forEach(article => {
            const card = document.createElement('a');
            card.href = article.url || '#';
            card.target = '_blank';
            card.className = 'news-card';
            const sev = (article.severity || 'low').toLowerCase();
            const loc = article.location || 'Global';
            const topic = guessTopic(article.description);
            card.innerHTML = `
                <div class="card-tags">
                    <span class="tag-topic topic-${topic.css}">${topic.name}</span>
                    <span class="tag priority-${sev}">${capitalize(sev)}</span>
                </div>
                <h3>${article.description || 'News Update'}</h3>
                <div class="card-footer">
                    <span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    </span>
                    <span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        ${loc}
                    </span>
                </div>
            `;
            feedContainer.appendChild(card);
        });
    }

    /* ── Sort Buttons ── */
    sortDateBtn.addEventListener('click', () => {
        currentSort = 'Date';
        sortDateBtn.classList.add('active');
        sortPriorityBtn.classList.remove('active');
        renderArticles(allArticles);
    });
    sortPriorityBtn.addEventListener('click', () => {
        currentSort = 'Priority';
        sortPriorityBtn.classList.add('active');
        sortDateBtn.classList.remove('active');
        renderArticles(allArticles);
    });

    /* ── News Search ── */
    if (newsSearchInput) {
        newsSearchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.trim();
            renderArticles(allArticles);
        });
    }

    /* ── Risk Dashboard ── */
    function calculateRiskLevels(pts) {
        const regions = { Europe: [], Americas: [], Asia: [], 'Mid-East': [] };
        pts.forEach(p => { if (regions[p.continent]) regions[p.continent].push(p); });
        Object.entries(regions).forEach(([region, items]) => {
            const avg = items.length ? items.reduce((s, i) => s + (priorityWeights[i.priority] || 1), 0) / items.length : 0;
            let level = 'Low';
            if (avg >= 2.5) level = 'High';
            else if (avg >= 1.5) level = 'Med';
            const key = { Europe: 'eu', Americas: 'am', Asia: 'as', 'Mid-East': 'me' }[region];
            const badge = document.getElementById('risk-' + key);
            if (badge) {
                badge.textContent = level;
                badge.className = 'risk-badge';
                if (level === 'High') badge.style.background = '#ef4444';
                else if (level === 'Med') badge.style.background = '#f59e0b';
                else badge.style.background = '#10b981';
            }
            const countEl = document.getElementById('risk-count-' + key);
            if (countEl) countEl.textContent = `${items.length} events`;
            const highEl = document.getElementById('risk-high-' + key);
            if (highEl) {
                const hc = items.filter(i => i.priority === 'high').length;
                highEl.textContent = `${hc} critical`;
            }
        });
    }

    /* ══════════════════════════════════════════════ *
     *  HELPERS
     * ══════════════════════════════════════════════ */
    function updateCounts(n) {
        if (articleCountEl) articleCountEl.textContent = `${n} articles`;
        if (trackedCountEl) trackedCountEl.textContent = n;
    }
    function getPriorityColor(p) {
        if (!p) return '#6b7280';
        switch (p.toLowerCase()) {
            case 'high': return '#ef4444';
            case 'medium': return '#f59e0b';
            case 'low': return '#10b981';
            default: return '#6b7280';
        }
    }
    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    function guessTopic(desc) {
        if (!desc) return { name: 'World', css: 'world' };
        const d = desc.toLowerCase();
        if (/climat|ambiente|green|inquin|emiss/.test(d)) return { name: 'Environment', css: 'environment' };
        if (/tech|ia\b|ai\b|digital|google|app\b|cyber/.test(d)) return { name: 'Technology', css: 'technology' };
        if (/econom|banca|inflaz|pil|btp|finanz|borsa|mercato/.test(d)) return { name: 'Economy', css: 'economy' };
        if (/infrastruttur|ponte|treno|strad|trasport/.test(d)) return { name: 'Infrastructure', css: 'infrastructure' };
        if (/scien|ricerca|scopert|energia|spazio|nasa/.test(d)) return { name: 'Science', css: 'science' };
        if (/sport|olimp|calcio|champions|serie a|coppa/.test(d)) return { name: 'Sports', css: 'sports' };
        if (/agricol|raccolto|coltiv/.test(d)) return { name: 'Agriculture', css: 'agriculture' };
        return { name: 'World', css: 'world' };
    }
    function getContinent(lat, lng) {
        if (lat > 35 && lng > -30 && lng < 60) return 'Europe';
        if (lat > 10 && lat < 60 && lng > 60 && lng < 150) return 'Asia';
        if (lat < 10 && lng > 20 && lng < 55) return 'Africa';
        if (lng < -30) return 'Americas';
        if (lat > 25 && lng > 25 && lng < 65) return 'Mid-East';
        return 'Other';
    }

    /* ══════════════════════════════════════════════ *
     *  LAYER SYSTEM (FIRMS, Earthquakes, Nuclear, Radiation, Telegram)
     * ══════════════════════════════════════════════ */
    const layers = { news: true, firms: false, flights: false, ships: false, earthquakes: false, nuclear: false, radiation: false, conflicts: false, satellites: false, gpsjam: false };
    let firmsData = [];
    // --- LAZY DATA STORAGE ---
    let earthquakeData = [];
    let nuclearData = [];
    let radiationData = [];
    let conflictData = [];
    let flightsData = [];
    let shipsData = [];
    let satellitesData = [];
    let pizzaData = [];
    let telegramData = [];
    let gpsJamData = [];
    let telegramSearch = '';

    // Leaflet layer groups
    let firmsLayerGroup = null;
    let flightsLayerGroup = null;
    let earthquakeLayerGroup = null;
    let nuclearLayerGroup = null;
    let radiationLayerGroup = null;
    let conflictLayerGroup = null;
    let newsLayerGroup = null;
    let shipsLayerGroup = null;
    let gpsJamLayerGroup = null;

    // Globe stores the combined htmlElementsData from active layers
    let newsMarkers = [];

    // FRP filter helper
    function getFilteredFirms() {
        return firmsData.filter(f => f.frp >= frpThreshold);
    }

    // FRP color (shared between globe & flat map)
    function firmsColor(frp) {
        if (frp > 50) return 'rgba(255, 0, 0, 0.9)';
        if (frp > 10) return 'rgba(255, 69, 0, 0.85)';
        return 'rgba(255, 140, 0, 0.7)';
    }

    /* ── FRP Slider ── */
    const frpSlider = document.getElementById('frpSlider');
    const frpValueLabel = document.getElementById('frpValue');
    if (frpSlider) {
        frpSlider.addEventListener('input', (e) => {
            frpThreshold = parseInt(e.target.value, 10);
            frpValueLabel.textContent = frpThreshold + ' MW';
            updateGlobeMarkers();
            updateFlatMapLayers();
        });
    }

    /* ── Layer Toggle Buttons ── */
    document.querySelectorAll('.flp-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const layer = btn.dataset.layer;
            layers[layer] = !layers[layer];
            btn.classList.toggle('active', layers[layer]);

            // Immediately fetch flights if toggled on
            if (layer === 'flights' && layers.flights) {
                fetchFlights();
            }
            if (layer === 'ships' && layers.ships) {
                fetchShips();
            }
            if (layer === 'satellites' && layers.satellites) {
                fetchSatellitesData();
            }
            if (layer === 'gpsjam') {
                if (layers.gpsjam) fetchGpsJamData();
                else updateGlobePolygons(); // Clear polygons if untoggled
            }
            if (layer === 'conflicts') {
                updateGlobePolygons(); // Triggers a re-render of country colors
            }

            updateGlobeMarkers();
            updateFlatMapLayers();
        });
    });

    /* ── Sidebar Tabs ── */
    const tabNews = document.getElementById('tabNews');
    const tabTelegram = document.getElementById('tabTelegram');
    const tabPizza = document.getElementById('tabPizza');

    const tabContentNews = document.getElementById('tabContentNews');
    const tabContentTelegram = document.getElementById('tabContentTelegram');
    const tabContentPizza = document.getElementById('tabContentPizza');

    const telegramFeed = document.getElementById('telegram-feed');
    const telegramCountEl = document.getElementById('telegram-msg-count');
    const telegramSearchInput = document.getElementById('telegramSearchInput');

    function switchSidebarTab(tabName) {
        if (tabNews) tabNews.classList.remove('active');
        if (tabTelegram) tabTelegram.classList.remove('active');
        if (tabPizza) tabPizza.classList.remove('active');

        if (tabContentNews) tabContentNews.style.display = 'none';
        if (tabContentTelegram) tabContentTelegram.style.display = 'none';
        if (tabContentPizza) tabContentPizza.style.display = 'none';

        if (tabName === 'news') {
            if (tabNews) tabNews.classList.add('active');
            if (tabContentNews) tabContentNews.style.display = '';
        } else if (tabName === 'telegram') {
            if (tabTelegram) tabTelegram.classList.add('active');
            if (tabContentTelegram) tabContentTelegram.style.display = '';
        } else if (tabName === 'pizza') {
            if (tabPizza) tabPizza.classList.add('active');
            if (tabContentPizza) tabContentPizza.style.display = '';
        }
    }

    if (tabNews) tabNews.addEventListener('click', () => switchSidebarTab('news'));
    if (tabTelegram) tabTelegram.addEventListener('click', () => switchSidebarTab('telegram'));
    if (tabPizza) tabPizza.addEventListener('click', () => switchSidebarTab('pizza'));

    /* ── Telegram Search ── */
    if (telegramSearchInput) {
        telegramSearchInput.addEventListener('input', (e) => {
            telegramSearch = e.target.value.trim();
            renderTelegram(telegramData);
        });
    }

    /* ══════════════════════════════════════════════ *
     *  LOAD FIRMS DATA
     * ══════════════════════════════════════════════ */
    fetch('data/data_firms.json')
        .then(r => r.json())
        .then(data => {
            firmsData = Array.isArray(data) ? data : [];
            console.log(`FIRMS: ${firmsData.length} hotspots loaded`);
            // Data loaded but layer stays off by default
            // User can toggle it on manually
        })
        .catch(() => { firmsData = []; });

    /* ══════════════════════════════════════════════ *
     *  LOAD EARTHQUAKE DATA (USGS — live, no key)
     * ══════════════════════════════════════════════ */
    function loadEarthquakes() {
        fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')
            .then(r => r.json())
            .then(geo => {
                earthquakeData = (geo.features || []).map(f => ({
                    lat: f.geometry.coordinates[1],
                    lng: f.geometry.coordinates[0],
                    depth: f.geometry.coordinates[2],
                    mag: f.properties.mag,
                    place: f.properties.place,
                    time: new Date(f.properties.time).toLocaleString(),
                    url: f.properties.url,
                    _type: 'earthquake'
                }));
                console.log(`Earthquakes: ${earthquakeData.length} events loaded`);
                updateGlobeMarkers();
                updateFlatMapLayers();
            })
            .catch(e => { console.warn('USGS fetch error', e); earthquakeData = []; });
    }
    loadEarthquakes();
    // Refresh earthquakes every 5 min
    setInterval(loadEarthquakes, 5 * 60 * 1000);

    /* ══════════════════════════════════════════════ *
     *  LOAD NUCLEAR PLANTS (local static file)
     * ══════════════════════════════════════════════ */
    fetch('data/data_nuclear.json')
        .then(r => r.json())
        .then(data => {
            nuclearData = Array.isArray(data) ? data.map(d => ({ ...d, _type: 'nuclear' })) : [];
            console.log(`Nuclear: ${nuclearData.length} plants loaded`);
        })
        .catch(e => { console.warn('Nuclear data error', e); nuclearData = []; });

    /* ══════════════════════════════════════════════ *
     *  LOAD RADIATION DATA (Safecast — live, no key)
     * ══════════════════════════════════════════════ */
    function loadRadiation() {
        fetch('https://api.safecast.org/en-US/measurements.json?distance=10000&latitude=35&longitude=35&order=captured_at+desc')
            .then(r => r.json())
            .then(data => {
                radiationData = (Array.isArray(data) ? data : []).filter(d => d.latitude && d.longitude).map(d => ({
                    lat: d.latitude,
                    lng: d.longitude,
                    value: d.value,
                    unit: d.unit || 'cpm',
                    captured: d.captured_at ? new Date(d.captured_at).toLocaleString() : '',
                    _type: 'radiation'
                }));
                console.log(`Radiation: ${radiationData.length} measurements loaded`);
                updateGlobeMarkers();
                updateFlatMapLayers();
            })
            .catch(e => { console.warn('Safecast fetch error', e); radiationData = []; });
    }
    loadRadiation();

    /* ══════════════════════════════════════════════ *
     *  LOAD CONFLICT ZONES (static file)
     * ══════════════════════════════════════════════ */
    fetch('data/data_conflicts.json')
        .then(r => r.json())
        .then(data => {
            conflictData = Array.isArray(data) ? data.map(d => ({ ...d, _type: 'conflict' })) : [];
            console.log(`Conflicts: ${conflictData.length} zones loaded`);
        })
        .catch(e => { console.warn('Conflict data error', e); conflictData = []; });

    /* ══════════════════════════════════════════════ *
     *  LOAD FLIGHTS DATA (ADSB.lol - Military & Emergency)
     * ══════════════════════════════════════════════ */
    function fetchFlights() {
        if (!layers.flights) return; // Only fetch if layer is active to save bandwidth

        Promise.all([
            fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://api.adsb.lol/v2/mil')).then(r => r.json()).catch(() => ({ ac: [] })),
            fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://api.adsb.lol/v2/sqk/7700')).then(r => r.json()).catch(() => ({ ac: [] }))
        ]).then(([milData, emergData]) => {
            const milAc = milData.ac || [];
            const emergAc = emergData.ac || [];
            // Combine and deduplicate by hex
            const seen = new Set();
            flightsData = [...milAc, ...emergAc].filter(f => {
                if (seen.has(f.hex)) return false;
                seen.add(f.hex);
                return f.lat != null && f.lon != null;
            }).map(f => ({
                ...f,
                lng: f.lon,
                _type: 'flight'
            }));

            console.log(`Flights: ${flightsData.length} active military/emergency aircraft loaded`);

            if (layers.flights) {
                updateGlobeMarkers();
                updateFlatMapLayers();
            }
        });
    }

    // Poll flights every 30 seconds
    setInterval(fetchFlights, 30000);

    /* ══════════════════════════════════════════════ *
     *  LOAD SHIPS DATA (aisstream - 10 min interval via scraper)
     * ══════════════════════════════════════════════ */
    async function fetchShips() {
        if (!layers.ships) return;

        try {
            const res = await fetch('data/data_ships.json?' + new Date().getTime());
            if (res.ok) {
                const data = await res.json();
                const rawShips = Array.isArray(data) ? data : (data.ships || []);
                // Filter to military only (exclude rescue, cargo, etc.) to reduce weight
                shipsData = rawShips
                    .filter(d => d.type && d.type.toLowerCase().includes('military'))
                    .map(d => ({ ...d, _type: 'ship' }));
                console.log(`Ships: ${shipsData.length} military vessels loaded (filtered from ${rawShips.length} total)`);
                if (layers.ships) {
                    updateGlobeMarkers();
                    updateFlatMapLayers();
                }
            }
        } catch (e) { console.warn('Ships fetch error', e); shipsData = []; }
    }

    async function fetchSatellitesData() {
        if (!layers.satellites || satellitesData.length > 0) return; // Only fetch if layer is active and not already loaded
        try {
            const res = await fetch('data/data_satellites.json');
            if (res.ok) {
                const data = await res.json();
                satellitesData = data;
                console.log(`Satellites: ${satellitesData.length} objects loaded`);
                updateGlobeMarkers();
            }
        } catch (e) {
            console.error('Error fetching satellites data', e);
        }
    }

    // Poll ships every 1 minute if active (scraper runs every 10 mins, but this ensures web syncs)
    setInterval(fetchShips, 60000);

    /* ══════════════════════════════════════════════ *
     *  LOAD GPS JAMMING DATA
     * ══════════════════════════════════════════════ */
    async function fetchGpsJamData() {
        if (!layers.gpsjam) return;
        try {
            const res = await fetch('data/data_gpsjam.json?' + new Date().getTime());
            if (res.ok) {
                const data = await res.json();
                gpsJamData = Array.isArray(data) ? data.map(d => ({ ...d, _type: 'gpsjam' })) : [];
                console.log(`GPS Jamming: ${gpsJamData.length} interfered aircraft loaded`);
                if (layers.gpsjam) {
                    updateGlobePolygons();
                    updateFlatMapLayers();
                }
            }
        } catch (e) { console.warn('GPS Jamming fetch error', e); gpsJamData = []; }
    }

    // Poll GPS Jamming every minute if active
    setInterval(fetchGpsJamData, 60000);

    /* ══════════════════════════════════════════════ *
     *  LOAD PIZZA INDEX (Polling)
     * ══════════════════════════════════════════════ */
    function fetchPizzaData() {
        fetch('data/data_pizza.json?' + new Date().getTime()) // cache buster for polling
            .then(r => r.json())
            .then(data => {
                pizzaData = Array.isArray(data) ? data : [];
                renderPizzaIndex(pizzaData);
            })
            .catch(e => { console.warn('Pizza data error', e); });
    }

    // Initial fetch, then poll every 30 seconds
    fetchPizzaData();
    setInterval(fetchPizzaData, 30000);

    /* ── Render Pizza Index ── */
    function renderPizzaIndex(data) {
        const feed = document.getElementById('pizza-feed');
        const statusLabel = document.getElementById('pizza-status-label');
        if (!feed) return;
        feed.innerHTML = '';

        // Calculate overall index
        const pizzerias = data.filter(d => !d.isPentagon);
        if (pizzerias.length > 0) {
            const avgActivity = pizzerias.reduce((sum, p) => sum + (p.activity || 0), 0) / pizzerias.length;
            let status = 'FADE OUT - PRONTEZZA MINIMA';
            let color = '#10b981'; // green

            if (avgActivity > 80) { status = 'DEFCON 1 - MAXIMUM READINESS'; color = '#ef4444'; }
            else if (avgActivity > 60) { status = 'ELEVATED - SURGE IN ORDERS'; color = '#f59e0b'; }

            if (statusLabel) {
                statusLabel.innerHTML = `<span style="color:${color};font-weight:bold;">${status}</span>`;
            }
        }

        data.forEach(p => {
            const el = document.createElement('div');
            el.className = 'tg-card';

            const isClosed = p.status === 'CLOSED';
            const activityColor = p.activity > 80 ? '#ef4444' : p.activity > 50 ? '#f59e0b' : '#10b981';

            el.innerHTML = `
                <div class="tg-card-header">
                    <span class="tg-channel" style="color:#eee;font-weight:600;">
                        <span style="display:inline-block; ${p.activity > 80 ? 'animation: bounce 1s infinite;' : ''}">${p.isPentagon ? '🛡️' : '🍕'}</span> ${p.name}
                    </span>
                    <span class="tg-time" style="color:${isClosed ? '#6b7280' : activityColor}; border:1px solid ${isClosed ? '#4b5563' : activityColor}; padding:2px 6px; border-radius:4px;">
                        ${isClosed ? 'CHIUSO' : `Act: ${p.activity}%`}
                    </span>
                </div>
                <p style="margin-top:8px;font-size:13px;color:#aaa;">${p.description}</p>
                ${!isClosed && !p.isPentagon ? `
                <div style="margin-top:10px; width:100%; height:4px; background:#333; border-radius:2px; overflow:hidden;">
                    <div style="width:${p.activity}%; height:100%; background:${activityColor}; transition:width 0.5s ease;"></div>
                </div>` : ''}
            `;
            feed.appendChild(el);
        });
    }


    /* ══════════════════════════════════════════════ *
     *  LOAD TELEGRAM DATA
     * ══════════════════════════════════════════════ */
    fetch('data/data_telegram.json')
        .then(r => r.json())
        .then(data => {
            telegramData = Array.isArray(data) ? data : [];
            console.log(`Telegram: ${telegramData.length} messages loaded`);
            renderTelegram(telegramData);
        })
        .catch(() => { telegramData = []; });

    /* ── Render Telegram Cards ── */
    function renderTelegram(msgs) {
        if (!telegramFeed) return;
        telegramFeed.innerHTML = '';

        let filtered = msgs;
        if (telegramSearch) {
            const q = telegramSearch.toLowerCase();
            filtered = msgs.filter(m =>
                (m.text || '').toLowerCase().includes(q) ||
                (m.channel || '').toLowerCase().includes(q)
            );
        }

        if (telegramCountEl) telegramCountEl.textContent = `${filtered.length} messages`;

        if (filtered.length === 0) {
            telegramFeed.innerHTML = telegramSearch
                ? `<div class="no-results"><span>🔍</span>No results for "${telegramSearch}"</div>`
                : `<div class="no-results"><span>📡</span>No OSINT messages yet.<br>Run the Telegram scraper.</div>`;
            return;
        }

        filtered.forEach(msg => {
            const card = document.createElement('a');
            card.href = msg.url || '#';
            card.target = '_blank';
            card.className = 'tg-card';

            let dateStr = '';
            if (msg.date) {
                try {
                    const d = new Date(msg.date);
                    dateStr = d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                } catch (_) { dateStr = msg.date; }
            }

            card.innerHTML = `
                <div class="tg-card-header">
                    <span class="tg-channel">@${msg.channel || ''}</span>
                    <span class="tg-time">${dateStr}</span>
                </div>
                <p class="tg-body">${msg.text || ''}</p>
                ${msg.forwarded_from ? `<span class="tg-fwd">↩ ${msg.forwarded_from}</span>` : ''}
            `;
            telegramFeed.appendChild(card);
        });
    }

    /* ══════════════════════════════════════════════ *
     *  UPDATE GLOBE MARKERS (combine active layers)
     * ══════════════════════════════════════════════ */
    function updateGlobeMarkers() {
        // --- HTML Elements: News + Nuclear + Earthquakes + Radiation + Flights ---
        let htmlData = layers.news ? [].concat(newsMarkers) : [];
        if (layers.flights) htmlData = htmlData.concat(flightsData);
        if (layers.ships) htmlData = htmlData.concat(shipsData);
        if (layers.nuclear) htmlData = htmlData.concat(nuclearData);
        if (layers.earthquakes) htmlData = htmlData.concat(earthquakeData);
        if (layers.radiation) htmlData = htmlData.concat(radiationData);

        // Re-evaluate polygon colors for Conflicts layer
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyPolygonTheme(isDark);

        world
            .htmlElementsData(htmlData)
            .htmlElement(d => {
                if (d._type === 'flight') return createFlightMarkerEl(d);
                if (d._type === 'ship') return createShipMarkerEl(d);
                if (d._type === 'nuclear') return createNuclearMarkerEl(d);
                if (d._type === 'earthquake') return createEarthquakeMarkerEl(d);
                if (d._type === 'radiation') return createRadiationMarkerEl(d);
                return createNewsMarkerEl(d);
            });

        // --- Shared Geometries and Materials for Satellites ---
        if (!window.satGeom) {
            window.satGeom = new THREE.SphereGeometry(0.5, 4, 4); // Low poly sphere
            // Diverse, non-white, non-black colors for different origins/constellations
            window.satMats = {
                starlink: new THREE.MeshBasicMaterial({ color: '#00ffff' }),   // Cyan
                oneweb: new THREE.MeshBasicMaterial({ color: '#ff7700' }),     // Orange
                iridium: new THREE.MeshBasicMaterial({ color: '#c400ff' }),    // Purple
                flock: new THREE.MeshBasicMaterial({ color: '#00ff44' }),      // Bright Green
                spire: new THREE.MeshBasicMaterial({ color: '#eefc00' }),      // Yellow/Lime
                globalstar: new THREE.MeshBasicMaterial({ color: '#ff0077' }), // Pink
                stations: new THREE.MeshBasicMaterial({ color: '#ffd700' }),   // Gold
                livestream: new THREE.MeshBasicMaterial({ color: '#ff0000' }), // Bright Red for live video
                other: new THREE.MeshBasicMaterial({ color: '#77aaff' })       // Light Blue (default)
            };
        }

        // --- Points Data: FIRMS (GPU-rendered) ---
        let firmsPoints = layers.firms ? getFilteredFirms() : [];
        world
            .pointsData(firmsPoints)
            .pointLat(d => d.lat)
            .pointLng(d => d.lng)
            .pointAltitude(0.005)
            .pointRadius(d => Math.min(0.15, 0.04 + (d.frp || 0) / 500))
            .pointColor(d => firmsColor(d.frp || 0))
            .pointLabel(d => `
                <div style="background:rgba(20,20,30,0.92);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:1px solid rgba(255,69,0,0.3);pointer-events:none;">
                    <strong>🔥 Thermal Hotspot</strong><br>
                    📍 ${d.lat.toFixed(2)}, ${d.lng.toFixed(2)}<br>
                    <span style="color:#ff4500;font-weight:700;">FRP: ${d.frp} MW</span> · ${d.confidence}<br>
                    <span style="color:#aaa;">${d.date} ${d.time} · ${d.sensor}</span>
                </div>
            `);

        // --- Satellites Data (real-time 3D propagation via satellite.js)
        if (layers.satellites && satellitesData.length > 0) {
            const now = new Date();
            const satPosData = [];
            satellitesData.forEach(sat => {
                try {
                    const satrec = satellite.twoline2satrec(sat.line1, sat.line2);
                    const positionAndVelocity = satellite.propagate(satrec, now);

                    if (positionAndVelocity.position) {
                        const gmst = satellite.gstime(now);
                        const positionGd = satellite.eciToGeodetic(positionAndVelocity.position, gmst);

                        const altitude = positionGd.height; // in km
                        // Altitude scaling for Globe.gl (earth radius is approx 6371 km -> 1.0 in globe units)
                        const altitudeRatio = altitude / 6371.0;

                        satPosData.push({
                            ...sat,
                            lat: satellite.degreesLat(positionGd.latitude),
                            lng: satellite.degreesLong(positionGd.longitude),
                            alt: altitudeRatio,
                            actualAlt: altitude
                        });
                    }
                } catch (e) { }
            });

            world.customLayerData(satPosData)
                .customThreeObject(d => {
                    const name = (d.name || '').toUpperCase();
                    let matStr = 'other';
                    let scale = 0.5;

                    if (name === 'ISS (ZARYA)' || name === 'ISS') {
                        matStr = 'livestream'; scale = 1.5;
                    }
                    else if (name.includes('STARLINK')) { matStr = 'starlink'; scale = 0.3; }
                    else if (name.includes('ONEWEB')) { matStr = 'oneweb'; scale = 0.4; }
                    else if (name.includes('IRIDIUM')) { matStr = 'iridium'; scale = 0.6; }
                    else if (name.includes('FLOCK')) { matStr = 'flock'; scale = 0.4; }
                    else if (name.includes('LEMUR')) { matStr = 'spire'; scale = 0.4; }
                    else if (name.includes('GLOBALSTAR')) { matStr = 'globalstar'; scale = 0.5; }
                    else if (d.category === 'stations' || name.includes('TIANGONG')) {
                        matStr = 'stations'; scale = 1.2;
                    }

                    const mat = window.satMats[matStr] || window.satMats.other;
                    const obj = new THREE.Mesh(window.satGeom, mat);
                    obj.scale.set(scale, scale, scale);

                    // Save classification for tooltip
                    d.classification = matStr;
                    return obj;
                })
                .customThreeObjectUpdate((obj, d) => {
                    Object.assign(obj.position, world.getCoords(d.lat, d.lng, d.alt));
                })
                .customLayerLabel(d => {
                    const altKm = Math.round(d.actualAlt);

                    // Extract satellite specs from TLE
                    let incl = '?'; let orbitTime = '?';
                    try {
                        incl = parseFloat(d.line2.substring(8, 16).trim());
                        const revsPerDay = parseFloat(d.line2.substring(52, 63).trim());
                        if (revsPerDay > 0) orbitTime = Math.round((24 * 60) / revsPerDay);
                    } catch (e) { }

                    let liveCameraHtml = '';
                    if (d.name && (d.name.toUpperCase() === 'ISS (ZARYA)' || d.name.toUpperCase() === 'ISS')) {
                        // Embed official NASA ISS live stream (Video ID DDU-rZs-NyE)
                        liveCameraHtml = `
                            <div style="margin-top:8px; border-radius:4px; overflow:hidden; border: 1px solid rgba(255,255,255,0.2);">
                                <iframe width="240" height="135" src="https://www.youtube.com/embed/DDU-rZs-NyE?autoplay=1&mute=1&controls=0&modestbranding=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
                                <div style="font-size:10px; text-align:center; color:#ff4444; font-weight:bold; margin-top:2px; margin-bottom: 2px;">🔴 LIVE FEED</div>
                            </div>
                        `;
                    }

                    return `
                        <div style="background:rgba(20,20,30,0.92);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.3);pointer-events:none;">
                            <strong>🛰️ ${d.name}</strong><br>
                            <span style="color:#aaa;">Group: ${capitalize(d.classification || d.category)}</span><br>
                            <span style="color:#aaa;">Altitude: ${altKm} km (LEO)</span><br>
                            <span style="color:#aaa;">Inclination: ${incl}°</span><br>
                            <span style="color:#aaa;">Orbit Time: ${orbitTime} m</span>
                            ${liveCameraHtml}
                        </div>
                    `;
                });

            // Handle clicking on a satellite to show its orbit trajectory
            world.onCustomLayerClick((obj, event) => {
                const sat = (obj && obj.__data) ? obj.__data : obj;
                if (sat && sat.line1) {
                    window.lastSatClickTime = Date.now();
                    const satrec = satellite.twoline2satrec(sat.line1, sat.line2);

                    // Propagate orbit for the next 100 minutes (1 minute intervals)
                    const pathCoords = [];
                    const nowMs = Date.now();
                    for (let i = 0; i <= 100; i++) {
                        const futureTime = new Date(nowMs + i * 60000);
                        const posVel = satellite.propagate(satrec, futureTime);
                        if (posVel.position) {
                            const gmst = satellite.gstime(futureTime);
                            const posGd = satellite.eciToGeodetic(posVel.position, gmst);
                            const lat = satellite.degreesLat(posGd.latitude);
                            let lng = satellite.degreesLong(posGd.longitude);
                            // Altitude scaling for Globe.gl
                            const alt = posGd.height / 6371.0;

                            pathCoords.push([lat, lng, alt]);
                        }
                    }

                    // Render the path
                    world
                        .pathsData([{ coords: pathCoords, category: sat.classification || 'other' }])
                        .pathPoints('coords')
                        .pathPointLat(p => p[0])
                        .pathPointLng(p => p[1])
                        .pathPointAlt(p => p[2])
                        .pathColor(p => window.satMats[p.category]?.color.getStyle() || '#ffffff')
                        .pathResolution(4);

                    // Make the camera follow to the clicked satellite
                    world.pointOfView({ lat: sat.lat, lng: sat.lng, altitude: sat.alt + 1.5 }, 1000);
                }
            });

            // Click anywhere else on the globe clears the orbit path
            world.onGlobeClick(() => {
                if (Date.now() - (window.lastSatClickTime || 0) > 100) {
                    world.pathsData([]);
                }
            });

            // Ensure any previous intervals are cleared so they don't move
            if (window.satInterval) {
                clearInterval(window.satInterval);
                window.satInterval = null;
            }
        } else {
            world.customLayerData([]);
            world.pathsData([]); // Clear paths when layer is off
            if (window.satInterval) {
                clearInterval(window.satInterval);
                window.satInterval = null;
            }
        }

        // --- Rings Data: Earthquake pulse rings ---
        const ringsData = layers.earthquakes ? earthquakeData : [];
        world
            .ringsData(ringsData)
            .ringLat(d => d.lat)
            .ringLng(d => d.lng)
            .ringAltitude(0.002)
            .ringMaxRadius(d => Math.max(0.5, d.mag * 0.4))
            .ringPropagationSpeed(1.5)
            .ringRepeatPeriod(1200)
            .ringColor(() => t => `rgba(255, 200, 0, ${1 - t})`);
    }

    /* ── Flight marker: single tiny div, clip-path arrow, zero children ── */
    function createFlightMarkerEl(d) {
        const el = document.createElement('div');
        const isEmergency = d.squawk === '7700';
        const color = isEmergency ? '#ff0000' : '#ffa500';
        const rot = d.track || 0;
        el.style.cssText = `width:10px;height:10px;background:${color};clip-path:polygon(50% 0%,100% 100%,50% 75%,0% 100%);transform:rotate(${rot}deg);cursor:pointer;pointer-events:auto;opacity:0.9;`;
        el.addEventListener('mouseenter', (e) => {
            const cs = d.flight ? d.flight.trim() : 'N/A';
            const alt = d.alt_baro === 'ground' ? 'GND' : (d.alt_baro ? d.alt_baro + 'ft' : '?');
            tooltip.innerHTML = `<b>${isEmergency ? 'EMRG' : 'MIL'}</b> ${cs}<br>${d.t || '?'} · ${alt} · ${d.gs ? d.gs + 'kt' : '?'}`;
            tooltip.style.display = 'block'; moveTooltipTo(e);
        });
        el.addEventListener('mousemove', moveTooltipTo);
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        el.addEventListener('click', () => { window.open('https://globe.adsb.lol/?icao=' + d.hex, '_blank'); });
        return el;
    }

    /* ── Ship marker: pointed front boat shape ── */
    function createShipMarkerEl(d) {
        const el = document.createElement('div');
        const rot = d.heading || 0;
        const isRescue = d.type && d.type.toLowerCase().includes('rescue');
        const color = isRescue ? '#00e5ff' : '#8892b0'; // Cyan for SAR, Gray-blue for NAVY
        el.style.cssText = `width:12px;height:12px;background:${color};clip-path:polygon(50% 0%, 100% 30%, 80% 100%, 20% 100%, 0% 30%);transform:rotate(${rot}deg);cursor:pointer;pointer-events:auto;opacity:0.9;`;
        el.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `<b>${isRescue ? 'SAR' : 'NAVY'}</b> ${d.name || d.mmsi}<br>Speed: ${d.speed || '?'} kt`;
            tooltip.style.display = 'block'; moveTooltipTo(e);
        });
        el.addEventListener('mousemove', moveTooltipTo);
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        return el;
    }

    function createNewsMarkerEl(d) {
        const el = document.createElement('div');
        el.className = 'globe-marker';
        const col = getPriorityColor(d.priority);
        el.style.cssText = `
            width: 7px; height: 7px;
            border-radius: 50%;
            background: ${col};
            border: 1px solid #fff;
            box-shadow: 0 0 3px ${col}80;
            cursor: pointer;
            pointer-events: auto;
            transform: translate(-3.5px, -3.5px);
            `;
        el.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `
                <strong> ${d.title || ''}</strong>
                <span class="tt-loc">📍 ${d.location || ''}</span>
                <span class="tt-sev tt-${(d.priority || 'low').toLowerCase()}">${capitalize(d.priority || 'low')}</span>
            `;
            tooltip.style.display = 'block';
            moveTooltipTo(e);
            document.addEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            document.removeEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('click', () => {
            if (d.url) window.open(d.url, '_blank');
        });
        return el;
    }

    function createFirmsMarkerEl(d) {
        const el = document.createElement('div');
        el.className = 'firms-marker' + (d.frp > 50 ? ' frp-high' : '');
        el.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `
                <strong>🔥 Thermal Hotspot</strong>
                <span class="tt-loc">📍 ${d.country} (${d.lat.toFixed(2)}, ${d.lng.toFixed(2)})</span>
                <span style="font-size:11px;display:block;margin-top:2px;">FRP: ${d.frp} MW · ${d.confidence}</span>
                <span style="font-size:10px;color:var(--text-muted);display:block;">${d.date} ${d.time}</span>
            `;
            tooltip.style.display = 'block';
            moveTooltipTo(e);
            document.addEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            document.removeEventListener('mousemove', moveTooltipTo);
        });
        return el;
    }

    /* ── Earthquake marker (DOM) ── */
    function createEarthquakeMarkerEl(d) {
        const el = document.createElement('div');
        const sz = Math.max(6, Math.min(14, d.mag * 2.5));
        const col = d.mag >= 6 ? '#ff0040' : d.mag >= 4.5 ? '#ff6600' : '#ffc800';
        el.style.cssText = `
            width:${sz}px; height:${sz}px; border-radius: 50%;
            background:${col}; border: 1.5px solid #fff;
            box-shadow: 0 0 6px ${col}aa;
            cursor: pointer; pointer-events: auto;
            transform: translate(-${sz / 2}px, -${sz / 2}px);
animation: pulse-ring 2s ease - out infinite;
`;
        el.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `
    <strong>🌍 Earthquake M${d.mag.toFixed(1)}</strong>
                <span class="tt-loc">📍 ${d.place}</span>
                <span style="font-size:11px;display:block;margin-top:2px;">Depth: ${d.depth} km · ${d.time}</span>
`;
            tooltip.style.display = 'block';
            moveTooltipTo(e);
            document.addEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            document.removeEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('click', () => {
            if (d.url) window.open(d.url, '_blank');
        });
        return el;
    }

    /* ── Nuclear plant marker (DOM) ── */
    function createNuclearMarkerEl(d) {
        const el = document.createElement('div');
        el.style.cssText = `
width: 12px; height: 12px; border-radius: 50%;
background: radial-gradient(circle, #ffff00 30%, #aa8800 100%);
border: 1.5px solid #fff;
box-shadow: 0 0 4px rgba(255, 255, 0, 0.6);
cursor: pointer; pointer-events: auto;
transform: translate(-6px, -6px);
display: flex; align-items: center; justify-content: center;
font-size: 8px;
`;
        el.textContent = '☢️';
        el.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `
    <strong>☢️ ${d.name}</strong>
        <span class="tt-loc">📍 ${d.lat.toFixed(2)}, ${d.lng.toFixed(2)}</span>
                ${d.output ? `<span style="font-size:11px;display:block;margin-top:2px;">Output: ${d.output}</span>` : ''}
`;
            tooltip.style.display = 'block';
            moveTooltipTo(e);
            document.addEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            document.removeEventListener('mousemove', moveTooltipTo);
        });
        return el;
    }

    /* ── Radiation sensor marker (DOM) ── */
    function createRadiationMarkerEl(d) {
        const el = document.createElement('div');
        const isHigh = d.value > 50;
        el.style.cssText = `
width: 8px; height: 8px; border-radius: 50%;
background: ${isHigh ? '#ff00ff' : '#00e5ff'};
border: 1.5px solid #fff;
box-shadow: 0 0 4px ${isHigh ? '#ff00ff' : '#00e5ff'} 80;
cursor: pointer; pointer-events: auto;
transform: translate(-4px, -4px);
`;
        el.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = `
    <strong>📡 Radiation Sensor</strong>
                <span class="tt-loc">📍 ${d.lat.toFixed(2)}, ${d.lng.toFixed(2)}</span>
                <span style="font-size:11px;display:block;margin-top:2px;">Value: ${d.value} ${d.unit}</span>
                <span style="font-size:10px;color:var(--text-muted);display:block;">${d.captured}</span>
`;
            tooltip.style.display = 'block';
            moveTooltipTo(e);
            document.addEventListener('mousemove', moveTooltipTo);
        });
        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            document.removeEventListener('mousemove', moveTooltipTo);
        });
        return el;
    }

    /* ============================================== *
     *  FLAT MAP LAYER GROUPS
     * ============================================== */
    function updateFlatMapLayers() {
        if (!leafletMap) return;

        // News layer
        if (newsLayerGroup) leafletMap.removeLayer(newsLayerGroup);
        if (layers.news && allArticles.length > 0) {
            newsLayerGroup = L.layerGroup();
            allArticles.forEach(a => {
                if (!a.lat || !a.lng) return;
                const col = getPriorityColor(a.severity);
                L.circleMarker([a.lat, a.lng], {
                    radius: 4, fillColor: col, color: '#fff',
                    weight: 1, opacity: 1, fillOpacity: 0.85
                }).addTo(newsLayerGroup)
                    .bindPopup(`<b>${a.description || ''}</b><br>📍 ${a.location || ''}<br>Priorità: ${capitalize(a.severity || 'low')}`);
            });
            newsLayerGroup.addTo(leafletMap);
        }

        // Flights layer (lightweight divIcon with clip-path + click)
        if (flightsLayerGroup) leafletMap.removeLayer(flightsLayerGroup);
        if (layers.flights && flightsData.length > 0) {
            flightsLayerGroup = L.layerGroup();
            flightsData.forEach(d => {
                const isEmergency = d.squawk === '7700';
                const col = isEmergency ? '#ff0000' : '#ffa500';
                const rot = d.track || 0;
                const icon = L.divIcon({
                    className: '',
                    html: `<div style="width:10px;height:10px;background:${col};clip-path:polygon(50% 0%,100% 100%,50% 75%,0% 100%);transform:rotate(${rot}deg);opacity:0.9;"></div>`,
                    iconSize: [10, 10],
                    iconAnchor: [5, 5]
                });
                const cs = d.flight ? d.flight.trim() : 'N/A';
                const speed = d.gs ? d.gs + ' kt' : 'N/A';
                L.marker([d.lat, d.lng], { icon }).addTo(flightsLayerGroup)
                    .bindTooltip(`<b>${isEmergency ? 'EMRG' : 'MIL'}</b> ${cs}<br>${d.t || '?'} · ${speed}`, { direction: 'top', offset: [0, -6] })
                    .on('click', () => { window.open('https://globe.adsb.lol/?icao=' + d.hex, '_blank'); });
            });
            flightsLayerGroup.addTo(leafletMap);
        }

        // Ships layer (lightweight divIcon with ship shape)
        if (shipsLayerGroup) leafletMap.removeLayer(shipsLayerGroup);
        if (layers.ships && shipsData.length > 0) {
            shipsLayerGroup = L.layerGroup();
            shipsData.forEach(d => {
                const isRescue = d.type && d.type.toLowerCase().includes('rescue');
                const col = isRescue ? '#00e5ff' : '#8892b0';
                const rot = d.heading || 0;
                const icon = L.divIcon({
                    className: '',
                    html: `<div style="width:12px;height:12px;background:${col};clip-path:polygon(50% 0%, 100% 30%, 80% 100%, 20% 100%, 0% 30%);transform:rotate(${rot}deg);opacity:0.9;"></div>`,
                    iconSize: [12, 12],
                    iconAnchor: [6, 6]
                });
                const speed = d.speed ? d.speed + ' kt' : 'N/A';
                L.marker([d.lat, d.lng], { icon }).addTo(shipsLayerGroup)
                    .bindTooltip(`<b>${isRescue ? 'SAR' : 'NAVY'}</b> ${d.name || d.mmsi}<br>Speed: ${speed}`, { direction: 'top', offset: [0, -6] });
            });
            shipsLayerGroup.addTo(leafletMap);
        }

        // FIRMS layer
        if (firmsLayerGroup) leafletMap.removeLayer(firmsLayerGroup);
        const filteredFirms = getFilteredFirms();
        if (layers.firms && filteredFirms.length > 0) {
            firmsLayerGroup = L.layerGroup();
            filteredFirms.forEach(f => {
                const radius = Math.min(3, 1 + (f.frp || 0) / 100);
                const col = firmsColor(f.frp || 0);
                L.circleMarker([f.lat, f.lng], {
                    radius, fillColor: col, color: col,
                    weight: 0, opacity: 1, fillOpacity: 0.75
                }).addTo(firmsLayerGroup)
                    .bindTooltip(`🔥 <b>FRP: ${f.frp} MW</b><br>${f.confidence}<br>${f.lat.toFixed(2)}, ${f.lng.toFixed(2)}<br>${f.date} ${f.time}`, { direction: 'top', offset: [0, -5] });
            });
            firmsLayerGroup.addTo(leafletMap);
        }

        // Earthquake layer
        if (earthquakeLayerGroup) leafletMap.removeLayer(earthquakeLayerGroup);
        if (layers.earthquakes && earthquakeData.length > 0) {
            earthquakeLayerGroup = L.layerGroup();
            earthquakeData.forEach(q => {
                const r = Math.max(3, Math.min(10, q.mag * 2));
                const col = q.mag >= 6 ? '#ff0040' : q.mag >= 4.5 ? '#ff6600' : '#ffc800';
                L.circleMarker([q.lat, q.lng], {
                    radius: r, fillColor: col, color: '#fff',
                    weight: 1, opacity: 1, fillOpacity: 0.8
                }).addTo(earthquakeLayerGroup)
                    .bindTooltip(`🌍 <b>M${q.mag.toFixed(1)}</b> · ${q.place}<br>Depth: ${q.depth} km<br>${q.time}`, { direction: 'top', offset: [0, -5] });
            });
            earthquakeLayerGroup.addTo(leafletMap);
        }

        // Nuclear layer
        if (nuclearLayerGroup) leafletMap.removeLayer(nuclearLayerGroup);
        if (layers.nuclear && nuclearData.length > 0) {
            nuclearLayerGroup = L.layerGroup();
            nuclearData.forEach(n => {
                const icon = L.divIcon({
                    className: 'leaflet-nuclear-icon',
                    html: '<span style="font-size:11px;">☢️</span>',
                    iconSize: [14, 14], iconAnchor: [7, 7]
                });
                L.marker([n.lat, n.lng], { icon }).addTo(nuclearLayerGroup)
                    .bindTooltip(`☢️ <b>${n.name}</b>${n.output ? '<br>' + n.output : ''}`, { direction: 'top', offset: [0, -10] });
            });
            nuclearLayerGroup.addTo(leafletMap);
        }

        // Radiation layer
        if (radiationLayerGroup) leafletMap.removeLayer(radiationLayerGroup);
        if (layers.radiation && radiationData.length > 0) {
            radiationLayerGroup = L.layerGroup();
            radiationData.forEach(r => {
                const isHigh = r.value > 50;
                const col = isHigh ? '#ff00ff' : '#00e5ff';
                L.circleMarker([r.lat, r.lng], {
                    radius: 4, fillColor: col, color: col,
                    weight: 0, opacity: 1, fillOpacity: 0.7
                }).addTo(radiationLayerGroup)
                    .bindTooltip(`📡 <b>${r.value} ${r.unit}</b><br>${r.captured}`, { direction: 'top', offset: [0, -5] });
            });
            radiationLayerGroup.addTo(leafletMap);
        }

        // GPS Jamming Layer
        if (gpsJamLayerGroup) leafletMap.removeLayer(gpsJamLayerGroup);
        if (layers.gpsjam && gpsJamData.length > 0) {
            gpsJamLayerGroup = L.layerGroup();

            gpsJamData.forEach(j => {
                const s = j.severity;
                const col = s === 'red' ? '#ff0000' : s === 'yellow' ? '#ffaa00' : '#00ff00';

                // Swap [lng, lat] from GeoJSON to [lat, lng] for Leaflet polygon
                const latLngs = j.polygon.map(pt => [pt[1], pt[0]]);

                L.polygon(latLngs, {
                    color: col,
                    weight: 1,
                    opacity: 0.8,
                    fillColor: col,
                    fillOpacity: 0.4
                }).addTo(gpsJamLayerGroup)
                    .bindTooltip(`📡 <b>GPS Jamming Zone</b><br>Severity: ${s.toUpperCase()}<br>Bad NIC: ${j.bad_pct}%`);
            });
            gpsJamLayerGroup.addTo(leafletMap);
        }

        // Conflict zones layer (GeoJSON exact borders)
        if (conflictLayerGroup) leafletMap.removeLayer(conflictLayerGroup);
        if (layers.conflicts && conflictData.length > 0 && countryFeatures.length > 0) {
            conflictLayerGroup = L.layerGroup();

            // Filter features for countries in conflict
            const conflictFeatures = countryFeatures.filter(f => getConflictForCountry(f.properties.ADMIN));

            L.geoJSON(conflictFeatures, {
                style: function (feature) {
                    const conf = getConflictForCountry(feature.properties.ADMIN);
                    const col = conf.intensity === 'high' ? 'rgba(220,30,30,0.35)' : conf.intensity === 'medium' ? 'rgba(255,120,0,0.3)' : 'rgba(255,180,0,0.25)';
                    const border = conf.intensity === 'high' ? '#cc1e1e' : conf.intensity === 'medium' ? '#ff7800' : '#ffb400';
                    return {
                        fillColor: col,
                        color: border,
                        weight: 1.5,
                        opacity: 0.8,
                        fillOpacity: 1,
                        dashArray: '4,4'
                    };
                },
                onEachFeature: function (feature, layer) {
                    const conf = getConflictForCountry(feature.properties.ADMIN);
                    layer.bindTooltip(
                        `⚔️ <b>${conf.name}</b><br>${feature.properties.ADMIN}<br><span style="text-transform:capitalize">${conf.intensity} intensity</span>`,
                        { direction: 'top', sticky: true }
                    );
                }
            }).addTo(conflictLayerGroup);

            conflictLayerGroup.addTo(leafletMap);
        }
    }

    /* ── Patch the original initFlatMap to include layers ── */
    const origInitFlatMap = initFlatMap;
    // Override is handled by calling updateFlatMapLayers after leaflet init

    /* Intercept map toggle to refresh layers */
    const origMapToggle = mapToggleBtn ? mapToggleBtn.onclick : null;
    if (mapToggleBtn) {
        const existingListeners = mapToggleBtn.cloneNode(true);
        // After flat map is shown, inject layer markers
        const observer = new MutationObserver(() => {
            if (flatContainer.style.display !== 'none' && leafletMap) {
                setTimeout(updateFlatMapLayers, 200);
            }
        });
        observer.observe(flatContainer, { attributes: true, attributeFilter: ['style'] });
    }

    /* ── Store news markers ref for layer filtering ── */
    // Patch the article loading to store newsMarkers
    const origFetch = fetch;
    setTimeout(() => {
        if (allArticles.length > 0) {
            newsMarkers = allArticles.map(a => ({
                lat: a.lat, lng: a.lng,
                title: a.description, priority: a.severity,
                location: a.location, url: a.url || '#',
                continent: getContinent(a.lat, a.lng)
            }));
            updateGlobeMarkers();
        }
    }, 2000);

    /* ══════════════════════════════════════════════ *
     *  DYNAMIC BOTTOM BAR WIDGETS
     * ══════════════════════════════════════════════ */
    const WIDGET_CATALOG = [
        { id: 'spx', symbol: 'FOREXCOM:SPXUSD', label: '📈 S&P 500' },
        { id: 'gold', symbol: 'OANDA:XAUUSD', label: '🥇 Gold (XAU/USD)' },
        { id: 'btc', symbol: 'BINANCE:BTCUSDT', label: '₿ Bitcoin (BTC/USDT)' },
        { id: 'eth', symbol: 'BINANCE:ETHUSDT', label: 'Ξ Ethereum (ETH)' },
        { id: 'dxy', symbol: 'TVC:DXY', label: '💵 US Dollar Index' },
        { id: 'oil', symbol: 'TVC:USOIL', label: '🛢️ Crude Oil (WTI)' },
        { id: 'nasdaq', symbol: 'NASDAQ:NDX', label: '💻 Nasdaq 100' },
        { id: 'vix', symbol: 'TVC:VIX', label: '😰 VIX (Fear Index)' },
        { id: 'eurusd', symbol: 'FX:EURUSD', label: '🇪🇺 EUR/USD' },
        { id: 'silver', symbol: 'OANDA:XAGUSD', label: '🥈 Silver (XAG/USD)' },
        { id: 'dax', symbol: 'XETR:DAX', label: '🇩🇪 DAX 40' },
        { id: 'nikkei', symbol: 'TVC:NI225', label: '🇯🇵 Nikkei 225' },
    ];

    const DEFAULT_WIDGETS = ['spx', 'gold', 'btc'];
    const chartsRow = document.getElementById('chartsRow');
    const addWidgetBtn = document.getElementById('addWidgetBtn');

    // Load active widgets from localStorage or use defaults
    function getActiveWidgets() {
        try {
            const saved = localStorage.getItem('activeWidgets');
            return saved ? JSON.parse(saved) : [...DEFAULT_WIDGETS];
        } catch { return [...DEFAULT_WIDGETS]; }
    }

    function saveActiveWidgets(ids) {
        localStorage.setItem('activeWidgets', JSON.stringify(ids));
    }

    let activeWidgetIds = getActiveWidgets();

    function createWidgetBlock(catalogItem) {
        const block = document.createElement('div');
        block.className = 'chart-block';
        block.dataset.widgetId = catalogItem.id;

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const config = JSON.stringify({
            symbol: catalogItem.symbol,
            width: '100%', height: '100%',
            locale: 'en', dateRange: '1M',
            colorTheme: isDark ? 'dark' : 'light',
            isTransparent: true, autosize: true, largeChartUrl: ''
        });

        // Remove button
        const removeBtn = document.createElement('button');
        removeBtn.className = 'widget-remove-btn';
        removeBtn.innerHTML = '−';
        removeBtn.title = 'Remove widget';
        removeBtn.addEventListener('click', () => {
            block.style.transform = 'scale(0.9)';
            block.style.opacity = '0';
            setTimeout(() => {
                block.remove();
                activeWidgetIds = activeWidgetIds.filter(id => id !== catalogItem.id);
                saveActiveWidgets(activeWidgetIds);
            }, 200);
        });

        const label = document.createElement('div');
        label.className = 'chart-label';
        label.textContent = catalogItem.label;

        // Use iframe for reliable TradingView embed
        const iframe = document.createElement('iframe');
        iframe.className = 'chart-widget-iframe';
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('scrolling', 'no');
        iframe.srcdoc = `<!DOCTYPE html><html><head><style>body{margin:0;overflow:hidden;background:transparent;}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js" async>${config}<\/script></div></body></html>`;

        block.appendChild(removeBtn);
        block.appendChild(label);
        block.appendChild(iframe);
        return block;
    }

    function renderWidgets() {
        chartsRow.querySelectorAll('.chart-block').forEach(b => b.remove());
        activeWidgetIds.forEach(id => {
            const item = WIDGET_CATALOG.find(w => w.id === id);
            if (item) chartsRow.appendChild(createWidgetBlock(item));
        });
    }

    // Add widget modal
    function showAddWidgetPicker() {
        // Remove existing picker
        const existing = document.querySelector('.widget-picker-overlay');
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement('div');
        overlay.className = 'widget-picker-overlay';

        const picker = document.createElement('div');
        picker.className = 'widget-picker';

        const title = document.createElement('div');
        title.className = 'widget-picker-title';
        title.textContent = 'Add Widget';
        picker.appendChild(title);

        const available = WIDGET_CATALOG.filter(w => !activeWidgetIds.includes(w.id));
        if (available.length === 0) {
            const msg = document.createElement('div');
            msg.style.cssText = 'padding:16px;color:var(--text-muted);font-size:13px;text-align:center;';
            msg.textContent = 'All widgets are already active!';
            picker.appendChild(msg);
        } else {
            available.forEach(item => {
                const btn = document.createElement('button');
                btn.className = 'widget-picker-btn';
                btn.textContent = item.label;
                btn.addEventListener('click', () => {
                    activeWidgetIds.push(item.id);
                    saveActiveWidgets(activeWidgetIds);
                    chartsRow.appendChild(createWidgetBlock(item));
                    overlay.remove();
                });
                picker.appendChild(btn);
            });
        }

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.appendChild(picker);
        document.body.appendChild(overlay);
    }

    if (addWidgetBtn) addWidgetBtn.addEventListener('click', showAddWidgetPicker);

    // Initial render
    renderWidgets();

    /* ══════════════════════════════════════════════ *
     *  ANSA ULTIMA ORA — Sub-Navigation within News Tab
     * ══════════════════════════════════════════════ */
    let ansaData = {};

    const newsViewAll = document.getElementById('news-view-all');
    const newsViewMondo = document.getElementById('news-view-mondo');
    const newsViewEconomia = document.getElementById('news-view-economia');

    function switchNewsView(cat) {
        // Hide all views
        if (newsViewAll) newsViewAll.style.display = 'none';
        if (newsViewMondo) newsViewMondo.style.display = 'none';
        if (newsViewEconomia) newsViewEconomia.style.display = 'none';

        // Show selected view
        if (cat === 'all' && newsViewAll) {
            newsViewAll.style.display = '';
        } else if (cat === 'Mondo' && newsViewMondo) {
            newsViewMondo.style.display = '';
            renderAnsaCategoryFeed('mondo', ansaData.Mondo || []);
        } else if (cat === 'Economia' && newsViewEconomia) {
            newsViewEconomia.style.display = '';
            renderAnsaCategoryFeed('economia', ansaData.Economia || []);
        }
    }

    function renderAnsaCategoryFeed(catId, articles) {
        const feed = document.getElementById(`ansa-feed-${catId}`);
        if (!feed) return;
        feed.innerHTML = '';

        articles.forEach(article => {
            const card = document.createElement('a');
            card.href = article.link;
            card.target = '_blank';
            card.className = 'news-card ansa-card';

            card.innerHTML = `
                <div class="card-tags">
                    <span class="ansa-category-tag">${catId === 'mondo' ? 'Mondo' : 'Economia'}</span>
                    <span class="ansa-time">${article.time}</span>
                </div>
                <h3>${article.title}</h3>
                <div class="card-footer">
                    <span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                        ANSA.it
                    </span>
                </div>
            `;
            feed.appendChild(card);
        });
    }

    function fetchAnsaUltimaOra() {
        fetch('data/data_ansa_ultima_ora.json?' + new Date().getTime())
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                ansaData = data;
            })
            .catch(err => console.warn('ANSA fetch error', err));
    }

    // Category filter buttons (excluding report-btn)
    document.querySelectorAll('.ansa-cat-btn:not(.report-btn)').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ansa-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            switchNewsView(btn.dataset.cat);
        });
    });

    /* ══════════════════════════════════════════════ *
     *      DAILY REPORT MODAL LOGIC
     * ══════════════════════════════════════════════ */
    const reportModal = document.getElementById('reportModal');
    const openReportBtn = document.getElementById('openReportBtn');
    const closeReportBtn = document.getElementById('closeReportBtn');
    const reportOverlay = document.getElementById('reportOverlay');

    function openReport() {
        if (!reportModal) return;
        reportModal.style.display = 'flex';
        fetchReport();
    }

    function closeReport() {
        if (!reportModal) return;
        reportModal.style.display = 'none';
    }

    if (openReportBtn) openReportBtn.addEventListener('click', openReport);
    if (closeReportBtn) closeReportBtn.addEventListener('click', closeReport);
    if (reportOverlay) reportOverlay.addEventListener('click', closeReport);

    function fetchReport() {
        fetch('data/report_daily.json?' + new Date().getTime())
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (data) renderReport(data);
            })
            .catch(err => console.warn('Report fetch error', err));
    }

    function renderReport(data) {
        // 1. Timestamp
        const tsEl = document.getElementById('reportTimestamp');
        if (tsEl && data.generated_at) {
            const d = new Date(data.generated_at * 1000);
            tsEl.textContent = `Generato il ${d.toLocaleString('it-IT')} · ${data.total_count} articoli analizzati`;
        }

        // 2. Day at a Glance — stat cards
        const glanceGrid = document.getElementById('glanceGrid');
        if (glanceGrid && data.day_at_glance) {
            const g = data.day_at_glance;
            const dv = g.domestic_vs_international || {};
            const total = (dv.italia || 0) + (dv.international || 0);
            const intlPct = total > 0 ? Math.round((dv.international / total) * 100) : 0;

            glanceGrid.innerHTML = `
                <div class="glance-card">
                    <div class="glance-value">${g.total_articles}</div>
                    <div class="glance-label">Articoli Totali</div>
                </div>
                <div class="glance-card">
                    <div class="glance-value">${g.peak_hour ? g.peak_hour.slot : 'N/A'}</div>
                    <div class="glance-label">Fascia Più Attiva (${g.peak_hour ? g.peak_hour.count : 0} articoli)</div>
                </div>
                <div class="glance-card">
                    <div class="glance-value">${intlPct}%</div>
                    <div class="glance-label">Copertura Internazionale</div>
                </div>
                <div class="glance-card">
                    <div class="glance-value">${g.geo_focus && g.geo_focus.length > 0 ? g.geo_focus[0].region : 'N/A'}</div>
                    <div class="glance-label">Focus Principale</div>
                </div>
            `;
        }

        // 3. Geographic Focus — horizontal bars
        const geoEl = document.getElementById('geoFocus');
        if (geoEl && data.day_at_glance && data.day_at_glance.geo_focus) {
            geoEl.innerHTML = '';
            const geos = data.day_at_glance.geo_focus;
            const maxGeo = geos.length > 0 ? geos[0].mentions : 1;

            geos.forEach(g => {
                const row = document.createElement('div');
                row.className = 'volume-bar-row';
                const pct = (g.mentions / maxGeo) * 100;
                row.innerHTML = `
                    <div class="volume-bar-info">
                        <span>${g.region}</span>
                        <span>${g.mentions} menzioni</span>
                    </div>
                    <div class="volume-bar-container">
                        <div class="volume-bar-fill geo-bar" style="width: ${pct}%"></div>
                    </div>
                `;
                geoEl.appendChild(row);
            });
        }

        // 4. Category Breakdown — horizontal bars
        const catEl = document.getElementById('catBreakdown');
        if (catEl && data.day_at_glance && data.day_at_glance.categories) {
            catEl.innerHTML = '';
            const cats = data.day_at_glance.categories;
            const maxCat = cats.length > 0 ? cats[0].score : 1;

            cats.forEach(c => {
                const row = document.createElement('div');
                row.className = 'volume-bar-row';
                const pct = (c.score / maxCat) * 100;
                row.innerHTML = `
                    <div class="volume-bar-info">
                        <span>${c.name}</span>
                        <span>${c.score}</span>
                    </div>
                    <div class="volume-bar-container">
                        <div class="volume-bar-fill cat-bar" style="width: ${pct}%"></div>
                    </div>
                `;
                catEl.appendChild(row);
            });
        }

        // 5. Major Stories (Clustered News)
        const topNewsEl = document.getElementById('reportTopNews');
        if (topNewsEl) {
            topNewsEl.innerHTML = '';
            if (data.major_stories && data.major_stories.length > 0) {
                data.major_stories.forEach(story => {
                    const div = document.createElement('div');
                    div.className = 'major-story-box';
                    div.innerHTML = `
                        <a href="${story.link}" target="_blank" class="story-headline">${story.headline}</a>
                        <div class="story-meta">Trovato in ${story.count} fonti (${story.source})</div>
                        ${story.related && story.related.length > 0 ? `
                            <ul class="related-list">
                                ${story.related.map(r => `<li>${r}</li>`).join('')}
                            </ul>
                        ` : ''}
                    `;
                    topNewsEl.appendChild(div);
                });
            } else if (data.latest_headlines) {
                data.latest_headlines.forEach(item => {
                    const a = document.createElement('a');
                    a.href = item.link;
                    a.target = '_blank';
                    a.className = 'top-news-item';
                    a.textContent = item.title;
                    topNewsEl.appendChild(a);
                });
            }
        }

        // 6. Volume Chart
        const chart = document.getElementById('volumeChart');
        if (chart) {
            chart.innerHTML = '';
            const volumes = data.sources_volume || {};
            const maxVol = Math.max(...Object.values(volumes), 1);

            Object.entries(volumes).sort((a, b) => b[1] - a[1]).forEach(([source, count]) => {
                const row = document.createElement('div');
                row.className = 'volume-bar-row';
                const pct = (count / maxVol) * 100;
                row.innerHTML = `
                    <div class="volume-bar-info">
                        <span>${source.toUpperCase()}</span>
                        <span>${count}</span>
                    </div>
                    <div class="volume-bar-container">
                        <div class="volume-bar-fill" style="width: ${pct}%"></div>
                    </div>
                `;
                chart.appendChild(row);
            });
        }
    }

    setTimeout(fetchAnsaUltimaOra, 1000);
    setInterval(fetchAnsaUltimaOra, 120000);
});