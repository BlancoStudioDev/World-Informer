import { clamp, num, parseTime, safeUrl } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Story { headline?: string; title?: string; count?: number; n_sources?: number; source?: string; sources?: string[]; link?: string; url?: string; articles?: { url?: string }[]; related?: (string | { title?: string })[] }
export interface Report {
  generated_at?: number | string
  total_count?: number
  day_at_glance?: {
    total_articles?: number
    peak_hour?: { slot: string; count: number }
    geo_focus?: { region: string; mentions: number }[]
    categories?: { name: string; score: number }[]
    domestic_vs_international?: { italia?: number; international?: number }
  }
  major_stories?: Story[]
  latest_headlines?: { title: string; link?: string; url?: string }[]
  sources_volume?: Record<string, number>
}

function Bars({ rows, fmt }: { rows: { l: string; v: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.v))
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.l}>
          <div className="flex justify-between text-xs"><span className="truncate">{r.l}</span><span className="shrink-0 text-muted-foreground tabular-nums">{fmt(r.v)}</span></div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted"><i className="block h-full rounded-full bg-foreground/50" style={{ width: `${clamp((r.v / max) * 100, 2, 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}
const Section = ({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={className}><h3 className="mb-2 text-sm font-semibold">{title}</h3>{children}</section>
)

export function reportStamp(d: Report | null) {
  if (!d) return ''
  const when = parseTime(d.generated_at)
  return `${when ? `Generato il ${when.toLocaleString('it-IT')}` : 'Ultime 24 ore'}${d.total_count != null ? ` · ${d.total_count} articoli analizzati` : ''}`
}

export function ReportView({ data, wide = false }: { data: Report; wide?: boolean }) {
  const g = data.day_at_glance ?? {}
  const dv = g.domestic_vs_international ?? {}
  const tot = num(dv.italia) + num(dv.international)
  const stats: [string, string][] = [
    [String(g.total_articles ?? data.total_count ?? 'n/d'), 'Articoli totali'],
    [g.peak_hour ? g.peak_hour.slot : 'n/d', `Fascia più attiva${g.peak_hour ? ` (${g.peak_hour.count})` : ''}`],
    [tot ? `${Math.round((num(dv.international) / tot) * 100)}%` : 'n/d', 'Copertura internazionale'],
    [g.geo_focus?.[0]?.region ?? 'n/d', 'Focus principale'],
  ]
  const stories = Array.isArray(data.major_stories) ? data.major_stories : []
  const heads = Array.isArray(data.latest_headlines) ? data.latest_headlines : []
  const vol = Object.entries(data.sources_volume ?? {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-6">
      <Section title="Giornata in sintesi">
        <dl className="grid grid-cols-2 gap-2">
          {stats.map(([v, l]) => (
            <div key={l} className="rounded-lg border bg-card p-3">
              <dd className="truncate text-lg leading-tight font-semibold">{v}</dd>
              <dt className="mt-0.5 text-xs text-muted-foreground">{l}</dt>
            </div>
          ))}
        </dl>
      </Section>
      <div className={cn('space-y-6', wide && 'grid grid-cols-2 gap-6 space-y-0')}>
        {g.geo_focus?.length ? <Section title="Focus geografico"><Bars rows={g.geo_focus.map((x) => ({ l: x.region, v: num(x.mentions) }))} fmt={(v) => `${v} menzioni`} /></Section> : null}
        {g.categories?.length ? <Section title="Categorie"><Bars rows={g.categories.map((x) => ({ l: x.name, v: num(x.score) }))} fmt={String} /></Section> : null}
      </div>
      {(stories.length > 0 || heads.length > 0) && (
        <Section title="Storie principali">
          <ul className="divide-y rounded-lg border bg-card">
            {stories.length ? stories.map((s, i) => {
              const link = s.link || s.url || s.articles?.[0]?.url
              const head = s.headline || s.title || ''
              const n = s.count ?? s.n_sources
              const src = s.source || (Array.isArray(s.sources) ? s.sources.join(', ') : '')
              return (
                <li key={i} className="px-3 py-2.5 text-xs">
                  {link ? <a href={safeUrl(link)} target="_blank" rel="noopener noreferrer" className="text-sm leading-snug font-medium underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">{head}</a> : <span className="text-sm font-medium">{head}</span>}
                  {(n != null || src) && <p className="mt-0.5 text-muted-foreground">{n != null ? `${n} font${n === 1 ? 'e' : 'i'}` : ''}{src ? ` · ${src}` : ''}</p>}
                  {Array.isArray(s.related) && s.related.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">{s.related.map((r, j) => <li key={j}>{typeof r === 'string' ? r : r.title}</li>)}</ul>
                  )}
                </li>
              )
            }) : heads.map((h, i) => (
              <li key={i} className="px-3 py-2.5"><a href={safeUrl(h.link || h.url)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline-offset-2 hover:underline">{h.title}</a></li>
            ))}
          </ul>
        </Section>
      )}
      {vol.length > 0 && <Section title="Volume per fonte"><Bars rows={vol.map(([k, v]) => ({ l: k.toUpperCase(), v: num(v) }))} fmt={String} /></Section>}
    </div>
  )
}
