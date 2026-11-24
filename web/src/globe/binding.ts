/* Collega lo stato dell'app e i dati dei layer al controller del globo, fuori da React:
 * un cambiamento di stato non correlato (tab, ricerca nel feed, popover…) non tocca il globo. */
import type { LayerId, PointItem } from '@/lib/types'
import { fetchJSON } from '@/lib/data'
import { SEV_COLOR, sev3 } from '@/lib/domain'
import { useApp } from '@/store/app'
import { DEF, jamColor, LAYERS } from '@/layers/defs'
import { layerBus, layerData } from '@/layers/data'
import { newsPoints, newsRadius } from '@/layers/news'
import { applySatellites, pauseSatellites, recolorSatellites } from '@/layers/satellites'
import { conflicts, ensureRiskFallback } from '@/layers/loader'
import { ink } from '@/layers/palette'
import type { GlobeController, HexFeature, RingItem } from './controller'
import { parseCountries, type Country } from './basemap'

const CONFLICT_RISK: Record<string, number> = { high: 80, medium: 55, low: 30 }
const hexRgb = (c: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number]

export function bindGlobe(ctrl: GlobeController) {
  let countries: Country[] = []
  const flush = { rings: 0 }

  const riskMap = () => {
    const st = useApp.getState()
    const m = new Map<string, { risk: number; n: number; name?: string }>()
    if (st.markets?.countries) {
      for (const c of st.markets.countries) m.set(String(c.iso2).toUpperCase(), { risk: c.risk_score, n: c.n_events ?? 0, name: c.name })
    } else if (conflicts.list.length) {
      const byName = new Map<string, number>()
      conflicts.list.forEach((c) => (c.countries ?? []).forEach((n) => byName.set(n, CONFLICT_RISK[c.intensity ?? ''] ?? 30)))
      for (const c of countries) { const r = byName.get(c.admin) ?? byName.get(c.name); if (r && c.iso) m.set(c.iso, { risk: r, n: 0, name: c.admin }) }
    }
    return m
  }

  const renderRisk = () => {
    const on = useApp.getState().layers.risk
    ctrl.setRisk(riskMap(), on)
  }

  const renderRings = () => {
    const st = useApp.getState()
    const rings: RingItem[] = []
    const sel: PointItem[] = []
    const e = st.selectedId ? st.byId.get(st.selectedId) : null
    if (e && e.hasGeo) {
      rings.push({ lat: e.lat as number, lng: e.lng as number, maxR: 3 + 3 * (e.global_score / 100), color: hexRgb(SEV_COLOR[sev3(e.severity_band)]) })
      sel.push({ lat: e.lat as number, lng: e.lng as number, alt: 0.004, r: newsRadius(e.global_score) + 0.3, color: ink(st.theme, 1) })
    }
    if (st.layers.quakes) {
      layerData.quakes.filter((q) => q.mag >= 5).sort((a, b) => b.mag - a.mag).slice(0, 5)
        .forEach((q) => rings.push({ lat: q.lat, lng: q.lng, maxR: Math.max(2, q.mag * 0.6), color: hexRgb(SEV_COLOR.medium) }))
    }
    ctrl.setRings(rings)
    ctrl.setPoints('sel', sel)
    flush.rings++
  }

  const renderLayer = (id: LayerId) => {
    const st = useApp.getState()
    const on = st.layers[id]
    try {
      if (id === 'news') { ctrl.setPoints('news', on ? newsPoints(st.view) : []); renderRings() }
      else if (id === 'risk') renderRisk()
      else if (id === 'satellites') applySatellites(ctrl, on)
      else if (id === 'gpsjam') {
        const feats: HexFeature[] = on ? layerData.gpsjam.map((d) => ({
          geometry: { type: 'Polygon', coordinates: [[...d.polygon].reverse()] },   // d3-geo vuole anelli esterni orari
          cap: jamColor(d.bad_pct || 0), stroke: jamColor(d.bad_pct || 0, 0.9),
          alt: 0.008 + ((d.bad_pct || 0) / 100) * 0.03,
          polygon: d.polygon,
          tip: () => ({
            title: 'Interferenza GPS',
            badge: { text: `${(d.bad_pct || 0).toFixed(1)}% incertezza`, color: jamColor(d.bad_pct || 0, 1) },
            meta: [`Aerei affetti ${d.bad_ac} / ${d.total_ac}`],
          }),
        })) : []
        ctrl.setHexes(feats)
      } else {
        const def = DEF[id]
        if (def.points) ctrl.setPoints(id, on ? def.points(st.theme) : [])
        if (id === 'quakes') renderRings()
      }
    } catch (e) { console.error(`layer ${id} (globo):`, e) }
  }

  // confini dei paesi (geojson semplificato ≈160 KB; fallback al file completo)
  void (async () => {
    let geo = await fetchJSON<{ features?: unknown[] }>('data/countries.min.geojson')
    if (!geo || !Array.isArray(geo.features)) geo = await fetchJSON<{ features?: unknown[] }>('data/countries.geojson')
    if (!geo || !Array.isArray(geo.features)) return
    countries = parseCountries(geo.features as Parameters<typeof parseCountries>[0])
    ctrl.setCountries(countries, riskMap())
    renderRisk()
  })()

  // stato → globo
  let prev = useApp.getState()
  const unsub = useApp.subscribe((s) => {
    const p = prev
    prev = s
    if (s.theme !== p.theme) {
      ctrl.setTheme(s.theme)
      LAYERS.forEach((d) => { if (s.layers[d.id] && d.points) renderLayer(d.id) })
      recolorSatellites(); renderRings()
    }
    if (s.view !== p.view || s.layers.news !== p.layers.news) renderLayer('news')
    if (s.selectedId !== p.selectedId) renderRings()
    if (s.layers !== p.layers) {
      for (const id of Object.keys(s.layers) as LayerId[]) if (id !== 'news' && s.layers[id] !== p.layers[id]) renderLayer(id)
      if (s.layers.risk && !p.layers.risk) void ensureRiskFallback()
    }
    if (s.markets !== p.markets) renderRisk()
  })
  const unbus = layerBus.on((id) => { if (id === '*') LAYERS.forEach((d) => renderLayer(d.id)); else renderLayer(id) })

  const onVis = () => pauseSatellites(document.hidden)
  document.addEventListener('visibilitychange', onVis)

  renderLayer('news')
  renderLayer('risk')
  ctrl.onEmptyClick = () => ctrl.world.pathsData([])

  return () => { unsub(); unbus(); document.removeEventListener('visibilitychange', onVis) }
}
