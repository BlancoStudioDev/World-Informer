/* Carica i TLE e propaga le orbite con satellite.js FUORI dal main thread.
 *   → {type:'init', url}       scarica TLE, crea i satrec, risponde {type:'meta', ...}
 *   → {type:'start', ms}       propaga ogni `ms` e invia {type:'pos', lla:Float32Array(3n)} (lat°, lng°, quota/raggio terrestre)
 *   → {type:'stop'}
 *   → {type:'orbit', i}        risponde {type:'orbit', i, coords:Float32Array} (101 punti, 1 min l'uno) */
import { twoline2satrec, propagate, eciToGeodetic, gstime, degreesLat, degreesLong, type SatRec } from 'satellite.js'

const GROUPS: [string, RegExp][] = [
  ['starlink', /STARLINK/], ['oneweb', /ONEWEB/], ['iridium', /IRIDIUM/],
  ['flock', /FLOCK|LEMUR/], ['globalstar', /GLOBALSTAR/], ['stations', /TIANGONG|CSS \(/],
]
const isISS = (n: string) => /^ISS( \(ZARYA\))?$/i.test((n || '').trim())
const EARTH_R = 6371

let recs: SatRec[] = []
let timer: ReturnType<typeof setInterval> | null = null

function at(rec: SatRec, date: Date, gmst: number): [number, number, number] | null {
  const pv = propagate(rec, date)
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null
  const gd = eciToGeodetic(pv.position, gmst)
  return [degreesLat(gd.latitude), degreesLong(gd.longitude), gd.height / EARTH_R]
}

function tick() {
  const n = recs.length, now = new Date(), gmst = gstime(now)
  const lla = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    let p: [number, number, number] | null = null
    try { p = at(recs[i], now, gmst) } catch { p = null }
    if (p && isFinite(p[0]) && isFinite(p[1])) { lla[i * 3] = p[0]; lla[i * 3 + 1] = p[1]; lla[i * 3 + 2] = p[2] }
    else { lla[i * 3] = NaN; lla[i * 3 + 1] = NaN; lla[i * 3 + 2] = 0 }
  }
  ;(self as unknown as Worker).postMessage({ type: 'pos', lla, t: now.getTime() }, [lla.buffer])
}

self.onmessage = async (e: MessageEvent) => {
  const m = e.data
  if (m.type === 'init') {
    try {
      const res = await fetch(m.url)
      const data = res.ok ? await res.json() : null
      if (!Array.isArray(data)) throw new Error('TLE non disponibili')
      recs = []
      const names: string[] = [], group: number[] = [], incl: number[] = [], period: number[] = []
      let iss = -1
      for (const s of data as { name?: string; line1?: string; line2?: string }[]) {
        if (!s.line1 || !s.line2) continue
        let rec: SatRec
        try { rec = twoline2satrec(s.line1, s.line2) } catch { continue }
        const up = String(s.name || '').toUpperCase()
        let g = GROUPS.findIndex(([, re]) => re.test(up))
        if (g < 0) g = GROUPS.length
        if (isISS(s.name || '')) iss = recs.length
        recs.push(rec); names.push(s.name || ''); group.push(g)
        incl.push(parseFloat(s.line2.substring(8, 16)) || 0)
        const revs = parseFloat(s.line2.substring(52, 63))
        period.push(revs > 0 ? Math.round(1440 / revs) : 0)
      }
      postMessage({
        type: 'meta', n: recs.length, names, iss,
        groupKeys: GROUPS.map((g) => g[0]).concat('other'),
        group: Uint8Array.from(group), incl: Float32Array.from(incl), period: Float32Array.from(period),
      })
    } catch (err) { postMessage({ type: 'error', message: String((err as Error)?.message ?? err) }) }
  } else if (m.type === 'start') {
    if (timer) clearInterval(timer)
    tick(); timer = setInterval(tick, m.ms || 5000)
  } else if (m.type === 'stop') {
    if (timer) clearInterval(timer)
    timer = null
  } else if (m.type === 'orbit') {
    const rec = recs[m.i]
    const out: number[] = []
    if (rec) {
      const t0 = Date.now()
      for (let k = 0; k <= 100; k++) {
        const d = new Date(t0 + k * 60000)
        try { const p = at(rec, d, gstime(d)); if (p) out.push(p[0], p[1], p[2]) } catch { /* salta */ }
      }
    }
    const coords = Float32Array.from(out)
    ;(self as unknown as Worker).postMessage({ type: 'orbit', i: m.i, coords }, [coords.buffer])
  }
}
