import type { LayerId, PointItem, TipData } from '@/lib/types'
import { absUrl, fetchJSON } from '@/lib/data'
import { clamp, fmtDateTime, num, openExternal } from '@/lib/format'
import { SEV_COLOR } from '@/lib/domain'
import { useApp } from '@/store/app'
import { ink } from './palette'
import {
  layerData, type Aircraft, type Fire, type Jam, type Nuclear, type Quake, type RadPoint, type Ship,
} from './data'

type Theme = 'light' | 'dark'
export type Group = 'news' | 'mil' | 'env'

export interface LayerDef {
  id: LayerId
  group: Group
  label: string
  title: string
  refreshMs?: number
  /** colore del campione nel popover */
  swatch(theme: Theme): string
  /** null = nessun download (news/risk) */
  load?(): Promise<boolean>
  count?(): number
  /** marker WebGL */
  points?(theme: Theme): PointItem[]
}

export const FIRMS_CAP = 3000

/* ── FIRMS (download e parsing in worker) ── */
let firmsWorker: Worker | null = null
let firmsQuery = 0
let firmsMatched = 0
export function queryFirms(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!firmsWorker) return resolve(false)
    const id = ++firmsQuery
    const w = firmsWorker
    const onMsg = (e: MessageEvent) => {
      if (e.data.type !== 'items' || e.data.id !== id) return
      w.removeEventListener('message', onMsg)
      layerData.firms = e.data.items; firmsMatched = e.data.matched; resolve(true)
    }
    w.addEventListener('message', onMsg)
    w.postMessage({ type: 'query', min: useApp.getState().frpMin, cap: FIRMS_CAP, id })
  })
}
const firmsColor = (frp: number, theme: Theme) => (frp > 50 ? SEV_COLOR.high : frp > 10 ? SEV_COLOR.medium : ink(theme, 3))
const firmsTip = (f: Fire): TipData => ({
  title: 'Hotspot termico',
  sub: `${f.lat.toFixed(2)}, ${f.lng.toFixed(2)}`,
  badge: { text: `FRP ${f.frp} MW`, color: firmsColor(f.frp ?? 0, 'light') },
  meta: [[f.confidence, f.date, f.time, f.sensor].filter(Boolean).join(' · ')],
})

/* ── Terremoti ── */
const quakeColor = (m: number, theme: Theme) => (m >= 6 ? SEV_COLOR.high : m >= 4.5 ? SEV_COLOR.medium : ink(theme, 3))
export const quakeTip = (q: Quake): TipData => ({
  title: `Terremoto M${q.mag.toFixed(1)}`, sub: q.place,
  meta: [`Profondità ${Math.round(q.depth)} km · ${fmtDateTime(q.time)}`, 'Clicca per i dettagli USGS'],
})

/* ── Voli ── */
export const isEmergency = (a: Aircraft) => a.category === 'emergency' || String(a.squawk) === '7700'
export const flightTip = (a: Aircraft): TipData => ({
  title: `${isEmergency(a) ? 'EMERGENZA' : 'MIL'} ${(a.flight || a.hex || '').trim() || 'n/d'}`,
  meta: [`${a.type || '?'} · ${a.alt === 'ground' ? 'a terra' : a.alt != null ? `${a.alt} ft` : '?'} · ${a.gs != null ? `${Math.round(a.gs)} kt` : '?'}`],
})
export const flightLink = (a: Aircraft) => a.hex && `https://globe.adsb.lol/?icao=${encodeURIComponent(a.hex)}`

/* ── Navi ── */
export const SHIP_LABEL = { military: 'MIL', rescue: 'SAR', law: 'POL' } as const
function shipKind(s: { category?: string; type?: string }): Ship['kind'] | null {
  const t = `${s.category || ''} ${s.type || ''}`.toLowerCase()
  if (/rescue|\bsar\b|search/.test(t)) return 'rescue'
  if (/law|police|polizia|coast ?guard|customs|patrol|enforcement|guardia/.test(t)) return 'law'
  if (/milit|navy|naval|warship|defen/.test(t)) return 'military'
  return null
}
export const shipTip = (s: Ship): TipData => ({
  title: `${SHIP_LABEL[s.kind]} ${s.name || s.mmsi}`,
  meta: [`${s.type || ''} · ${s.speed != null ? `${s.speed} kt` : 'n/d'}`],
})
export const shipColor = (k: Ship['kind'], theme: Theme) => ink(theme, k === 'military' ? 2 : 3)

