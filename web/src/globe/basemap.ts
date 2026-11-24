/* Mappa di base del globo: un'unica texture equirettangolare (oceano, terre, confini sottili) invece di ~180
 * mesh di poligoni. Costo di render = 1 draw call; confini e tinte si ridisegnano su canvas solo quando serve. */
export type Ring = [number, number][]

export interface Country {
  iso: string | null
  name: string
  admin: string
  polys: Ring[][]            // poligono → anelli (esterno + fori) in [lng, lat]
  bbox: [number, number, number, number]
  area: number               // gradi² corretti per latitudine (solo per ordinare)
  cx: number
  cy: number
}

export interface Palette { ocean: string; land: string; border: string; label: string }
export const PALETTE: Record<'light' | 'dark', Palette> = {
  light: { ocean: '#e9ebee', land: '#c5c8ce', border: '#dfe1e5', label: '#6b7078' },
  dark: { ocean: '#18191c', land: '#34363c', border: '#25272b', label: '#8d9199' },
}

const A3_FIX: Record<string, string> = { NOR: 'NO', FRA: 'FR', KOS: 'XK' }
interface GeoFeature { properties?: Record<string, string>; geometry?: { type: string; coordinates: unknown } }

function featureIso(p: Record<string, string>): string | null {
  for (const k of ['ISO_A2', 'WB_A2']) {
    const v = p[k]
    if (v && v !== '-99' && /^[A-Z]{2}$/.test(v)) return v
  }
  return A3_FIX[p.ADM0_A3] || null
}

const ringArea = (r: Ring) => {
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f
  }
  a /= 2
  return a === 0 ? { a: 0, cx: r[0]?.[0] ?? 0, cy: r[0]?.[1] ?? 0 } : { a, cx: cx / (6 * a), cy: cy / (6 * a) }
}

export function parseCountries(features: GeoFeature[]): Country[] {
  const out: Country[] = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    const polys = (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []) as Ring[][]
    if (!polys.length) continue
    const p = f.properties ?? {}
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90, best = -1, cx = 0, cy = 0, area = 0
    for (const poly of polys) {
      const outer = poly[0]
      for (const [x, y] of outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
      const { a, cx: px, cy: py } = ringArea(outer)
      const aa = Math.abs(a) * Math.cos((py * Math.PI) / 180)
      area += aa
      if (aa > best) { best = aa; cx = px; cy = py }
    }
    out.push({ iso: featureIso(p), name: p.NAME || p.ADMIN || '', admin: p.ADMIN || p.NAME || '', polys, bbox: [x0, y0, x1, y1], area, cx, cy })
  }
  return out
}

/** Disegna la texture. `risk`: iso2 → 0..100 (tinta appena percettibile sui paesi più a rischio). */
export function paintBase(canvas: HTMLCanvasElement, countries: Country[], pal: Palette, risk: Map<string, number> | null) {
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = pal.ocean
  ctx.fillRect(0, 0, W, H)
  ctx.lineJoin = 'round'
  const X = (lng: number) => ((lng + 180) / 360) * W
  const Y = (lat: number) => ((90 - lat) / 180) * H

  const path = (c: Country, dx: number) => {
    ctx.beginPath()
    for (const poly of c.polys) {
      for (const ring of poly) {
        // anelli che attraversano l'antimeridiano: si "srotolano" (tranne l'Antartide, che copre tutte le longitudini)
        let unwrap = false
        if (c.bbox[1] > -60) for (let i = 1; i < ring.length; i++) if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { unwrap = true; break }
        ring.forEach(([lng, lat], i) => {
          const x = X(unwrap && lng < 0 ? lng + 360 : lng) + dx
          i === 0 ? ctx.moveTo(x, Y(lat)) : ctx.lineTo(x, Y(lat))
        })
        ctx.closePath()
      }
    }
  }
  const draw = (fill: string | null, stroke: string | null, evenodd = true) => {
    for (const c of countries) {
      const f = typeof fill === 'string' ? fill : null
      if (!f && !stroke) continue
      for (const dx of [0, -W]) {
        path(c, dx)
        if (f) { ctx.fillStyle = f; ctx.fill(evenodd ? 'evenodd' : 'nonzero') }
        if (stroke) { ctx.strokeStyle = stroke; ctx.stroke() }
      }
    }
  }
  draw(pal.land, null)
  if (risk && risk.size) {
    for (const c of countries) {
      const r = (c.iso && risk.get(c.iso)) || 0
      if (r < 30) continue
      ctx.fillStyle = `rgba(217,83,79,${(0.02 + 0.06 * (r / 100) ** 1.5).toFixed(3)})`
      for (const dx of [0, -W]) { path(c, dx); ctx.fill('evenodd') }
    }
  }
  ctx.lineWidth = Math.max(1, W / 3200)
  ctx.strokeStyle = pal.border
  for (const c of countries) for (const dx of [0, -W]) { path(c, dx); ctx.stroke() }
}

/* ── hit-test paese sotto il cursore ── */
function inRing(x: number, y: number, r: Ring) {
  let inside = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export function countryAt(countries: Country[], lat: number, lng: number): Country | null {
  for (const c of countries) {
    const b = c.bbox
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue
    for (const poly of c.polys) {
      if (inRing(lng, lat, poly[0]) && !poly.slice(1).some((h) => inRing(lng, lat, h))) return c
    }
  }
  return null
}

/* ── etichette dei paesi principali, come su una carta stampata ── */
const ALWAYS = 'US CA MX BR AR CO PE VE CL GB FR DE IT ES PL UA TR RU CN IN JP KR KP ID PK IR IQ SA EG IL SY AF KZ AU ZA NG ET CD DZ LY SD MA KE'.split(' ')
const SHORT: Record<string, string> = {
  CD: 'RD Congo', CG: 'Congo', CF: 'Rep. Centrafricana', AE: 'Emirati', US: 'Stati Uniti', SS: 'Sud Sudan', SA: 'Arabia Saudita',
  GB: 'Regno Unito', ZA: 'Sudafrica', PG: 'Papua N. Guinea', DO: 'Rep. Dominicana', BA: 'Bosnia', MK: 'Macedonia N.', GQ: 'Guinea Eq.',
}
export interface LabelItem { lat: number; lng: number; text: string; tier: 1 | 2 }

export function pickLabels(countries: Country[], max = 64): LabelItem[] {
  const dn = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['it'], { type: 'region' }) : null
  const nameOf = (c: Country) => {
    const iso = c.iso || ''
    let n = SHORT[iso]
    if (!n) { try { n = (iso && dn?.of(iso)) || c.name } catch { n = c.name } }
    return (n || c.name).toUpperCase()
  }
  const must = new Set(ALWAYS)
  const bySize = [...countries].filter((c) => c.iso !== 'AQ' && c.iso !== 'GL' && c.area > 1.5).sort((a, b) => b.area - a.area)
  const chosen = new Map<Country, 1 | 2>()
  bySize.forEach((c, i) => { if (chosen.size < max && (i < 36 || (c.iso && must.has(c.iso)))) chosen.set(c, i < 22 ? 1 : 2) })
  for (const c of countries) if (c.iso && must.has(c.iso) && !chosen.has(c) && chosen.size < max + 8) chosen.set(c, 2)
  return [...chosen].map(([c, tier]) => ({ lat: c.cy, lng: c.cx, text: nameOf(c), tier }))
}
