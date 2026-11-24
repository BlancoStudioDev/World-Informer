import { memo, useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SortControl } from '@/components/Header'
import { EventCard } from '@/components/EventCard'
import { activeFilterCount } from '@/components/FiltersPopover'
import { AnsaPanel } from '@/components/panels/AnsaPanel'
import { EmptyState } from '@/components/EmptyState'
import { countRender } from '@/lib/bus'
import type { NewsSource } from '@/lib/types'
import { useApp } from '@/store/app'
import { refreshData } from '@/store/refresh'

const PAGE = 50

function SearchBox() {
  const q = useApp((s) => s.filters.q)
  const setFilters = useApp((s) => s.setFilters)
  const [text, setText] = useState(q)
  useEffect(() => { setText(q) }, [q])
  useEffect(() => {
    const id = setTimeout(() => { if (text !== useApp.getState().filters.q) setFilters({ q: text }) }, 150)
    return () => clearTimeout(id)
  }, [text, setFilters])
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        id="news-search" type="search" value={text} placeholder="Cerca titolo, luogo, fonte" autoComplete="off"
        aria-label="Cerca tra gli eventi" aria-keyshortcuts="/" className="h-9 touch:h-11 bg-card pr-8 pl-8 text-sm [&::-webkit-search-cancel-button]:hidden"
        onChange={(e) => setText(e.target.value)}
      />
      {text ? (
        <button type="button" aria-label="Cancella ricerca" onClick={() => setText('')} className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border px-1.5 font-sans text-xs text-muted-foreground max-md:hidden">/</kbd>
      )}
    </div>
  )
}

function Toolbar() {
  const total = useApp((s) => s.events.length)
  const shown = useApp((s) => s.view.length)
  const filters = useApp((s) => s.filters)
  const resetFilters = useApp((s) => s.resetFilters)
  const source = useApp((s) => s.newsSource)
  const setSource = useApp((s) => s.setNewsSource)
  const n = activeFilterCount(filters)
  return (
    <div className="space-y-2 px-3 pb-2">
      <SearchBox />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {source === 'events' ? (n ? `${shown} di ${total} eventi` : `${total} eventi`) : 'Ultima ora'}
          {n > 0 && source === 'events' && (
            <> · <button type="button" onClick={resetFilters} className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">azzera filtri</button></>
          )}
        </p>
        <div className="flex items-center gap-2">
          <SortControl className="md:hidden" />
          <Select value={source} onValueChange={(v) => setSource(v as NewsSource)}>
            <SelectTrigger size="sm" aria-label="Fonte delle notizie" className="h-7 touch:data-[size=sm]:h-11 gap-1 border-0 bg-transparent px-1.5 text-xs text-muted-foreground shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="events">Eventi</SelectItem>
              <SelectItem value="Mondo">ANSA Mondo</SelectItem>
              <SelectItem value="Economia">ANSA Economia</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

const CardSkeletons = () => (
  <div className="space-y-2" aria-busy="true" aria-label="Caricamento">
    {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[104px] rounded-lg" />)}
  </div>
)

function List() {
  countRender('NewsList')
  const view = useApp((s) => s.view)
  const status = useApp((s) => s.status)
  const filters = useApp((s) => s.filters)
  const resetFilters = useApp((s) => s.resetFilters)
  const selectedId = useApp((s) => s.selectedId)
  const [limit, setLimit] = useState(PAGE)
  const more = useRef<HTMLDivElement>(null)

  useEffect(() => { setLimit(PAGE) }, [filters])
  // la card selezionata (j/k, marker sul globo) deve essere tra quelle renderizzate
  useEffect(() => {
    if (!selectedId) return
    const i = view.findIndex((e) => e.id === selectedId)
    if (i >= limit) setLimit(i + 11)
  }, [selectedId, view, limit])
  // caricamento progressivo
  useEffect(() => {
    const el = more.current
    if (!el) return
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) setLimit((l) => l + PAGE) }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [limit, view.length])

  if (status === 'loading') return <CardSkeletons />
  if (status === 'missing') {
    return <EmptyState title="Dati non disponibili" text="Non riesco a leggere data/events.json. Riprovo ogni minuto." action={{ label: 'Riprova ora', run: () => refreshData({ manual: true }) }} />
  }
  if (!view.length) {
    return <EmptyState title="Nessun evento corrisponde ai filtri" text="Allarga i filtri o azzerali per vedere tutti gli eventi." action={activeFilterCount(filters) ? { label: 'Azzera filtri', run: resetFilters } : undefined} />
  }
  const shown = view.slice(0, limit)
  return (
    <div className="space-y-2">
      {shown.map((e) => <EventCard key={e.id} e={e} />)}
      {shown.length < view.length && (
        <div ref={more} className="py-2 text-center">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Mostra altri {Math.min(PAGE, view.length - shown.length)}</Button>
        </div>
      )}
      <p className="hidden pt-1 pb-2 text-center text-xs text-muted-foreground md:block">
        <kbd className="font-sans">J</kbd> <kbd className="font-sans">K</kbd> scorri · <kbd className="font-sans">/</kbd> cerca · <kbd className="font-sans">Esc</kbd> chiudi
      </p>
    </div>
  )
}

export const NewsPanel = memo(function NewsPanel() {
  const source = useApp((s) => s.newsSource)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar />
      <div id="news-scroll" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {source === 'events' ? <List /> : <AnsaPanel category={source} />}
      </div>
    </div>
  )
})
