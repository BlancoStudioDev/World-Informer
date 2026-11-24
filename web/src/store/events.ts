import type { EventItem, EventsDoc, Filters, RawEvent } from '@/lib/types'
import { normSector, regionOfCountry } from '@/lib/domain'
import { num, parseTime } from '@/lib/format'

export const FRESH_MS = 60 * 60 * 1000

export const rawSig = (r: RawEvent) => `${r.last_seen}|${r.global_score}|${r.severity_band}|${r.n_sources}|${r.title}`

export function prepEvent(raw: RawEvent): EventItem {
  const countries = Array.isArray(raw.countries) ? raw.countries : []
  const sources = Array.isArray(raw.sources) ? raw.sources : []
  const sector: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw.sector_scores || {})) sector[normSector(k)] = num(v)
  const lat = raw.lat, lng = raw.lng
  const hasGeo = typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng)
  return {
    ...raw,
    countries,
    articles: Array.isArray(raw.articles) ? raw.articles : [],
    sources,
    explanation: Array.isArray(raw.explanation) ? raw.explanation : [],
    severity: num(raw.severity),
    global_score: num(raw.global_score),
    confidence: num(raw.confidence),
    sector,
    regions: new Set(countries.map(regionOfCountry).filter((x): x is string => !!x)),
    t: (parseTime(raw.first_seen) ?? new Date(0)).getTime(),
    hasGeo,
    text: [raw.title, raw.summary, raw.location_label, raw.event_label, ...countries.map((c) => c.name), ...sources]
      .filter(Boolean).join(' ').toLowerCase(),
    sig: rawSig(raw),
  }
}

export const isFresh = (e: EventItem) => Date.now() - e.t < FRESH_MS

export function computeView(events: EventItem[], f: Filters): EventItem[] {
  const q = f.q.trim().toLowerCase()
  const types = new Set(f.types)
  const list = events.filter((e) =>
    (!types.size || types.has(e.event_type ?? '')) &&
    e.severity >= f.minSev &&
    (!f.region || e.regions.has(f.region)) &&
    (!f.sector || (e.sector[f.sector] ?? 0) >= 0.3) &&
    (!q || e.text.includes(q)))
  list.sort(f.sort === 'recent' ? (a, b) => b.t - a.t : (a, b) => b.global_score - a.global_score)
  return list
}

export const sameDoc = (doc: EventsDoc, prevGen: string | null, prevLen: number) =>
  doc.generated_at === prevGen && doc.events.length === prevLen
