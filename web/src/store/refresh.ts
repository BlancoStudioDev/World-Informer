import { toast } from 'sonner'
import { fetchJSON } from '@/lib/data'
import type { EventsDoc, MarketsDoc } from '@/lib/types'
import { useApp } from './app'
import { prepEvent, rawSig } from './events'

export const REFRESH_MS = 60_000
const NEW_BADGE_MS = 5 * 60 * 1000
export { NEW_BADGE_MS }

async function loadEvents(): Promise<boolean> {
  // un solo fetch condiviso per ciclo di refresh, richiesta condizionale (304 se invariato)
  const doc = await fetchJSON<EventsDoc>('data/events.json', { revalidate: true, ttl: 5000 })
  const st = useApp.getState()
  if (!doc || !Array.isArray(doc.events)) {
    if (st.status !== 'ok') useApp.setState({ status: 'missing' })
    return false
  }
  const first = st.status !== 'ok'
  if (!first && doc.generated_at === st.generatedAt && doc.events.length === st.events.length) {
    useApp.setState({ fetchedAt: Date.now() })
    return true
  }
  const added: string[] = []
  const events = doc.events.map((raw) => {
    const old = st.byId.get(raw.id)
    if (old && old.sig === rawSig(raw)) return old          // identità stabile → card e marker riusati
    const e = prepEvent(raw)
    if (old) e.newAt = old.newAt
    else if (!first) { e.newAt = Date.now(); added.push(e.id) }
    return e
  })
  st.setEvents(events, doc.generated_at ?? null)
  if (!first && added.length) {
    toast(`${added.length} ${added.length === 1 ? 'nuova notizia' : 'nuove notizie'}`, {
      duration: 6000,
      action: {
        label: 'Mostra',
        onClick: () => {
          useApp.getState().setTab('news')
          document.getElementById('news-scroll')?.scrollTo({ top: 0, behavior: 'smooth' })
        },
      },
    })
  }
  return true
}

async function loadMarkets(): Promise<boolean> {
  const doc = await fetchJSON<MarketsDoc>('data/markets.json', { revalidate: true, ttl: 5000 })
  if (!doc || !Array.isArray(doc.sectors)) { useApp.getState().setMarkets(null); return false }
  useApp.getState().setMarkets(doc)
  return true
}

let busy = false
export async function refreshData({ manual = false } = {}) {
  if (busy) return
  busy = true
  useApp.setState({ refreshing: true })
  try {
    const [ok] = await Promise.all([loadEvents(), loadMarkets()])
    if (manual) toast(ok ? 'Dati aggiornati' : 'Aggiornamento non riuscito: riprovo tra poco', { duration: 2500 })
  } finally {
    busy = false
    useApp.setState({ refreshing: false })
  }
}

/** Refresh ogni 60 s; si ferma a scheda nascosta e riprende (con refresh immediato se scaduto) alla riapertura. */
export function startPolling() {
  const id = setInterval(() => { if (!document.hidden) void refreshData() }, REFRESH_MS)
  const onVis = () => {
    if (!document.hidden && Date.now() - useApp.getState().fetchedAt > REFRESH_MS) void refreshData()
  }
  document.addEventListener('visibilitychange', onVis)
  return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
}
