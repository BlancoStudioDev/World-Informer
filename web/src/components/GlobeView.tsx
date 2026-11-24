import { memo, useEffect, useRef } from 'react'
import { GlobeController } from '@/globe/controller'
import { bindGlobe } from '@/globe/binding'
import { mapBus, countRender, renderCounts } from '@/lib/bus'
import { useApp } from '@/store/app'
import { setLayer } from '@/layers/loader'

/** Monta il globo una sola volta: React non lo ridisegna mai (nessuna prop, nessun selettore dello store). */
function GlobeViewImpl() {
  countRender('GlobeView')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current!
    const ctrl = new GlobeController(el, useApp.getState().theme)
    const unbind = bindGlobe(ctrl)
    const offFly = mapBus.onFly((t) => { if (!useApp.getState().view2D) ctrl.flyTo(t.lat, t.lng, t.altitude ?? 1.5) })
    const unsub = useApp.subscribe((s, p) => { if (s.view2D !== p.view2D) ctrl.setActive(!s.view2D) })
    if (location.search.includes('debug')) {
      ;(window as unknown as { __wi: unknown }).__wi = {
        globe: ctrl.world, controller: ctrl, store: useApp, setLayer, renders: renderCounts, bench: (n?: number) => ctrl.bench(n),
      }
    }
    return () => { unsub(); offFly(); unbind(); ctrl.dispose(); el.replaceChildren() }
  }, [])
  return <div ref={ref} className="absolute inset-0 touch-none" role="img" aria-label="Globo 3D con gli eventi mondiali" />
}
export default memo(GlobeViewImpl)
