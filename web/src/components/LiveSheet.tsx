import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useApp } from '@/store/app'

const STREAMS = [
  { id: 'iEpJwprxDdk', title: 'Bloomberg Business News' },
  { id: '-zGuR1qVKrU', title: 'Iran HD Camera' },
  { id: 'gmtlJ_m2r5A', title: 'Camere in Israele, Iran, Siria e Medio Oriente' },
  { id: '4E-iFtUM2kk', title: 'Medio Oriente in tempo reale' },
  { id: '9NyxcX3rhQs', title: 'CNBC Marathon' },
  { id: 'gCNeDWCI0vo', title: 'Al Jazeera English' },
]

/** Dirette: anteprime statiche, l'iframe YouTube nasce solo al click (un solo video alla volta). */
export default function LiveSheet() {
  const open = useApp((s) => s.liveOpen)
  const setOpen = useApp((s) => s.setLiveOpen)
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(() => { if (!open) setPlaying(null) }, [open])
  useEffect(() => {
    const stop = () => { if (document.hidden) setPlaying(null) }
    document.addEventListener('visibilitychange', stop)
    return () => document.removeEventListener('visibilitychange', stop)
  }, [])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Dirette</SheetTitle>
          <SheetDescription>Un solo video alla volta: scegli un&apos;anteprima per avviarlo.</SheetDescription>
        </SheetHeader>
        <ul className="space-y-4 p-4">
          {STREAMS.map((s) => (
            <li key={s.id}>
              <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                {playing === s.id ? (
                  <iframe
                    className="size-full border-0" title={s.title} allowFullScreen
                    src={`https://www.youtube-nocookie.com/embed/${s.id}?autoplay=1&mute=1&rel=0`}
                    allow="autoplay; encrypted-media; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <button type="button" aria-label={`Avvia la diretta: ${s.title}`} onClick={() => setPlaying(s.id)} className="group relative block size-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <img src={`https://i.ytimg.com/vi/${s.id}/mqdefault.jpg`} alt="" width={320} height={180} decoding="async" loading="lazy" className="size-full object-cover grayscale" onError={(e) => { e.currentTarget.hidden = true }} />
                    <span className="absolute inset-0 flex items-center justify-center bg-background/20 transition-colors group-hover:bg-background/40">
                      <span className="flex size-10 items-center justify-center rounded-full bg-background text-foreground shadow-sm"><Play className="size-4 fill-current" aria-hidden="true" /></span>
                    </span>
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-sm">{s.title}</p>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
