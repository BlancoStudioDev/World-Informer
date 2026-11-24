export type SeverityBand = 'minimal' | 'low' | 'moderate' | 'high' | 'severe'

export interface RawArticle { title?: string; url: string; source?: string; published_at?: string }
export interface RawCountry { iso2: string; name?: string; weight?: number; region?: string }

export interface RawEvent {
  id: string
  title: string
  summary?: string
  event_type?: string
  event_label?: string
  severity?: number
  severity_band?: SeverityBand
  sentiment?: number
  global_score?: number
  confidence?: number
  persistence_days?: number
  countries?: RawCountry[]
  lat?: number | null
  lng?: number | null
  location_label?: string
  sector_scores?: Record<string, number>
  top_sectors?: string[]
  sources?: string[]
  n_sources?: number
  n_articles?: number
  articles?: RawArticle[]
  first_seen?: string
  last_seen?: string
  explanation?: string[]
}

export interface EventsDoc { generated_at?: string; window_hours?: number; events: RawEvent[] }

/** Evento normalizzato: l'identità dell'oggetto resta stabile finché i dati non cambiano. */
export interface EventItem extends Omit<RawEvent, 'countries' | 'articles' | 'sources' | 'explanation' | 'severity' | 'global_score' | 'confidence'> {
  countries: RawCountry[]
  articles: RawArticle[]
  sources: string[]
  explanation: string[]
  severity: number
  global_score: number
  confidence: number
  sector: Record<string, number>
  regions: Set<string>
  t: number
  hasGeo: boolean
  text: string
  sig: string
  newAt?: number
}

export interface MarketsDoc {
  generated_at?: string
  sectors: { sector: string; label?: string; score: number; trend?: 'up' | 'down' | 'flat'; top_events?: string[] }[]
  countries?: { iso2: string; name?: string; risk_score: number; n_events?: number; lat?: number; lng?: number }[]
}

export type TabId = 'news' | 'markets' | 'telegram' | 'report'
export type SortMode = 'recent' | 'priority'
export type NewsSource = 'events' | 'Mondo' | 'Economia'

export interface Filters {
  types: string[]
  minSev: number
  region: string
  sector: string
  q: string
  sort: SortMode
}

export type LayerId =
  | 'news' | 'risk' | 'flights' | 'ships' | 'nuclear' | 'gpsjam'
  | 'quakes' | 'firms' | 'radiation' | 'satellites'
export type LayerStatus = 'idle' | 'loading' | 'ok' | 'missing'

export interface TipData {
  title: string
  sub?: string
  badge?: { text: string; color: string }
  meta?: string[]
}

/** Marker disegnato in WebGL (nessun elemento DOM). r = raggio in gradi. */
export interface PointItem {
  lat: number
  lng: number
  alt: number
  r: number
  color: string
  tip?: () => TipData
  click?: () => void
}
