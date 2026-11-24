import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { IconBtn } from '@/components/IconBtn'
import { fetchJSON } from '@/lib/data'
import { ReportView, reportStamp, type Report } from './ReportView'

export default function ReportPanel() {
  const [data, setData] = useState<Report | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const load = () => { setData(undefined); fetchJSON<Report>('data/report_daily.json', { revalidate: true, ttl: 30_000 }).then((d) => setData(d ?? null)) }
  useEffect(() => { load() }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Report delle ultime 24 ore</h2>
          <p className="text-xs text-muted-foreground">{reportStamp(data ?? null)}</p>
        </div>
        <IconBtn size="sm" label="Espandi report" disabled={!data} onClick={() => setOpen(true)}><Maximize2 /></IconBtn>
      </div>
      {data === undefined && <div className="space-y-2" aria-busy="true"><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-16 rounded-lg" /><Skeleton className="h-32 rounded-lg" /></div>}
      {data === null && <EmptyState title="Report non disponibile" text="Il file report_daily.json non è stato trovato." action={{ label: 'Riprova ora', run: load }} />}
      {data && <ReportView data={data} />}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-2xl">
          <SheetHeader className="border-b p-4">
            <SheetTitle>Report delle ultime 24 ore</SheetTitle>
            <SheetDescription>{reportStamp(data ?? null)}</SheetDescription>
          </SheetHeader>
          <div className="p-4">{data && <ReportView data={data} wide />}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
