import { memo, useEffect, useRef } from 'react'
import { Calendar, ChevronDown, ChevronUp, ExternalLink, MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { IconBtn } from '@/components/IconBtn'
import { SevBadge, SevDot } from '@/components/SevBadge'
import { fmtDateTime, safeUrl } from '@/lib/format'
import { sectorLabel } from '@/lib/domain'
import type { EventItem } from '@/lib/types'
import { selectEvent, stepSelection, useApp } from '@/store/app'
import { NEW_BADGE_MS } from '@/store/refresh'
import { cn } from '@/lib/utils'

function Details({ e }: { e: EventItem }) {
  const sectors = Object.entries(e.sector).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const nSrc = e.n_sources || e.sources.length || 1
  return (
    <div className="mt-3 space-y-3 border-t pt-3 text-xs">
      {e.summary && <p className="leading-relaxed text-muted-foreground">{e.summary}</p>}

      <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
        <span>Gravità <b className="font-medium text-foreground">{e.severity.toFixed(1)}/10</b></span>
        <span>Impatto <b className="font-medium text-foreground">{Math.round(e.global_score)}</b></span>
        <span>Confidenza <b className="font-medium text-foreground">{Math.round(e.confidence * 100)}%</b></span>
        {e.persistence_days != null && <span>Persistenza <b className="font-medium text-foreground">{e.persistence_days} g</b></span>}
      </p>

      {sectors.length > 0 && (
        <section aria-label="Impatto sui settori">
          <h4 className="mb-1.5 font-medium">Impatto sui settori</h4>
          <ul className="space-y-1.5">
            {sectors.map(([k, v]) => (
              <li key={k} className="grid grid-cols-[minmax(0,1fr)_72px_24px] items-center gap-2">
                <span className="truncate text-muted-foreground">{sectorLabel(k)}</span>
                <span role="img" aria-label={`${sectorLabel(k)}: ${Math.round(v * 100)} su 100`} className="h-1 overflow-hidden rounded-full bg-muted">
                  <i className={cn('block h-full rounded-full', v >= 0.3 ? 'bg-foreground/55' : 'bg-foreground/25')} style={{ width: `${Math.max(3, Math.min(100, v * 100))}%` }} />
                </span>
                <span className="text-right text-muted-foreground tabular-nums">{Math.round(v * 100)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {e.explanation.length > 0 && (
        <section aria-label="Perché questo punteggio">
          <h4 className="mb-1 font-medium">Perché questo punteggio</h4>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{e.explanation.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}

      {e.countries.length > 0 && (
        <p className="text-muted-foreground"><span className="font-medium text-foreground">Paesi</span> · {e.countries.map((c) => c.name || c.iso2).join(', ')}</p>
      )}

      <section aria-label="Fonti">
        <h4 className="mb-1 font-medium">Fonti ({e.articles.length || e.sources.length || nSrc})</h4>
        <ul className="space-y-1">
          {e.articles.length
            ? e.articles.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <a href={safeUrl(a.url)} target="_blank" rel="noopener noreferrer" className="rounded-sm underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                    {a.title || e.title}
                  </a>
                  <span className="block text-muted-foreground">{a.source}{a.published_at ? ` · ${fmtDateTime(a.published_at)}` : ''}</span>
                </span>
              </li>
            ))
            : e.sources.map((s) => <li key={s} className="text-muted-foreground">{s}</li>)}
        </ul>
      </section>

      <div className="flex items-center justify-end gap-0.5 border-t pt-2">
        <IconBtn size="sm" label="Evento precedente" kbd="K" onClick={() => stepSelection(-1)}><ChevronUp /></IconBtn>
        <IconBtn size="sm" label="Evento successivo" kbd="J" onClick={() => stepSelection(1)}><ChevronDown /></IconBtn>
        <IconBtn size="sm" label="Chiudi dettaglio" kbd="Esc" onClick={() => selectEvent(null)}><X /></IconBtn>
      </div>
    </div>
  )
}

/** Card del feed. Memoizzata sull'identità dell'evento: un refresh senza cambiamenti non la ridisegna. */
export const EventCard = memo(function EventCard({ e }: { e: EventItem }) {
  const selected = useApp((s) => s.selectedId === e.id)
  const ref = useRef<HTMLDivElement>(null)
  const isNew = !!(e.newAt && Date.now() - e.newAt < NEW_BADGE_MS)

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [selected])

  return (
    <Card
      ref={ref}
      data-id={e.id}
      className={cn('[--card-spacing:--spacing(3)] gap-0 shadow-none hover:ring-foreground/20', selected && 'ring-foreground/40 hover:ring-foreground/40')}
    >
      <div className="px-3">
        <button
          type="button"
          aria-expanded={selected}
          onClick={() => selectEvent(selected ? null : e.id, { fly: true })}
          className="block w-full rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="mb-1.5 flex items-center gap-1.5">
            <SevDot band={e.severity_band} />
            <Badge variant="secondary" className="h-5 min-w-0 max-w-[60%] rounded-md bg-muted px-1.5 font-normal text-muted-foreground">
              <span className="truncate">{e.event_label || e.event_type || 'Evento'}</span>
            </Badge>
            <SevBadge band={e.severity_band} />
            {isNew && <span className="ml-auto text-xs font-medium text-foreground">Nuovo</span>}
          </span>
          <span className="block text-sm leading-snug font-semibold">{e.title}</span>
          {!selected && e.summary && <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{e.summary}</span>}
          <span className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex shrink-0 items-center gap-1"><Calendar className="size-3" aria-hidden="true" />{fmtDateTime(e.first_seen)}</span>
            {(e.location_label || !e.hasGeo) && (
              <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{e.location_label || 'Senza posizione'}</span></span>
            )}
          </span>
        </button>
        {selected && <Details e={e} />}
      </div>
    </Card>
  )
})
