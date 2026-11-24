import { toast } from 'sonner'
import type { LayerId } from '@/lib/types'
import { fetchJSON } from '@/lib/data'
import { useApp } from '@/store/app'
import { DEF, queryFirms } from './defs'
import { layerBus, layerData } from './data'
import { loadSatellites, satCount } from './satellites'

const countOf = (id: LayerId): number => {
  if (id === 'satellites') return satCount()
  const d = DEF[id]
  if (d.count) return d.count()
  const arr = (layerData as Record<string, unknown[]>)[id]
  return Array.isArray(arr) ? arr.length : 0
}

async function load(id: LayerId): Promise<boolean> {
  const st = useApp.getState()
  const def = DEF[id]
  const loader = id === 'satellites' ? loadSatellites : def.load
  if (!loader) return true
  if (st.layerInfo[id].status !== 'ok') st.setLayerInfo(id, { status: 'loading' })
  let ok = false
  try { ok = await loader() } catch (e) { console.warn(`layer ${id}:`, e) }
  if (!ok) {
    useApp.getState().setLayerInfo(id, { status: 'missing' })
    if (useApp.getState().layers[id]) toast(`${def.label}: dati non disponibili`)
    return false
  }
  useApp.getState().setLayerInfo(id, { status: 'ok', count: countOf(id) })
  return true
}

const timers = new Map<LayerId, ReturnType<typeof setInterval>>()
function schedule(id: LayerId) {
  const t = timers.get(id)
  if (t) clearInterval(t)
  const def = DEF[id]
  if (!def.refreshMs || !useApp.getState().layers[id]) { timers.delete(id); return }
  timers.set(id, setInterval(async () => {
    if (document.hidden || !useApp.getState().layers[id]) return
    if (await load(id)) layerBus.changed(id)
  }, def.refreshMs))
}

export async function setLayer(id: LayerId, on: boolean) {
  const st = useApp.getState()
  st.setLayerFlag(id, on)
  if (on && st.layerInfo[id].status !== 'ok' && (DEF[id].load || id === 'satellites')) {
    if (st.layerInfo[id].status === 'loading') return
    if (!(await load(id))) { useApp.getState().setLayerFlag(id, false); return }
    if (!useApp.getState().layers[id]) return           // spento mentre scaricava
    layerBus.changed(id)
  } else if (on && id === 'risk') void ensureRiskFallback()
  schedule(id)
}

/** Slider FRP: la query gira nel worker, qui si aggiorna solo il risultato. */
export async function refreshFirms() {
  if (!useApp.getState().layers.firms) return
  if (await queryFirms()) {
    useApp.getState().setLayerInfo('firms', { status: 'ok', count: layerData.firms.length })
    layerBus.changed('firms')
  }
}

/* fallback statico dei paesi a rischio quando markets.json non c'è */
export interface Conflict { name?: string; intensity?: string; countries?: string[] }
export const conflicts = { list: [] as Conflict[] }
export async function ensureRiskFallback() {
  if (conflicts.list.length || useApp.getState().marketsStatus === 'ok') return
  const data = await fetchJSON<Conflict[]>('data/data_conflicts.json')
  if (Array.isArray(data)) { conflicts.list = data; layerBus.changed('risk') }
}
