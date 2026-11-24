/* panels.js — Telegram OSINT, ANSA ultima ora, report 24h */
import { h, $, $$, clear, fetchJSON, num, parseTime, fmtDateTime, timeAgo, emptyState, skeleton, bus, debounce, setText } from './util.js';

/* ── Telegram ───────────────────────────────────────────────────── */
let telegram = null;           // null = non caricato / non disponibile
let telegramState = 'loading'; // loading | ok | missing
let telegramQuery = '';
let telegramLimit = 50;

export async function loadTelegram() {
    const data = await fetchJSON('data/data_telegram.json', { revalidate: true, ttl: 5000 });
    telegram = Array.isArray(data) ? data : null;
    telegramState = telegram ? 'ok' : 'missing';
    renderTelegram();
}

export function setTelegramQuery(q) { telegramQuery = q; telegramLimit = 50; renderTelegram(); }

export function renderTelegram() {
    const box = $('#telegramFeed'), count = $('#telegramCount');
    if (!box) return;
    if (telegramState === 'loading') { clear(box).append(skeleton(5)); return; }
    if (!telegram) {
        setText(count, '');
        clear(box).append(emptyState('Feed OSINT non disponibile', 'Non riesco a leggere data/data_telegram.json.', { label: 'Riprova ora', run: () => { telegramState = 'loading'; renderTelegram(); loadTelegram(); } }));
        return;
    }
    const q = telegramQuery.trim().toLowerCase();
    const list = q ? telegram.filter((m) => `${m.text || ''} ${m.channel || ''}`.toLowerCase().includes(q)) : telegram;
    setText(count, `${list.length} messaggi`);
    if (!list.length) {
        clear(box).append(q
            ? emptyState('Nessun messaggio corrisponde', 'Prova con altre parole chiave o cancella la ricerca.', { label: 'Cancella ricerca', run: () => { const i = $('#telegramSearch'); if (i) i.value = ''; setTelegramQuery(''); } })
            : emptyState('Nessun messaggio OSINT', 'Il feed si riempie appena i canali monitorati pubblicano nuovi messaggi.'));
        return;
    }
    const frag = document.createDocumentFragment();
    list.slice(0, telegramLimit).forEach((m) => {
        frag.append(h('a', { class: 'tg-card', href: m.url, target: '_blank', rel: 'noopener noreferrer' },
            h('div', { class: 'tg-head' },
                h('span', { class: 'tg-channel', text: `@${m.channel || ''}` }),
                h('span', { class: 'muted small', title: fmtDateTime(m.date), text: timeAgo(m.date) || fmtDateTime(m.date) })),
            h('p', { class: 'tg-body', text: m.text || '' }),
            m.forwarded_from && h('span', { class: 'muted small', text: `↩ ${m.forwarded_from}` })));
    });
    if (list.length > telegramLimit) {
        frag.append(h('button', { class: 'btn more', type: 'button', text: `Mostra altri ${Math.min(50, list.length - telegramLimit)} di ${list.length - telegramLimit}`, onClick: () => { telegramLimit += 50; renderTelegram(); } }));
    }
    const top = box.scrollTop;
    clear(box).append(frag);
    box.scrollTop = top;
}

/* ── ANSA ultima ora ────────────────────────────────────────────── */
let ansa = null;
let ansaCat = 'all';
let ansaTried = false;
let ansaLoading = false;

export async function loadAnsa() {
    ansaTried = true; ansaLoading = true;
    if (ansaCat !== 'all') renderAnsa();
    const data = await fetchJSON('data/data_ansa_ultima_ora.json', { revalidate: true, ttl: 5000 });
    ansa = data && typeof data === 'object' ? data : null;
    ansaLoading = false;
    if (ansaCat !== 'all') renderAnsa();
}

