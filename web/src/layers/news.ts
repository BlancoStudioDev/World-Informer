import type { EventItem, PointItem } from '@/lib/types'
import { clamp, timeAgo } from '@/lib/format'
import { SEV_LABEL, sev3, sevColor } from '@/lib/domain'
import { selectEvent } from '@/store/app'
import { isFresh } from '@/store/events'

export const newsRadius = (score: number) => 0.22 + 0.62 * Math.sqrt(clamp(score, 0, 100) / 100)

type Cached = PointItem & { sig: string }
const cache = new Map<string, Cached>()

/** Punti per il globo: colore = gravità, raggio = impatto. Gli oggetti restano gli stessi finché l'evento non cambia. */
export function newsPoints(view: EventItem[]): PointItem[] {
  const out: PointItem[] = []
  const live = new Set<string>()
  for (const e of view) {
    if (!e.hasGeo) continue
    live.add(e.id)
    const sig = `${e.sig}|${isFresh(e)}`
    let it = cache.get(e.id)
    if (!it || it.sig !== sig) {
      it = {
        sig, lat: e.lat as number, lng: e.lng as number, alt: 0.006,
        r: newsRadius(e.global_score),
        color: sevColor(e.severity_band),
        tip: () => ({
          title: e.title,
          sub: e.location_label || 'Posizione n/d',
          badge: { text: `Gravità ${SEV_LABEL[sev3(e.severity_band)]}`, color: sevColor(e.severity_band) },
          meta: [`Impatto ${Math.round(e.global_score)} · ${timeAgo(e.first_seen)}`],
        }),
        click: () => selectEvent(e.id, { fly: true }),
      }
      cache.set(e.id, it)
    }
    out.push(it)
  }
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id)
  return out
}
