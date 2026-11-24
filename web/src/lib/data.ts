/* fetch tollerante e condiviso: URL RELATIVI (funziona sotto /investment/), mai eccezioni verso il chiamante */
const inflight = new Map<string, Promise<unknown>>()
const cached = new Map<string, { t: number; data: unknown }>()

export interface FetchOpts { revalidate?: boolean; ttl?: number }

/**
 * - richieste concorrenti allo stesso path condividono un'unica fetch
 * - ttl (ms): riusa il risultato appena scaricato (un solo giro di fetch per ciclo di refresh)
 * - revalidate: richiesta condizionale (If-None-Match / If-Modified-Since): 304 se invariato
 */
export function fetchJSON<T = unknown>(path: string, { revalidate = false, ttl = 0 }: FetchOpts = {}): Promise<T | null> {
  const c = cached.get(path)
  if (ttl && c && Date.now() - c.t < ttl) return Promise.resolve(c.data as T)
  const running = inflight.get(path)
  if (running) return running as Promise<T | null>
  const p = (async () => {
    try {
      const res = await fetch(path, { cache: revalidate ? 'no-cache' : 'default' })
      if (!res.ok) return null
      const data = (await res.json()) as T
      cached.set(path, { t: Date.now(), data })
      return data
    } catch (e) {
      console.warn('fetchJSON fallito:', path, (e as Error).message)
      return null
    } finally { inflight.delete(path) }
  })()
  inflight.set(path, p)
  return p
}

export const absUrl = (p: string) => new URL(p, document.baseURI).href

export const prefs = {
  get(k: string, d: string): string { try { const v = localStorage.getItem(k); return v == null ? d : v } catch { return d } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* storage bloccato */ } },
}
