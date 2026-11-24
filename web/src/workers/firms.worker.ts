/* Scarica e analizza data_firms.json (decine di MB) fuori dal main thread.
 *   → {type:'load', url}              risponde {type:'loaded', total}
 *   → {type:'query', min, cap, id}    risponde {type:'items', id, items, matched}: hotspot con FRP >= min, i `cap` più intensi */
interface Fire { lat: number; lng: number; frp?: number }
let all: Fire[] = []

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  if (m.type === 'load') {
    try {
      const res = await fetch(m.url)
      const data = res.ok ? await res.json() : null
      if (!Array.isArray(data)) throw new Error('FIRMS non disponibile')
      all = data.filter((d: Fire) => typeof d.lat === 'number' && typeof d.lng === 'number')
      postMessage({ type: 'loaded', total: all.length })
    } catch (err) { postMessage({ type: 'error', message: String((err as Error)?.message ?? err) }) }
  } else if (m.type === 'query') {
    const hit = all.filter((f) => (f.frp || 0) >= m.min)
    hit.sort((a, b) => (b.frp || 0) - (a.frp || 0))
    postMessage({ type: 'items', id: m.id, matched: hit.length, items: hit.slice(0, m.cap) })
  }
}
