/* widgets.js — widget TradingView personalizzabili nella barra inferiore */
import { h, $, prefs, bus } from './util.js';

const CATALOG = [
    { id: 'spx', symbol: 'FOREXCOM:SPXUSD', label: 'S&P 500' },
    { id: 'nasdaq', symbol: 'NASDAQ:NDX', label: 'Nasdaq 100' },
    { id: 'dax', symbol: 'XETR:DAX', label: 'DAX 40' },
    { id: 'nikkei', symbol: 'TVC:NI225', label: 'Nikkei 225' },
    { id: 'gold', symbol: 'OANDA:XAUUSD', label: 'Oro (XAU/USD)' },
    { id: 'silver', symbol: 'OANDA:XAGUSD', label: 'Argento (XAG/USD)' },
    { id: 'oil', symbol: 'TVC:USOIL', label: 'Petrolio WTI' },
    { id: 'btc', symbol: 'BINANCE:BTCUSDT', label: 'Bitcoin' },
    { id: 'eth', symbol: 'BINANCE:ETHUSDT', label: 'Ethereum' },
    { id: 'dxy', symbol: 'TVC:DXY', label: 'Indice dollaro (DXY)' },
    { id: 'eurusd', symbol: 'FX:EURUSD', label: 'EUR/USD' },
    { id: 'vix', symbol: 'TVC:VIX', label: 'VIX (volatilità)' },
];
const DEFAULTS = ['spx', 'gold', 'btc'];
const KEY = 'activeWidgets';

let active = load();
let row, picker;

function load() {
    try {
        const v = JSON.parse(prefs.get(KEY, 'null'));
        if (Array.isArray(v)) return v.filter((id) => CATALOG.some((c) => c.id === id));
    } catch { /* preferenza corrotta */ }
    return [...DEFAULTS];
}
const save = () => prefs.set(KEY, JSON.stringify(active));
const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';

let io = null;

/** Il widget TradingView (iframe + script esterno) viene creato solo quando il blocco entra in vista. */
function mountWidget(box, item) {
    if (box.dataset.mounted) return;
    box.dataset.mounted = '1';
    const cfg = JSON.stringify({
        symbol: item.symbol, width: '100%', height: '100%', locale: 'it', dateRange: '1M',
        colorTheme: isDark() ? 'dark' : 'light', isTransparent: true, autosize: true, largeChartUrl: '',
    });
    const iframe = h('iframe', { class: 'tv-frame', title: `Grafico ${item.label}`, scrolling: 'no', frameborder: '0' });
    iframe.srcdoc = `<!DOCTYPE html><html><head><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js" async>${cfg}<\/script></div></body></html>`;
    box.replaceChildren(iframe);
}

function block(item) {
    const slot = h('div', { class: 'chart-slot skeleton', 'aria-busy': 'true' });
    slot.__item = item;
    io?.observe(slot);
    return h('div', { class: 'chart-block', dataset: { id: item.id } },
        h('div', { class: 'chart-label' }, h('span', { text: item.label }),
            h('button', {
                class: 'icon-btn tiny', type: 'button', title: `Rimuovi ${item.label}`, 'aria-label': `Rimuovi ${item.label}`, text: '−',
                onClick: () => { active = active.filter((id) => id !== item.id); save(); render(); },
            })),
        slot);
}

function render() {
    io?.disconnect();
    row.querySelectorAll('.chart-block').forEach((b) => b.remove());
    active.forEach((id) => {
        const item = CATALOG.find((c) => c.id === id);
        if (item) row.append(block(item));
    });
    const empty = $('#chartsEmpty');
    if (empty) empty.hidden = active.length > 0;
}

function openPicker() {
    if (picker) { closePicker(); return; }
    const free = CATALOG.filter((c) => !active.includes(c.id));
    const host = $('#chartPicker');
    picker = h('div', { class: 'picker-inline', role: 'group', 'aria-label': 'Grafici disponibili', onKeydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } } },
        free.length
            ? free.map((c) => h('button', { class: 'chip', type: 'button', text: c.label, onClick: () => { active.push(c.id); save(); render(); closePicker(); } }))
            : h('p', { class: 'muted small', text: 'Tutti i grafici sono già attivi.' }));
    host.replaceChildren(picker); host.hidden = false;
    $('#addWidgetBtn')?.setAttribute('aria-expanded', 'true');
    picker.querySelector('button')?.focus();
}
function closePicker() {
    if (!picker) return;
    picker = null;
    const host = $('#chartPicker'); host.replaceChildren(); host.hidden = true;
    const b = $('#addWidgetBtn'); b?.setAttribute('aria-expanded', 'false'); b?.focus();
}

export function initWidgets() {
    row = $('#chartsRow');
    if (!row) return;
    io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
            if (!en.isIntersecting) return;
            io.unobserve(en.target);
            mountWidget(en.target, en.target.__item);
            en.target.classList.remove('skeleton'); en.target.removeAttribute('aria-busy');
        });
    }, { rootMargin: '120px' });
    $('#addWidgetBtn')?.addEventListener('click', openPicker);
    render();
    bus.on('theme', render);   // ricrea i widget con il tema corretto (solo quelli in vista verranno ricaricati)
}
