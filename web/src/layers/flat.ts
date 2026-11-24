/* Costruttori dei layer per la mappa piatta (Leaflet). Importato solo dal chunk lazy della mappa 2D. */
import L from 'leaflet'
import type { LayerId, TipData } from '@/lib/types'
import { clamp, openExternal } from '@/lib/format'
import { SEV_COLOR, sev3, SEV_LABEL, sevColor } from '@/lib/domain'
import { useApp, selectEvent } from '@/store/app'
import { layerData } from './data'
import { ink } from './palette'
import { flightLink, flightTip, isEmergency, jamColor, quakeTip, shipColor, shipTip, nuclearTip, radTip } from './defs'

const tipHtml = (t: TipData) => {
  const d = document.createElement('div')
  const b = document.createElement('strong'); b.textContent = t.title; d.append(b)
  for (const line of [t.sub, ...(t.meta ?? [])]) if (line) { d.append(document.createElement('br')); d.append(document.createTextNode(line)) }
  return d
}
const dot = (lat: number, lng: number, o: L.CircleMarkerOptions) => L.circleMarker([lat, lng], { weight: 1, color: '#fff', fillOpacity: 0.85, ...o })

export function buildFlat(id: LayerId): L.Layer | null {
  const st = useApp.getState()
  const theme = st.theme
  const grp = L.layerGroup()
  switch (id) {
    case 'news':
      for (const e of st.view) {
        if (!e.hasGeo) continue
        dot(e.lat as number, e.lng as number, { radius: 3 + 6 * Math.sqrt(clamp(e.global_score, 0, 100) / 100), fillColor: sevColor(e.severity_band), weight: 1 })
          .bindTooltip(tipHtml({ title: e.title, sub: `${e.location_label ?? ''} · ${SEV_LABEL[sev3(e.severity_band)]}` }), { direction: 'top', offset: [0, -4] })
          .on('click', () => selectEvent(e.id, { fly: false })).addTo(grp)
      }
      return grp
    case 'flights':
      layerData.flights.forEach((a) => dot(a.lat, a.lng, { radius: 4, fillColor: isEmergency(a) ? SEV_COLOR.high : ink(theme, 1) })
        .bindTooltip(tipHtml(flightTip(a))).on('click', () => { const l = flightLink(a); if (l) openExternal(l) }).addTo(grp))
      return grp
    case 'ships':
      layerData.ships.forEach((s) => dot(s.lat, s.lng, { radius: 4, fillColor: shipColor(s.kind, theme) }).bindTooltip(tipHtml(shipTip(s))).addTo(grp))
      return grp
    case 'nuclear':
      layerData.nuclear.forEach((n) => dot(n.lat, n.lng, { radius: 4.5, fillColor: ink(theme, 2) }).bindTooltip(tipHtml(nuclearTip(n))).addTo(grp))
      return grp
    case 'quakes':
      layerData.quakes.forEach((q) => dot(q.lat, q.lng, { radius: clamp(q.mag * 1.8, 3, 11), fillColor: q.mag >= 6 ? SEV_COLOR.high : q.mag >= 4.5 ? SEV_COLOR.medium : ink(theme, 3) })
        .bindTooltip(tipHtml(quakeTip(q))).on('click', () => { if (q.url) openExternal(q.url) }).addTo(grp))
      return grp
    case 'firms': {
      const renderer = L.canvas()
      layerData.firms.forEach((f) => L.circleMarker([f.lat, f.lng], { renderer, radius: Math.min(5, 1.5 + (f.frp || 0) / 150), fillColor: (f.frp ?? 0) > 50 ? SEV_COLOR.high : SEV_COLOR.medium, fillOpacity: 0.8, stroke: false })
        .bindTooltip(`FRP ${f.frp} MW · ${f.date ?? ''} ${f.time ?? ''}`).addTo(grp))
      return grp
    }
    case 'radiation':
      layerData.radiation.forEach((r) => dot(r.lat, r.lng, { radius: 4, fillColor: r.value > 50 ? SEV_COLOR.high : ink(theme, 3), stroke: false }).bindTooltip(tipHtml(radTip(r))).addTo(grp))
      return grp
    case 'gpsjam':
      layerData.gpsjam.forEach((j) => L.polygon(j.polygon.map((p) => [p[1], p[0]] as [number, number]), { color: jamColor(j.bad_pct || 0, 0.95), weight: 1, fillColor: jamColor(j.bad_pct || 0, 1), fillOpacity: 0.4 })
        .bindTooltip(tipHtml({ title: 'Interferenza GPS', sub: `${(j.bad_pct || 0).toFixed(1)}% · ${j.bad_ac}/${j.total_ac} aerei` })).addTo(grp))
      return grp
    default:
      return null     // risk e satelliti non hanno una resa piatta
  }
}
