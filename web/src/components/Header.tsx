import { useEffect, useState } from 'react'
import { Clock, Globe, Map as MapIcon, Moon, RefreshCw, Sun, Tv, TriangleAlert } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { IconBtn } from '@/components/IconBtn'
import { LayerPopover } from '@/components/LayerPopover'
import { FiltersPopover } from '@/components/FiltersPopover'
import { fmtTime, parseTime, timeAgo } from '@/lib/format'
import type { SortMode } from '@/lib/types'
import { useApp } from '@/store/app'
import { refreshData } from '@/store/refresh'
import { countRender } from '@/lib/bus'

export function SortControl({ className }: { className?: string }) {
  const sort = useApp((s) => s.filters.sort)
  const setFilters = useApp((s) => s.setFilters)
  return (
    <ToggleGroup
      type="single" value={sort} spacing={0} aria-label="Ordinamento notizie" className={className}
      onValueChange={(v) => { if (v) setFilters({ sort: v as SortMode }) }}
    >
      {([['recent', 'Recenti', Clock], ['priority', 'Priorità', TriangleAlert]] as const).map(([v, label, Icon]) => (
        <ToggleGroupItem
          key={v} value={v} size="sm"
          className="h-8 touch:h-11 gap-1.5 rounded-md px-3 text-xs font-medium text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary"
        >
          <Icon className="size-3.5" aria-hidden="true" />{label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

function RefreshBtn() {
  const refreshing = useApp((s) => s.refreshing)
  const generatedAt = useApp((s) => s.generatedAt)
  const status = useApp((s) => s.status)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(id) }, [])
  const gen = parseTime(generatedAt)
  const stale = gen ? Date.now() - gen.getTime() > 45 * 60_000 : false
  const label = status === 'missing' ? 'Aggiorna ora — dati non disponibili'
    : gen ? `Aggiorna ora — dati delle ${fmtTime(gen)} (${timeAgo(gen)})${stale ? ', non aggiornati' : ''}` : 'Aggiorna ora'
  return (
    <IconBtn label={label} onClick={() => refreshData({ manual: true })} aria-busy={refreshing} className="max-md:hidden">
      <RefreshCw className={refreshing ? 'animate-spin' : ''} />
    </IconBtn>
  )
}

export function Header() {
  countRender('Header')
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const view2D = useApp((s) => s.view2D)
  const setView2D = useApp((s) => s.setView2D)
  const liveOpen = useApp((s) => s.liveOpen)
  const setLiveOpen = useApp((s) => s.setLiveOpen)

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3 md:h-16 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Globe className="size-5 shrink-0 text-foreground max-sm:hidden" strokeWidth={1.75} aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="truncate text-base leading-tight font-semibold tracking-tight md:text-lg">World-Informer</h1>
          <p className="truncate text-xs leading-tight text-muted-foreground max-md:hidden">Monitoraggio eventi mondiali in tempo reale</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0 md:gap-1">
        <LayerPopover />
        <FiltersPopover />
        <IconBtn label="Guarda le dirette" aria-expanded={liveOpen} onClick={() => setLiveOpen(true)}><Tv /></IconBtn>
        <IconBtn label={view2D ? 'Mostra il globo 3D' : 'Mostra la mappa 2D'} aria-pressed={view2D} onClick={() => setView2D(!view2D)}><MapIcon /></IconBtn>
        <IconBtn label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun /> : <Moon />}
        </IconBtn>
        <RefreshBtn />
        <SortControl className="ml-2 max-md:hidden" />
      </div>
    </header>
  )
}
