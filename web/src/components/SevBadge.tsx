import type { SeverityBand } from '@/lib/types'
import { SEV_LABEL, sev3 } from '@/lib/domain'
import { cn } from '@/lib/utils'

const STYLE = {
  high: 'bg-sev-high-bg text-sev-high-fg',
  medium: 'bg-sev-medium-bg text-sev-medium-fg',
  low: 'bg-sev-low-bg text-sev-low-fg',
} as const

/** Pillola di gravità: l'unico elemento colorato (pallido) dell'interfaccia. */
export function SevBadge({ band, className }: { band?: SeverityBand; className?: string }) {
  const s = sev3(band)
  return (
    <span className={cn('inline-flex h-5 items-center rounded-full px-2 text-xs font-medium', STYLE[s], className)}>
      {SEV_LABEL[s]}
    </span>
  )
}

export function SevDot({ band, className }: { band?: SeverityBand; className?: string }) {
  const s = sev3(band)
  const bg = { high: 'bg-sev-high', medium: 'bg-sev-medium', low: 'bg-sev-low' }[s]
  return <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', bg, className)} />
}
