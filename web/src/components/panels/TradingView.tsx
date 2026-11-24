import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

export interface ChartItem { id: string; symbol: string; label: string }

/** Il widget (iframe + script esterno di TradingView) nasce solo quando il blocco entra in vista. */
export function TradingViewChart({ item, theme }: { item: ChartItem; theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) { setVisible(true); io.disconnect() } }, { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const cfg = JSON.stringify({
    symbol: item.symbol, width: '100%', height: '100%', locale: 'it', dateRange: '1M',
    colorTheme: theme, isTransparent: true, autosize: true, largeChartUrl: '',
  })
  const srcDoc = `<!DOCTYPE html><html><head><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}</style></head><body><div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div><script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js" async>${cfg}<\/script></div></body></html>`
  return (
    <div ref={ref} className="h-[180px] overflow-hidden rounded-md border bg-card">
      {visible
        ? <iframe key={theme} title={`Grafico ${item.label}`} srcDoc={srcDoc} className="size-full border-0" loading="lazy" />
        : <Skeleton className="size-full rounded-none" />}
    </div>
  )
}
