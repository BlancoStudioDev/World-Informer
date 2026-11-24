import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { fetchJSON } from '@/lib/data'
import { safeUrl } from '@/lib/format'
import { useApp } from '@/store/app'

interface Item { time?: string; title?: string; link?: string }
type Doc = Record<string, Item[]>

export function AnsaPanel({ category }: { category: string }) {
  const [doc, setDoc] = useState<Doc | null | undefined>(undefined)
  const setSource = useApp((s) => s.setNewsSource)
  const load = () => { setDoc(undefined); fetchJSON<Doc>('data/data_ansa_ultima_ora.json', { revalidate: true, ttl: 5000 }).then((d) => setDoc(d && typeof d === 'object' ? d : null)) }
  useEffect(() => {
    let alive = true
    fetchJSON<Doc>('data/data_ansa_ultima_ora.json', { revalidate: true, ttl: 5000 }).then((d) => { if (alive) setDoc(d && typeof d === 'object' ? d : null) })
    return () => { alive = false }
  }, [])

  if (doc === undefined) return <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
  const items = doc && Array.isArray(doc[category]) ? doc[category] : null
  if (!items) return <EmptyState title="Ultima ora non disponibile" text="Il file data_ansa_ultima_ora.json non è stato trovato." action={{ label: 'Riprova ora', run: load }} />
  if (!items.length) return <EmptyState title="Nessuna notizia in questa sezione" text="ANSA non ha ancora pubblicato notizie qui." action={{ label: 'Mostra gli eventi', run: () => setSource('events') }} />
  return (
    <ul className="space-y-2">
      {items.map((a, i) => (
        <li key={i}>
          <Card className="[--card-spacing:--spacing(3)] gap-0 shadow-none hover:ring-foreground/20">
            <a href={safeUrl(a.link)} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3" aria-hidden="true" />ANSA {category} · {a.time}
              </span>
              <span className="block text-sm leading-snug font-semibold">{a.title}</span>
            </a>
          </Card>
        </li>
      ))}
    </ul>
  )
}
