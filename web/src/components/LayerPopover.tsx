import { Fragment } from 'react'
import { Layers } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { IconBtn } from '@/components/IconBtn'
import { SEV_COLOR } from '@/lib/domain'
import type { LayerId } from '@/lib/types'
import { useApp } from '@/store/app'
import { LAYERS, type Group } from '@/layers/defs'
import { refreshFirms, setLayer } from '@/layers/loader'

const GROUPS: { id: Group; label: string }[] = [
  { id: 'news', label: 'Notizie e rischio' },
  { id: 'mil', label: 'Militare e traffico' },
  { id: 'env', label: 'Ambiente e spazio' },
]

function Count({ id }: { id: LayerId }) {
  const info = useApp((s) => s.layerInfo[id])
  const news = useApp((s) => (id === 'news' ? s.view.filter((e) => e.hasGeo).length : null))
  const risk = useApp((s) => (id === 'risk' ? (s.markets?.countries?.filter((c) => c.risk_score > 0).length ?? null) : null))
  let text = ''
  if (id === 'news') text = String(news)
  else if (id === 'risk') text = risk == null ? '' : String(risk)
  else if (info.status === 'loading') text = '…'
  else if (info.status === 'missing') text = 'n/d'
  else if (info.count != null) text = String(info.count)
  return <span className="w-9 text-right text-xs text-muted-foreground tabular-nums">{text}</span>
}

function Row({ id }: { id: LayerId }) {
  const def = LAYERS.find((l) => l.id === id)!
  const on = useApp((s) => s.layers[id])
  const theme = useApp((s) => s.theme)
  return (
    <li className="flex items-center gap-2.5 py-1.5 touch:py-3">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: def.swatch(theme) }} />
      <label htmlFor={`layer-${id}`} title={def.title} className="flex-1 cursor-pointer text-sm">{def.label}</label>
      <Count id={id} />
      <Switch id={`layer-${id}`} size="sm" checked={on} onCheckedChange={(v) => void setLayer(id, v)} />
    </li>
  )
}

function FrpSlider() {
  const firms = useApp((s) => s.layers.firms)
  const frpMin = useApp((s) => s.frpMin)
  const setFrpMin = useApp((s) => s.setFrpMin)
  if (!firms) return null
  return (
    <li className="mb-1 ml-[18px] flex items-center gap-3 pb-1.5">
      <label htmlFor="frp" className="text-xs text-muted-foreground">FRP minimo</label>
      <Slider id="frp" min={10} max={500} step={10} value={[frpMin]} className="flex-1"
        onValueChange={([v]) => setFrpMin(v)} onValueCommit={() => void refreshFirms()} />
      <output htmlFor="frp" className="w-14 text-right text-xs text-muted-foreground tabular-nums">{frpMin} MW</output>
    </li>
  )
}

export function LayerPopover() {
  const active = useApp((s) => Object.values(s.layers).filter(Boolean).length)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconBtn label={`Scegli i layer (${active} attivi)`}><Layers /></IconBtn>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] gap-3 p-4">
        {GROUPS.map((g) => (
          <section key={g.id} aria-labelledby={`lg-${g.id}`}>
            <h2 id={`lg-${g.id}`} className="mb-0.5 text-xs font-medium text-muted-foreground">{g.label}</h2>
            <ul className="divide-y divide-border/60">
              {LAYERS.filter((l) => l.group === g.id).map((l) => (
                <Fragment key={l.id}>
                  <Row id={l.id} />
                  {l.id === 'firms' && <FrpSlider />}
                </Fragment>
              ))}
            </ul>
          </section>
        ))}
        <div className="border-t pt-3 text-xs text-muted-foreground" aria-label="Legenda">
          <div className="flex items-center gap-3">
            <span>Gravità</span>
            {(['high', 'medium', 'low'] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <i className="size-2 rounded-full" style={{ background: SEV_COLOR[k] }} />{{ high: 'alta', medium: 'media', low: 'bassa' }[k]}
              </span>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span>Impatto</span>
            <span aria-hidden="true" className="flex items-end gap-1"><i className="size-1 rounded-full bg-muted-foreground" /><i className="size-1.5 rounded-full bg-muted-foreground" /><i className="size-2 rounded-full bg-muted-foreground" /></span>
            <span>dimensione del punto</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
