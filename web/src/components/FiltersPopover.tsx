import { SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { IconBtn } from '@/components/IconBtn'
import { REGIONS, SECTOR_LABELS } from '@/lib/domain'
import { useApp } from '@/store/app'
import { useMemo } from 'react'

export const activeFilterCount = (f: ReturnType<typeof useApp.getState>['filters']) =>
  (f.types.length ? 1 : 0) + (f.minSev > 0 ? 1 : 0) + (f.region ? 1 : 0) + (f.sector ? 1 : 0) + (f.q.trim() ? 1 : 0)

export function FiltersPopover() {
  const filters = useApp((s) => s.filters)
  const events = useApp((s) => s.events)
  const setFilters = useApp((s) => s.setFilters)
  const reset = useApp((s) => s.resetFilters)
  const n = activeFilterCount(filters)

  const types = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>()
    events.forEach((e) => {
      const k = e.event_type ?? 'other'
      const c = m.get(k) ?? { label: e.event_label || k, n: 0 }
      c.n++; m.set(k, c)
    })
    return [...m].sort((a, b) => b[1].n - a[1].n)
  }, [events])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconBtn label={n ? `Imposta i filtri (${n} attivi)` : 'Imposta i filtri'} className="relative">
          <SlidersHorizontal />
          {n > 0 && <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">{n}</span>}
        </IconBtn>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80dvh] w-80 max-w-[calc(100vw-1.5rem)] gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Filtri</h2>
          <Button variant="ghost" size="xs" disabled={!n} onClick={reset}>Azzera filtri</Button>
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">Tipo di evento</legend>
          <ToggleGroup
            type="multiple" value={filters.types} onValueChange={(v) => setFilters({ types: v })}
            spacing={1} className="flex-wrap" aria-label="Tipo di evento"
          >
            {types.map(([k, c]) => (
              <ToggleGroupItem
                key={k} value={k} variant="outline" size="sm"
                className="h-7 touch:h-10 gap-1 rounded-full px-2.5 text-xs font-normal data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {c.label}<span className="opacity-60">{c.n}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </fieldset>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <label htmlFor="min-sev" className="font-medium text-muted-foreground">Gravità minima</label>
            <output htmlFor="min-sev" className="text-muted-foreground tabular-nums">{filters.minSev > 0 ? `≥ ${filters.minSev}` : 'tutte'}</output>
          </div>
          <Slider id="min-sev" min={0} max={9} step={0.5} value={[filters.minSev]} onValueChange={([v]) => setFilters({ minSev: v })} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="f-region" className="mb-1.5 block text-xs font-medium text-muted-foreground">Regione</label>
            <Select value={filters.region || 'all'} onValueChange={(v) => setFilters({ region: v === 'all' ? '' : v })}>
              <SelectTrigger id="f-region" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte</SelectItem>
                {REGIONS.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="f-sector" className="mb-1.5 block text-xs font-medium text-muted-foreground">Settore (≥ 30)</label>
            <Select value={filters.sector || 'all'} onValueChange={(v) => setFilters({ sector: v === 'all' ? '' : v })}>
              <SelectTrigger id="f-sector" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {Object.entries(SECTOR_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
