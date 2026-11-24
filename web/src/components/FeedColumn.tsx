import { lazy, Suspense } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { NewsPanel } from '@/components/NewsPanel'
import type { TabId } from '@/lib/types'
import { useApp } from '@/store/app'
import { countRender } from '@/lib/bus'

// pannelli secondari: scaricati solo alla prima apertura (TradingView, report e Telegram non pesano sul primo caricamento)
const MarketsPanel = lazy(() => import('@/components/panels/MarketsPanel'))
const TelegramPanel = lazy(() => import('@/components/panels/TelegramPanel'))
const ReportPanel = lazy(() => import('@/components/panels/ReportPanel'))

const TABS: [TabId, string][] = [['news', 'Notizie'], ['markets', 'Mercati'], ['telegram', 'Telegram'], ['report', 'Report']]
const fallback = <div className="space-y-2 px-3 pt-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>

export function FeedColumn({ className }: { className?: string }) {
  countRender('FeedColumn')
  const tab = useApp((s) => s.tab)
  const setTab = useApp((s) => s.setTab)
  const count = useApp((s) => s.events.length)
  return (
    <aside id="sidebar" aria-label="Feed delle notizie" className={className}>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="min-h-0 flex-1 gap-0">
        <div className="flex items-baseline justify-between px-3 pt-3 pb-1">
          <TabsList variant="line" className="h-8 touch:h-11 w-full justify-start gap-4 p-0" aria-label="Sezioni">
            {TABS.map(([id, label]) => (
              <TabsTrigger
                key={id} value={id}
                className="h-8 touch:h-11 flex-none rounded-none px-0 text-sm font-medium after:-bottom-px data-active:text-foreground"
              >
                {label}
                {id === 'news' && count > 0 && <span className="ml-1 text-xs font-normal text-muted-foreground">{count}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="mx-3 mb-2 border-b" />
        <TabsContent value="news" forceMount className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"><NewsPanel /></TabsContent>
        <TabsContent value="markets" className="flex min-h-0 flex-1 flex-col"><Suspense fallback={fallback}><MarketsPanel /></Suspense></TabsContent>
        <TabsContent value="telegram" className="flex min-h-0 flex-1 flex-col"><Suspense fallback={fallback}><TelegramPanel /></Suspense></TabsContent>
        <TabsContent value="report" className="flex min-h-0 flex-1 flex-col"><Suspense fallback={fallback}><ReportPanel /></Suspense></TabsContent>
      </Tabs>
    </aside>
  )
}
