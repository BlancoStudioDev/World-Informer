/* comandi verso la mappa (globo o piatta): nessuno stato React coinvolto */
export interface FlyTarget { lat: number; lng: number; altitude?: number; zoom?: number }
type Handler = (t: FlyTarget) => void
const handlers = new Set<Handler>()
export const mapBus = {
  onFly(fn: Handler) { handlers.add(fn); return () => { handlers.delete(fn) } },
  fly(t: FlyTarget) { handlers.forEach((h) => h(t)) },
}

/* contatore di render per il debug (?debug): mostra che il globo non si ridisegna su stato non correlato */
export const renderCounts: Record<string, number> = {}
export const countRender = (name: string) => { renderCounts[name] = (renderCounts[name] || 0) + 1 }
