import { useState } from 'react'
import { Minus, Plus, TrendingDown, TrendingUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { IconBtn } from '@/components/IconBtn'
import { SevDot } from '@/components/SevBadge'
import { TradingViewChart, type ChartItem } from '@/components/panels/TradingView'
import { clamp, fmtTime, num, timeAgo } from '@/lib/format'
import { normSector, REGIONS, sectorLabel, riskLabel } from '@/lib/domain'
import { prefs } from '@/lib/data'
import { mapBus } from '@/lib/bus'
import { selectEvent, useApp } from '@/store/app'
import { refreshData } from '@/store/refresh'
import { cn } from '@/lib/utils'

const CATALOG: ChartItem[] = [
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
]
const KEY = 'activeWidgets'
function loadActive(): string[] {
  try {
    const v = JSON.parse(prefs.get(KEY, 'null'))
    if (Array.isArray(v)) return v.filter((id) => CATALOG.some((c) => c.id === id))
  } catch { /* preferenza corrotta */ }
  return ['spx', 'gold', 'btc']
}

const Bar = ({ v }: { v: number }) => (
  <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
    <i className="block h-full rounded-full bg-foreground/50" style={{ width: `${Math.max(2, clamp(v, 0, 100))}%` }} />
  </span>
)

const H = ({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h3 className="text-sm font-semibold">{children}</h3>{aside}
  </div>
)

const TREND = { up: [TrendingUp, 'in aumento'], down: [TrendingDown, 'in calo'], flat: [Minus, 'stabile'] } as const

function Sectors() {
  const doc = useApp((s) => s.markets)
  const byId = useApp((s) => s.byId)
  const [open, setOpen] = useState<Set<string>>(() => new Set(doc ? [...doc.sectors].sort((a, b) => b.score - a.score).slice(0, 2).map((s) => s.sector) : []))
  if (!doc) return null
  const sectors = [...doc.sectors].sort((a, b) => num(b.score) - num(a.score))
  return (
    <section>
      <H aside={<span className="text-xs text-muted-foreground">{doc.generated_at ? `${fmtTime(doc.generated_at)} · ${timeAgo(doc.generated_at)}` : ''}</span>}>Impatto sui settori</H>
      <ul className="divide-y rounded-lg border bg-card">
        {sectors.map((s) => {
          const score = clamp(num(s.score), 0, 100)
          const [Icon, tl] = TREND[s.trend ?? 'flat'] ?? TREND.flat
          const isOpen = open.has(s.sector)
          const label = sectorLabel(s.sector, s.label)
          const events = (s.top_events ?? []).map((id) => byId.get(id)).filter((e) => !!e)
          return (
            <li key={s.sector}>
              <button
                type="button" aria-expanded={isOpen}
                onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(s.sector)) n.delete(s.sector); else n.add(s.sector); return n })}
                className="grid w-full grid-cols-[minmax(0,1fr)_40px_28px_16px] items-center gap-2 px-3 py-2.5 text-left text-sm outline-none focus-visible:bg-muted/60"
              >
                <span className="truncate">{label}</span>
                <Bar v={score} />
                <span className="text-right text-muted-foreground tabular-nums">{Math.round(score)}</span>
                <Icon className="size-3.5 text-muted-foreground" aria-label={`trend ${tl}`} />
              </button>
              {isOpen && (
                <ul className="space-y-0.5 px-3 pb-2">
                  {events.length ? events.slice(0, 4).map((e) => (
                    <li key={e!.id}>
                      <button type="button" onClick={() => selectEvent(e!.id, { fly: true })} className="flex w-full items-start gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                        <SevDot band={e!.severity_band} className="mt-1" />
                        <span className="min-w-0 flex-1 text-muted-foreground">{e!.title}</span>
                        <span className="tabular-nums text-muted-foreground" title="Impatto su questo settore">{Math.round((e!.sector[normSector(s.sector)] ?? 0) * 100)}</span>
                      </button>
                    </li>
                  )) : <li className="text-xs text-muted-foreground">Nessun evento trainante nella finestra corrente.</li>}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Countries() {
  const doc = useApp((s) => s.markets)
  const list = [...(doc?.countries ?? [])].sort((a, b) => num(b.risk_score) - num(a.risk_score)).slice(0, 10)
  return (
    <section>
      <H>Paesi a maggior rischio</H>
      {!list.length ? <p className="text-xs text-muted-foreground">Nessun paese con rischio rilevante.</p> : (
        <ol className="divide-y rounded-lg border bg-card">
          {list.map((c, i) => (
            <li key={c.iso2}>
              <button
                type="button" title="Mostra sulla mappa"
                onClick={() => { if (typeof c.lat === 'number' && typeof c.lng === 'number') mapBus.fly({ lat: c.lat, lng: c.lng, altitude: 1.7, zoom: 5 }) }}
                className="grid w-full grid-cols-[16px_minmax(0,1fr)_40px_28px] items-center gap-2 px-3 py-2.5 text-left text-sm outline-none focus-visible:bg-muted/60"
              >
                <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="truncate">{c.name || c.iso2} <span className="text-xs text-muted-foreground">· {num(c.n_events)}</span></span>
                <Bar v={c.risk_score} />
                <span className="text-right text-muted-foreground tabular-nums" title={riskLabel(c.risk_score)}>{Math.round(c.risk_score)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function RegionRisk() {
  const events = useApp((s) => s.events)
  const region = useApp((s) => s.filters.region)
  const setFilters = useApp((s) => s.setFilters)
  const setTab = useApp((s) => s.setTab)
  const rows = REGIONS.map((r) => {
    const evs = events.filter((e) => e.regions.has(r.key))
    const scores = evs.map((e) => e.global_score)
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
    const max = scores.length ? Math.max(...scores) : 0
    return { ...r, n: evs.length, v: 0.6 * avg + 0.4 * max, crit: evs.filter((e) => e.severity_band === 'high' || e.severity_band === 'severe').length }
  })
  return (
    <section>
      <H>Rischio per regione</H>
      <ul className="divide-y rounded-lg border bg-card">
        {rows.map((r) => (
          <li key={r.key}>
            <button
              type="button" aria-pressed={region === r.key}
              onClick={() => { setFilters({ region: region === r.key ? '' : r.key }); setTab('news') }}
              className={cn('grid w-full grid-cols-[minmax(0,1fr)_40px_28px] items-center gap-2 px-3 py-2.5 text-left text-sm outline-none focus-visible:bg-muted/60', region === r.key && 'bg-muted')}
            >
              <span className="truncate">{r.label} <span className="text-xs text-muted-foreground">· {r.n}{r.crit ? ` (${r.crit} critici)` : ''}</span></span>
              <Bar v={r.v} />
              <span className="text-right text-muted-foreground tabular-nums">{Math.round(r.v)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-muted-foreground">Seleziona una regione per filtrare le notizie.</p>
    </section>
  )
}

function Charts() {
  const theme = useApp((s) => s.theme)
  const [active, setActive] = useState(loadActive)
  const save = (a: string[]) => { setActive(a); prefs.set(KEY, JSON.stringify(a)) }
  const free = CATALOG.filter((c) => !active.includes(c.id))
  return (
    <section>
      <H aside={
        <Popover>
          <PopoverTrigger asChild><IconBtn size="sm" label="Aggiungi grafico"><Plus /></IconBtn></PopoverTrigger>
          <PopoverContent align="end" className="w-56 gap-1 p-2">
            {free.length ? free.map((c) => (
              <Button key={c.id} variant="ghost" size="sm" className="justify-start font-normal" onClick={() => save([...active, c.id])}>{c.label}</Button>
            )) : <p className="p-2 text-xs text-muted-foreground">Tutti i grafici sono già attivi.</p>}
          </PopoverContent>
        </Popover>
      }>Grafici</H>
      {!active.length && <p className="text-xs text-muted-foreground">Nessun grafico attivo. Aggiungine uno per seguire un indice o una materia prima.</p>}
      <div className="space-y-3">
        {active.map((id) => {
          const item = CATALOG.find((c) => c.id === id)!
          return (
            <div key={id}>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{item.label}</span>
                <IconBtn size="sm" label={`Rimuovi ${item.label}`} onClick={() => save(active.filter((x) => x !== id))}><X className="size-3.5" /></IconBtn>
              </div>
              <TradingViewChart item={item} theme={theme} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function MarketsPanel() {
  const status = useApp((s) => s.marketsStatus)
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pt-1 pb-4">
      {status === 'loading' && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 rounded-md" />)}</div>}
      {status === 'missing' && <EmptyState title="Dati di mercato non disponibili" text="Il file markets.json non è stato trovato. Il pannello si aggiorna appena la pipeline lo produce." action={{ label: 'Riprova ora', run: () => refreshData({ manual: true }) }} />}
      {status === 'ok' && <><Sectors /><Countries /></>}
      <RegionRisk />
      <Charts />
    </div>
  )
}