/* ── GPS jam ── */
export const jamColor = (pct: number, a = 0.55) => {
  const [r, g, b] = pct >= 80 ? [217, 83, 79] : pct >= 40 ? [224, 160, 48] : [113, 113, 122]
  return `rgba(${r},${g},${b},${a})`
}

/* ── definizione dei layer ── */
const nuclearTip = (d: Nuclear): TipData => ({ title: d.name, sub: `${d.lat.toFixed(2)}, ${d.lng.toFixed(2)}`, meta: d.output ? [`Potenza ${d.output}`] : [] })
const radTip = (d: RadPoint): TipData => ({ title: 'Sensore radiazioni', meta: [`${d.value} ${d.unit} · ${fmtDateTime(d.captured)}`] })

export const LAYERS: LayerDef[] = [
  {
    id: 'news', group: 'news', label: 'Notizie', title: 'Eventi da events.json',
    swatch: () => SEV_COLOR.medium,
  },
  {
    id: 'risk', group: 'news', label: 'Rischio paesi', title: 'Tinta lieve e tooltip dei paesi a rischio (markets.json)',
    swatch: (t) => ink(t, 3),
  },
  {
    id: 'flights', group: 'mil', label: 'Voli', title: 'Voli militari e in emergenza (adsb.lol)', refreshMs: 60_000,
    swatch: (t) => ink(t, 1),
    async load() {
      const doc = await fetchJSON<{ timestamp?: string; aircraft?: Aircraft[] } | Aircraft[]>('data/data_flights.json', { revalidate: true, ttl: 20_000 })
      const list = Array.isArray(doc) ? doc : doc?.aircraft
      if (!Array.isArray(list)) return false
      layerData.flights = list.filter((a) => typeof a.lat === 'number' && typeof a.lng === 'number')
      return true
    },
    points: (t) => layerData.flights.map((a) => ({
      lat: a.lat, lng: a.lng, alt: 0.01, r: 0.5, color: isEmergency(a) ? SEV_COLOR.high : ink(t, 1),
      tip: () => flightTip(a), click: () => { const l = flightLink(a); if (l) openExternal(l) },
    })),
  },
  {
    id: 'ships', group: 'mil', label: 'Navi', title: "Navi militari, di soccorso e forze dell'ordine (AIS)", refreshMs: 60_000,
    swatch: (t) => ink(t, 2),
    async load() {
      const doc = await fetchJSON<{ ships?: Omit<Ship, 'kind'>[] } | Omit<Ship, 'kind'>[]>('data/data_ships.json', { revalidate: true, ttl: 20_000 })
      const list = Array.isArray(doc) ? doc : doc?.ships
      if (!Array.isArray(list)) return false
      layerData.ships = list
        .map((s) => ({ s, k: shipKind(s) }))
        .filter((x): x is { s: Omit<Ship, 'kind'>; k: Ship['kind'] } => !!x.k && typeof x.s.lat === 'number' && typeof x.s.lng === 'number')
        .map(({ s, k }) => ({ ...s, kind: k }))
      return true
    },
    points: (t) => layerData.ships.map((s) => ({
      lat: s.lat, lng: s.lng, alt: 0.007, r: 0.5, color: shipColor(s.kind, t), tip: () => shipTip(s),
    })),
  },
  {
    id: 'nuclear', group: 'mil', label: 'Nucleare', title: 'Impianti nucleari e siti strategici',
    swatch: (t) => ink(t, 2),
    async load() {
      const data = await fetchJSON<Nuclear[]>('data/data_nuclear.json', { ttl: 60_000 })
      if (!Array.isArray(data)) return false
      layerData.nuclear = data.filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number')
      return true
    },
    points: (t) => layerData.nuclear.map((d) => ({ lat: d.lat, lng: d.lng, alt: 0.005, r: 0.65, color: ink(t, 2), tip: () => nuclearTip(d) })),
  },
  {
    id: 'gpsjam', group: 'mil', label: 'GPS Jam', title: 'Interferenze GNSS / GPS jamming', refreshMs: 120_000,
    swatch: () => SEV_COLOR.medium,
    async load() {
      const data = await fetchJSON<Jam[]>('data/data_gpsjam.json', { revalidate: true, ttl: 30_000 })
      if (!Array.isArray(data)) return false
      layerData.gpsjam = data.filter((d) => d.severity !== 'green' && Array.isArray(d.polygon))
      return true
    },
  },
  {
    id: 'quakes', group: 'env', label: 'Terremoti', title: 'USGS — terremoti M2.5+ nelle ultime 24h', refreshMs: 5 * 60_000,
    swatch: () => SEV_COLOR.high,
    async load() {
      const geo = await fetchJSON<{ features?: { geometry: { coordinates: number[] }; properties: { mag?: number; place?: string; time?: number; url?: string } }[] }>(
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { ttl: 60_000 })
      if (!geo || !Array.isArray(geo.features)) return false
      layerData.quakes = geo.features.map((f) => ({
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], depth: f.geometry.coordinates[2],
        mag: num(f.properties.mag), place: f.properties.place ?? '', time: f.properties.time ?? 0, url: f.properties.url,
      }))
      return true
    },
    points: (t) => layerData.quakes.map((q) => ({
      lat: q.lat, lng: q.lng, alt: 0.004, r: clamp(0.3 + q.mag * 0.12, 0.4, 1.2), color: quakeColor(q.mag, t),
      tip: () => quakeTip(q), click: () => { if (q.url) openExternal(q.url) },
    })),
  },
  {
    id: 'firms', group: 'env', label: 'Incendi', title: 'NASA FIRMS — hotspot termici (FRP)',
    swatch: () => SEV_COLOR.high,
    async load() {
      if (typeof Worker === 'undefined') return false
      if (firmsWorker) return queryFirms()
      const w = new Worker(new URL('../workers/firms.worker.ts', import.meta.url), { type: 'module' })
      const ok = await new Promise<boolean>((resolve) => {
        w.onmessage = (e) => { if (e.data.type === 'loaded') resolve(true); else if (e.data.type === 'error') resolve(false) }
        w.onerror = () => resolve(false)
        w.postMessage({ type: 'load', url: absUrl('data/data_firms.json') })
      })
      if (!ok) { w.terminate(); return false }
      firmsWorker = w
      return queryFirms()
    },
    count: () => layerData.firms.length,
    points: (t) => layerData.firms.map((f) => ({
      lat: f.lat, lng: f.lng, alt: 0.003, r: clamp(0.2 + (f.frp || 0) / 1000, 0.2, 0.55), color: firmsColor(f.frp ?? 0, t), tip: () => firmsTip(f),
    })),
  },
  {
    id: 'radiation', group: 'env', label: 'Radiazioni', title: 'Safecast — misure di radioattività', refreshMs: 10 * 60_000,
    swatch: (t) => ink(t, 3),
    async load() {
      const data = await fetchJSON<{ points?: RadPoint[] }>('data/data_radiation.json', { ttl: 60_000 })
      if (!data || !Array.isArray(data.points) || !data.points.length) return false
      layerData.radiation = data.points.filter((d) => d.lat != null && d.lng != null)
        .map((d) => ({ lat: d.lat, lng: d.lng, value: num(d.value), unit: d.unit || 'cpm', captured: d.captured }))
      return true
    },
    points: (t) => layerData.radiation.map((d) => ({
      lat: d.lat, lng: d.lng, alt: 0.003, r: 0.4, color: d.value > 50 ? SEV_COLOR.high : ink(t, 3), tip: () => radTip(d),
    })),
  },
  {
    id: 'satellites', group: 'env', label: 'Satelliti', title: 'Satelliti in tempo reale (TLE), orbita e ISS',
    swatch: (t) => ink(t, 3),
    // il caricamento e il rendering sono in layers/satellites.ts (worker dedicato)
  },
]
export const DEF: Record<LayerId, LayerDef> = Object.fromEntries(LAYERS.map((d) => [d.id, d])) as Record<LayerId, LayerDef>
export const getFirmsMatched = () => firmsMatched
export { nuclearTip, radTip }
