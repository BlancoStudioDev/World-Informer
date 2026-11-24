import { create } from 'zustand'
import type {
  EventItem, Filters, LayerId, LayerStatus, MarketsDoc, NewsSource, TabId,
} from '@/lib/types'
import { prefs } from '@/lib/data'
import { mapBus } from '@/lib/bus'
import { computeView } from './events'

export const DEFAULT_FILTERS: Filters = { types: [], minSev: 0, region: '', sector: '', q: '', sort: 'recent' }

export const LAYER_IDS: LayerId[] = [
  'news', 'risk', 'flights', 'ships', 'nuclear', 'gpsjam', 'quakes', 'firms', 'radiation', 'satellites',
]

interface LayerInfo { status: LayerStatus; count?: number }

export interface AppState {
  status: 'loading' | 'ok' | 'missing'
  events: EventItem[]
  byId: Map<string, EventItem>
  view: EventItem[]
  generatedAt: string | null
  fetchedAt: number
  marketsStatus: 'loading' | 'ok' | 'missing'
  markets: MarketsDoc | null

  filters: Filters
  newsSource: NewsSource
  selectedId: string | null
  tab: TabId
  theme: 'light' | 'dark'
  view2D: boolean
  liveOpen: boolean
  refreshing: boolean

  layers: Record<LayerId, boolean>
  layerInfo: Record<LayerId, LayerInfo>
  frpMin: number

  setEvents(events: EventItem[], generatedAt: string | null): void
  setMarkets(doc: MarketsDoc | null): void
  setFilters(patch: Partial<Filters>): void
  resetFilters(): void
  setTab(t: TabId): void
  setNewsSource(s: NewsSource): void
  setTheme(t: 'light' | 'dark'): void
  setView2D(v: boolean): void
  setLiveOpen(v: boolean): void
  setLayerFlag(id: LayerId, on: boolean): void
  setLayerInfo(id: LayerId, info: LayerInfo): void
  setFrpMin(v: number): void
}

const initialLayers = Object.fromEntries(LAYER_IDS.map((id) => [id, id === 'news' || id === 'risk'])) as Record<LayerId, boolean>
const initialInfo = Object.fromEntries(LAYER_IDS.map((id) => [id, { status: 'idle' as LayerStatus }])) as Record<LayerId, LayerInfo>

export const useApp = create<AppState>((set, get) => ({
  status: 'loading',
  events: [],
  byId: new Map(),
  view: [],
  generatedAt: null,
  fetchedAt: 0,
  marketsStatus: 'loading',
  markets: null,

  filters: DEFAULT_FILTERS,
  newsSource: 'events',
  selectedId: null,
  tab: 'news',
  theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  view2D: false,
  liveOpen: false,
  refreshing: false,

  layers: initialLayers,
  layerInfo: initialInfo,
  frpMin: 100,

  setEvents(events, generatedAt) {
    const { filters, selectedId } = get()
    const byId = new Map(events.map((e) => [e.id, e]))
    set({
      events, byId, generatedAt, status: 'ok', fetchedAt: Date.now(),
      view: computeView(events, filters),
      selectedId: selectedId && byId.has(selectedId) ? selectedId : null,
    })
  },
  setMarkets(doc) { set({ markets: doc ?? get().markets, marketsStatus: doc ? 'ok' : get().markets ? 'ok' : 'missing' }) },
  setFilters(patch) {
    const filters = { ...get().filters, ...patch }
    const view = computeView(get().events, filters)
    const sel = get().selectedId
    set({ filters, view, selectedId: sel && view.some((e) => e.id === sel) ? sel : null })
  },
  resetFilters() {
    const filters = { ...DEFAULT_FILTERS, sort: get().filters.sort }
    set({ filters, view: computeView(get().events, filters) })
  },
  setTab(tab) { set({ tab }) },
  setNewsSource(newsSource) { set({ newsSource }) },
  setTheme(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    prefs.set('wi2-theme', theme)
    set({ theme })
  },
  setView2D(view2D) { set({ view2D }) },
  setLiveOpen(liveOpen) { set({ liveOpen }) },
  setLayerFlag(id, on) { set((s) => ({ layers: { ...s.layers, [id]: on } })) },
  setLayerInfo(id, info) { set((s) => ({ layerInfo: { ...s.layerInfo, [id]: info } })) },
  setFrpMin(frpMin) { set({ frpMin }) },
}))

/** Seleziona un evento: l'espansione della card e il volo della camera avvengono a partire da qui. */
export function selectEvent(id: string | null, { fly = true }: { fly?: boolean } = {}) {
  const st = useApp.getState()
  if (id == null) { if (st.selectedId) useApp.setState({ selectedId: null }); return }
  const e = st.byId.get(id)
  if (!e) return
  useApp.setState({ selectedId: id, tab: 'news', newsSource: 'events' })
  if (fly && e.hasGeo) mapBus.fly({ lat: e.lat as number, lng: e.lng as number, altitude: 1.6, zoom: 6 })
}

export function stepSelection(dir: 1 | -1) {
  const { view, selectedId } = useApp.getState()
  if (!view.length) return
  let i = view.findIndex((e) => e.id === selectedId)
  i = i < 0 ? (dir > 0 ? 0 : view.length - 1) : Math.min(view.length - 1, Math.max(0, i + dir))
  selectEvent(view[i].id, { fly: true })
}