export function setNewsView(cat) {
    ansaCat = cat;
    $('#newsAll').hidden = cat !== 'all';
    $('#newsAnsa').hidden = cat === 'all';
    $$('.subnav [data-cat]').forEach((b) => {
        const on = b.dataset.cat === cat;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    if (cat !== 'all') { if (!ansaTried) loadAnsa(); else renderAnsa(); }
}

function renderAnsa() {
    const box = $('#ansaFeed');
    if (!box) return;
    clear(box);
    const title = $('#ansaTitle');
    if (title) title.textContent = `Ultima ora — ${ansaCat}`;
    if (ansaLoading) { box.append(skeleton(5)); return; }
    const items = ansa && Array.isArray(ansa[ansaCat]) ? ansa[ansaCat] : null;
    if (!items) { box.append(emptyState('Ultima ora non disponibile', 'Il file data/data_ansa_ultima_ora.json non è stato trovato.', { label: 'Riprova ora', run: loadAnsa })); return; }
    if (!items.length) { box.append(emptyState('Nessuna notizia in questa categoria', 'ANSA non ha ancora pubblicato notizie per questa sezione. Prova "Tutte".', { label: 'Mostra tutte', run: () => setNewsView('all') })); return; }
    const frag = document.createDocumentFragment();
    items.forEach((a) => frag.append(h('a', { class: 'ev-card ansa-card', href: a.link, target: '_blank', rel: 'noopener noreferrer' },
        h('div', { class: 'ev-tags' }, h('span', { class: 'ev-type', text: `ANSA · ${ansaCat}` }), h('span', { class: 'ansa-time', text: a.time || '' })),
        h('h3', { text: a.title || '' }))));
    box.append(frag);
}

/* ── Report 24h ─────────────────────────────────────────────────── */
let lastFocus = null;

/** Carica il report (una sola fetch condivisa) e lo disegna in `body`/`ts`. */
export async function loadReportInto(body, ts) {
    clear(body).append(skeleton(3, 'skel-block'));
    const data = await fetchJSON('data/report_daily.json', { revalidate: true, ttl: 30000 });
    renderReport(data, body, ts);
}

export function initReport() {
    const modal = $('#reportModal');
    if (!modal) return;
    const open = () => {
        lastFocus = document.activeElement;
        modal.hidden = false;
        document.body.classList.add('modal-open');
        $('#closeReportBtn').focus();
        loadReportInto($('#reportBody'), $('#reportTimestamp'));
    };
    const close = () => {
        modal.hidden = true;
        document.body.classList.remove('modal-open');
        lastFocus?.focus?.();
    };
    $('#expandReportBtn')?.addEventListener('click', open);
    $('#closeReportBtn')?.addEventListener('click', close);
    $('#reportOverlay')?.addEventListener('click', close);
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        if (e.key === 'Tab') {   // focus trap minimale
            const f = $$('button, a[href]', modal).filter((x) => !x.closest('[hidden]'));
            if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
}

function bars(rows, fmtVal, cls = '') {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return h('div', { class: 'vbars' }, rows.map((r) => h('div', { class: 'vbar' },
        h('div', { class: 'vbar-info' }, h('span', { text: r.l }), h('span', { text: fmtVal(r.v) })),
        h('div', { class: 'vbar-track' }, h('i', { class: cls, style: { width: `${(r.v / max) * 100}%` } })))));
}

function section(title, ...kids) { return h('section', { class: 'report-section' }, h('h3', { text: title }), ...kids); }

export function renderReport(data, body, ts) {
    clear(body);
    if (!data) {
        if (ts) ts.textContent = '';
        body.append(emptyState('Report non disponibile', 'Il file data/report_daily.json non è stato trovato.', { label: 'Riprova ora', run: () => loadReportInto(body, ts) }));
        return;
    }
    const g = data.day_at_glance || {};
    const when = parseTime(data.generated_at);
    if (ts) ts.textContent = `${when ? `Generato il ${when.toLocaleString('it-IT')}` : 'Ultime 24 ore'}${data.total_count != null ? ` · ${data.total_count} articoli analizzati` : ''}`;

    const dv = g.domestic_vs_international || {};
    const tot = num(dv.italia) + num(dv.international);
    const stat = (v, l) => h('div', { class: 'glance-card' }, h('div', { class: 'glance-value', text: String(v) }), h('div', { class: 'glance-label', text: l }));
    body.append(section('Giornata in sintesi', h('div', { class: 'glance-grid' },
        stat(g.total_articles ?? data.total_count ?? 'n/d', 'Articoli totali'),
        stat(g.peak_hour ? g.peak_hour.slot : 'n/d', `Fascia più attiva${g.peak_hour ? ` (${g.peak_hour.count})` : ''}`),
        stat(tot ? `${Math.round((num(dv.international) / tot) * 100)}%` : 'n/d', 'Copertura internazionale'),
        stat(g.geo_focus && g.geo_focus[0] ? g.geo_focus[0].region : 'n/d', 'Focus principale'))));

    const cols = h('div', { class: 'report-grid' });
    if (Array.isArray(g.geo_focus) && g.geo_focus.length) cols.append(section('Focus geografico', bars(g.geo_focus.map((x) => ({ l: x.region, v: num(x.mentions) })), (v) => `${v} menzioni`, 'geo')));
    if (Array.isArray(g.categories) && g.categories.length) cols.append(section('Categorie', bars(g.categories.map((x) => ({ l: x.name, v: num(x.score) })), (v) => String(v), 'cat')));
    if (cols.children.length) body.append(cols);

    const stories = Array.isArray(data.major_stories) ? data.major_stories : [];
    const heads = Array.isArray(data.latest_headlines) ? data.latest_headlines : [];
    if (stories.length || heads.length) {
        const wrap = h('div', { class: 'stories' });
        stories.forEach((s) => {
            const link = s.link || s.url || (s.articles && s.articles[0] && s.articles[0].url);
            const head = s.headline || s.title || '';
            const nSrc = s.count ?? s.n_sources;
            const src = s.source || (Array.isArray(s.sources) ? s.sources.join(', ') : '');
            wrap.append(h('div', { class: 'story' },
                link ? h('a', { class: 'story-head', href: link, target: '_blank', rel: 'noopener noreferrer', text: head }) : h('span', { class: 'story-head', text: head }),
                (nSrc != null || src) && h('div', { class: 'muted small', text: `${nSrc != null ? `${nSrc} font${nSrc === 1 ? 'e' : 'i'}` : ''}${src ? ` · ${src}` : ''}` }),
                Array.isArray(s.related) && s.related.length > 0 && h('ul', { class: 'related' }, s.related.map((r) => h('li', { text: typeof r === 'string' ? r : r.title || '' })))));
        });
        if (!stories.length) heads.forEach((x) => wrap.append(h('a', { class: 'story-head', href: x.link || x.url, target: '_blank', rel: 'noopener noreferrer', text: x.title })));
        body.append(section('Storie principali', wrap));
    }

    const vol = Object.entries(data.sources_volume || {}).sort((a, b) => b[1] - a[1]);
    if (vol.length) body.append(section('Volume per fonte', bars(vol.map(([k, v]) => ({ l: k.toUpperCase(), v: num(v) })), (v) => String(v))));
}

