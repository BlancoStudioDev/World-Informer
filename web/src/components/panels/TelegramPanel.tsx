import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { fetchJSON } from '@/lib/data'
import { fmtDateTime, safeUrl, timeAgo } from '@/lib/format'

interface Msg { channel?: string; text?: string; date?: string; url?: string; forwarded_from?: string }
const PAGE = 40

export default function TelegramPanel() {
  const [data, setData] = useState<Msg[] | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [dq, setDq] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const load = (spin = false) => {
    if (spin) setData(undefined)
    fetchJSON<Msg[]>('data/data_telegram.json', { revalidate: true, ttl: 5000 }).then((d) => setData(Array.isArray(d) ? d : null))
  }
  useEffect(() => {
    load()
    const id = setInterval(() => { if (!document.hidden) load() }, 120_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { const id = setTimeout(() => { setDq(q); setLimit(PAGE) }, 150); return () => clearTimeout(id) }, [q])

  const list = useMemo(() => {
    if (!data) return []
    const s = dq.trim().toLowerCase()
    return s ? data.filter((m) => `${m.text || ''} ${m.channel || ''}`.toLowerCase().includes(s)) : data
  }, [data, dq])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nei messaggi" autoComplete="off" aria-label="Cerca nei messaggi OSINT" className="h-9 touch:h-11 bg-card pl-8 text-sm" />
        </div>
        <p className="text-xs text-muted-foreground" aria-live="polite">{data ? `${list.length} messaggi OSINT` : ' '}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {data === undefined && <div className="space-y-2" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>}
        {data === null && <EmptyState title="Feed OSINT non disponibile" text="Non riesco a leggere data_telegram.json." action={{ label: 'Riprova ora', run: () => load(true) }} />}
        {data && !list.length && (q ? <EmptyState title="Nessun messaggio corrisponde" text="Prova con altre parole chiave." action={{ label: 'Cancella ricerca', run: () => setQ('') }} /> : <EmptyState title="Nessun messaggio OSINT" text="Il feed si riempie appena i canali monitorati pubblicano." />)}
        <ul className="space-y-2">
          {list.slice(0, limit).map((m, i) => (
            <li key={`${m.url}${i}`}>
              <Card className="[--card-spacing:--spacing(3)] gap-0 shadow-none hover:ring-foreground/20">
                <a href={safeUrl(m.url)} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate font-medium text-foreground">@{m.channel}</span>
                    <span title={fmtDateTime(m.date)} className="shrink-0">{timeAgo(m.date) || fmtDateTime(m.date)}</span>
                  </span>
                  <span className="line-clamp-5 block text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{m.text}</span>
                  {m.forwarded_from && <span className="mt-1 block text-xs text-muted-foreground">↩ {m.forwarded_from}</span>}
                </a>
              </Card>
            </li>
          ))}
        </ul>
        {list.length > limit && <div className="py-3 text-center"><Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Mostra altri {Math.min(PAGE, list.length - limit)}</Button></div>}
      </div>
    </div>
  )
}
