import { useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { IconBtn } from '@/components/IconBtn'
import { issCard, setIssCard } from '@/layers/satellites'

const subscribe = (f: () => void) => { issCard.listeners.add(f); return () => { issCard.listeners.delete(f) } }

/** Diretta ISS (YouTube): l'iframe esiste solo finché la scheda è aperta. */
export function IssCard() {
  const open = useSyncExternalStore(subscribe, () => issCard.open)
  if (!open) return null
  return (
    <Card className="absolute bottom-3 left-3 z-10 w-64 [--card-spacing:--spacing(2)] gap-1 shadow-none max-sm:w-52">
      <div className="flex items-center justify-between pl-3 text-xs font-medium">
        <span>ISS — diretta NASA</span>
        <IconBtn size="sm" label="Chiudi diretta ISS" onClick={() => setIssCard(false)}><X className="size-3.5" /></IconBtn>
      </div>
      <div className="aspect-video px-2">
        <iframe
          className="size-full rounded-md border-0" title="ISS — diretta NASA" allowFullScreen
          src="https://www.youtube-nocookie.com/embed/DDU-rZs-NyE?autoplay=1&mute=1"
          allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </Card>
  )
}
