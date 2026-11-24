import { lazy, Suspense, useEffect, useRef } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/Header'
import { FeedColumn } from '@/components/FeedColumn'
import { Minimap } from '@/components/Minimap'
import { IssCard } from '@/components/IssCard'
import { useShortcuts } from '@/hooks/useShortcuts'
import { countRender } from '@/lib/bus'
import { useApp } from '@/store/app'
import { refreshData, startPolling } from '@/store/refresh'

// parti pesanti caricate a richiesta: globo (three.js), mappa 2D (Leaflet), dirette
const GlobeView = lazy(() => import('@/components/GlobeView'))
const FlatMap = lazy(() => import('@/components/FlatMap'))
const LiveSheet = lazy(() => import('@/components/LiveSheet'))

function Footer() {
  const n = useApp((s) => s.events.reduce((a, e) => a + (e.n_articles ?? (e.articles.length || 1)), 0))
  return (
    <footer className="shrink-0 border-t px-3 py-2 text-center text-xs text-muted-foreground">
      World-Informer • {n.toLocaleString('it-IT')} articoli monitorati
    </footer>
  )
}

function MapArea() {
  const view2D = useApp((s) => s.view2D)
  return (
    <main className="relative h-[45vh] shrink-0 overflow-hidden md:h-auto md:min-w-0 md:flex-1">
      <Suspense fallback={<div className="absolute inset-0 flex items-center justify-center"><Skeleton className="aspect-square h-3/5 rounded-full" /></div>}>
        <GlobeView />
      </Suspense>
      {view2D && <Suspense fallback={<Skeleton className="absolute inset-0 z-[5] rounded-none" />}><FlatMap /></Suspense>}
      <Minimap />
      <IssCard />
    </main>
  )
}

export default function App() {
  countRender('App')
  const liveOpen = useApp((s) => s.liveOpen)
  const liveMounted = useRef(false)
  if (liveOpen) liveMounted.current = true
  useShortcuts()
  useEffect(() => { void refreshData(); return startPolling() }, [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <a href="#sidebar" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring">Vai al feed delle notizie</a>
        <Header />
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <MapArea />
          <FeedColumn className="flex min-h-0 flex-1 flex-col border-t md:w-80 md:flex-none md:border-t-0 md:border-l lg:w-[340px]" />
        </div>
        <Footer />
      </div>
      {liveMounted.current && <Suspense fallback={null}><LiveSheet /></Suspense>}
      <Toaster position="bottom-center" />
    </TooltipProvider>
  )
}
