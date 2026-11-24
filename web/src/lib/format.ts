export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const num = (v: unknown, d = 0): number => (typeof v === 'number' && isFinite(v) ? v : d)

/** ISO8601 oppure epoch (secondi o millisecondi). */
export function parseTime(v: unknown): Date | null {
  if (v == null || v === '') return null
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

export function timeAgo(v: unknown, now = Date.now()): string {
  const d = parseTime(v)
  if (!d) return ''
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000))
  if (s < 45) return 'adesso'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min fa`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} h fa`
  return `${Math.round(h / 24)} g fa`
}

/** 24/11, 12:49 */
export function fmtDateTime(v: unknown): string {
  const d = parseTime(v)
  return d ? d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}
export function fmtTime(v: unknown, seconds = false): string {
  const d = parseTime(v)
  return d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) }) : ''
}

export function safeUrl(u: unknown): string {
  try {
    const url = new URL(String(u), location.href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#'
  } catch { return '#' }
}
export const openExternal = (url: string) => window.open(safeUrl(url), '_blank', 'noopener,noreferrer')

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>
  return (...a: A) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms) }
}
