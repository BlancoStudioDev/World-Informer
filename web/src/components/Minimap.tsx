import { memo, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sevColor } from '@/lib/domain'
import { selectEvent, useApp } from '@/store/app'
import { cn } from '@/lib/utils'

/** Colonna sottile di punti (i primi eventi per priorità): navigazione discreta, un solo elemento per evento. */
export const Minimap = memo(function Minimap() {
  const view = useApp((s) => s.view)
  const selectedId = useApp((s) => s.selectedId)
  const top = useMemo(() => [...view].filter((e) => e.hasGeo).sort((a, b) => b.global_score - a.global_score).slice(0, 20), [view])
  if (!top.length) return null
  return (
    <nav aria-label="Eventi principali" className="absolute top-3 bottom-3 left-2 z-10 flex flex-col max-md:hidden items-center overflow-hidden md:left-3">
      {top.map((e) => (
        <Tooltip key={e.id}>
          <TooltipTrigger asChild>
            <button
              type="button" aria-label={e.title} aria-current={selectedId === e.id}
              onClick={() => selectEvent(e.id, { fly: true })}
              className="group flex size-5 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn('block size-2 rounded-full transition-transform group-hover:scale-150', selectedId === e.id && 'scale-150 ring-2 ring-foreground/40 ring-offset-1 ring-offset-background')}
                style={{ background: sevColor(e.severity_band) }}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64">{e.title}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
})
