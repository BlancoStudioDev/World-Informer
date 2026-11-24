import { useEffect } from 'react'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LayerId } from '@/lib/types'
import { mapBus } from '@/lib/bus'
import { useApp } from '@/store/app'
import { layerBus } from '@/layers/data'
import { LAYERS } from '@/layers/defs'
import { buildFlat } from '@/layers/flat'

// Esri Canvas: basemap grigia senza chiave API
const TILE = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
}

/** Sincronizza i layer dello store con gruppi Leaflet (marker su canvas: nessun DOM per marker). */
function FlatLayers() {
  const map = useMap()
  useEffect(() => {
    const groups = new Map<LayerId, L.Layer>()
    const render = (id: LayerId) => {
      const prev = groups.get(id)
      if (prev) { map.removeLayer(prev); groups.delete(id) }
      if (!useApp.getState().layers[id]) return
      try { const l = buildFlat(id); if (l) { l.addTo(map); groups.set(id, l) } } catch (e) { console.error(`layer ${id} (piatta):`, e) }
    }
    LAYERS.forEach((d) => render(d.id))
    let prev = useApp.getState()
    const unsub = useApp.subscribe((s) => {
      const p = prev; prev = s
      if (s.view !== p.view || s.layers.news !== p.layers.news) render('news')
      if (s.theme !== p.theme) LAYERS.forEach((d) => render(d.id))
      if (s.layers !== p.layers) for (const id of Object.keys(s.layers) as LayerId[]) if (id !== 'news' && s.layers[id] !== p.layers[id]) render(id)
    })
    const unbus = layerBus.on((id) => { if (id === '*') LAYERS.forEach((d) => render(d.id)); else render(id) })
    const unfly = mapBus.onFly((t) => map.flyTo([t.lat, t.lng], t.zoom ?? 5, { duration: 1 }))
    setTimeout(() => map.invalidateSize(), 60)
    return () => { unsub(); unbus(); unfly(); groups.forEach((l) => map.removeLayer(l)) }
  }, [map])
  return null
}

export default function FlatMap() {
  const theme = useApp((s) => s.theme)
  return (
    <MapContainer
      center={[30, 15]} zoom={2} minZoom={2} worldCopyJump preferCanvas zoomControl={false} attributionControl={false}
      className="absolute inset-0 z-[5]" aria-label="Mappa 2D degli eventi"
    >
      <TileLayer key={theme} url={TILE[theme]} maxZoom={16} attribution="Tiles &copy; Esri" />
      <ZoomControl position="bottomleft" />
      <FlatLayers />
    </MapContainer>
  )
}
