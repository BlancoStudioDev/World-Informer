/* Satelliti: TLE propagati in un Web Worker, resi come particelle GPU (un solo draw call). */
import type { GlobeController } from '@/globe/controller'
import { polar2xyz } from '@/globe/geo'
import { absUrl } from '@/lib/data'
import { useApp } from '@/store/app'
import { ink } from './palette'
import { layerBus } from './data'

const SAT_INTERVAL = 5000

interface Meta {
  n: number; names: string[]; iss: number; groupKeys: string[]
  group: Uint8Array; incl: Float32Array; period: Float32Array
}
interface Obj { i: number; lat: number; lng: number; alt: number }
interface Group { color: string; members: Obj[]; items: Obj[] }

let worker: Worker | null = null
let meta: Meta | null = null
let objs: Obj[] | null = null
let groups: Group[] | null = null
let xyz: Float32Array | null = null
let lla: Float32Array | null = null
let pickReady = false
let ctrl: GlobeController | null = null
let issNode: HTMLButtonElement | null = null

export const issCard = { open: false, listeners: new Set<() => void>() }
export function setIssCard(open: boolean) { issCard.open = open; issCard.listeners.forEach((f) => f()) }

export const satCount = () => meta?.n ?? 0

export async function loadSatellites(): Promise<boolean> {
  if (typeof Worker === 'undefined') return false
  if (worker && meta) return true
  const w = new Worker(new URL('../workers/sat.worker.ts', import.meta.url), { type: 'module' })
  worker = w
  const ok = await new Promise<boolean>((resolve) => {
    const to = setTimeout(() => resolve(false), 30_000)
    w.onmessage = (e: MessageEvent) => {
      const d = e.data
      if (d.type === 'meta') { meta = d; clearTimeout(to); resolve(true) }
      else if (d.type === 'error') { clearTimeout(to); resolve(false) }
      else if (d.type === 'pos' && useApp.getState().layers.satellites) onPos(d.lla)
    }
    w.onerror = () => resolve(false)
    w.postMessage({ type: 'init', url: absUrl('data/data_satellites.json') })
  })
  if (!ok) { w.terminate(); worker = null; meta = null; return false }
  return true
}

const theme = () => useApp.getState().theme
const colorFor = (key: string | undefined) => (key === 'stations' ? ink(theme(), 1) : ink(theme(), 3))

function label(i: number) {
  const m = meta!
  const km = lla ? Math.round(lla[i * 3 + 2] * 6371) : '?'
  return {
    title: m.names[i],
    meta: [`Quota ${km} km · inclinazione ${m.incl[i].toFixed(1)}° · periodo ${m.period[i] || '?'} min`, "Clicca per l'orbita"],
  }
}

function onPos(arr: Float32Array) {
  if (!ctrl || !meta) return
  const m = meta, n = m.n
  lla = arr
  if (!objs) {
    objs = new Array(n)
    groups = m.groupKeys.map((k) => ({ color: colorFor(k), members: [], items: [] }))
    for (let i = 0; i < n; i++) {
      objs[i] = { i, lat: 0, lng: 0, alt: 0 }
      if (i !== m.iss) groups[m.group[i]].members.push(objs[i])
    }
    xyz = new Float32Array(n * 3)
    ctrl.world.particlesList('items').particleLat('lat').particleLng('lng').particleAltitude('alt')
      .particlesSize(2.2).particlesSizeAttenuation(false).particlesColor((l: Group) => l.color)
  }
  for (let i = 0; i < n; i++) {
    const o = objs[i], lat = arr[i * 3]
    if (lat === lat) { o.lat = lat; o.lng = arr[i * 3 + 1]; o.alt = arr[i * 3 + 2]; polar2xyz(o.lat, o.lng, o.alt, xyz!, i * 3) }
    else { o.lat = NaN; xyz![i * 3] = xyz![i * 3 + 1] = xyz![i * 3 + 2] = 0 }
  }
  groups!.forEach((g) => { g.items = g.members.filter((o) => o.lat === o.lat) })
  ctrl.world.particlesData(groups)
  if (!pickReady) {
    pickReady = true
    ctrl.setPickSource('sat', { n, xyz: xyz!, r: 0.5, get: (i) => ({ tip: () => label(i), click: () => showOrbit(i) }) })
  }
  if (m.iss >= 0 && objs[m.iss].lat === objs[m.iss].lat) {
    const s = objs[m.iss]
    ctrl.setHtml('iss', [{ lat: s.lat, lng: s.lng, alt: s.alt, el: issEl() }])
  }
}

function issEl() {
  if (issNode) return issNode
  const b = document.createElement('button')
  b.type = 'button'; b.className = 'iss-mk'
  b.title = "Stazione Spaziale Internazionale — clicca per la diretta NASA e l'orbita"
  b.setAttribute('aria-label', 'Stazione Spaziale Internazionale: apri diretta e orbita')
  const dot = document.createElement('span'); dot.setAttribute('aria-hidden', 'true')
  const em = document.createElement('em'); em.textContent = 'ISS'; em.style.fontStyle = 'normal'
  b.append(dot, em)
  b.addEventListener('click', (e) => { e.stopPropagation(); if (meta) showOrbit(meta.iss); setIssCard(true) })
  issNode = b
  return b
}

export function showOrbit(i: number) {
  if (!worker || !ctrl || i == null || i < 0) return
  const w = worker
  const handler = (e: MessageEvent) => {
    if (e.data.type !== 'orbit' || e.data.i !== i) return
    w.removeEventListener('message', handler)
    const c: Float32Array = e.data.coords, pts: number[][] = []
    for (let k = 0; k < c.length; k += 3) pts.push([c[k], c[k + 1], c[k + 2]])
    ctrl!.world.pathsData([{ pts }]).pathPoints('pts').pathPointLat((p: number[]) => p[0]).pathPointLng((p: number[]) => p[1])
      .pathPointAlt((p: number[]) => p[2]).pathColor(() => ink(theme(), 1)).pathResolution(4).pathStroke(0.5)
  }
  w.addEventListener('message', handler)
  w.postMessage({ type: 'orbit', i })
  const o = objs?.[i]
  if (o && o.lat === o.lat) ctrl.flyTo(o.lat, o.lng, o.alt + 1.6)
}

export function clearOrbit() { ctrl?.world.pathsData([]) }

/** Avvia/ferma la propagazione sul globo. */
export function applySatellites(c: GlobeController | null, on: boolean) {
  ctrl = c
  if (!worker || !meta || !c) return
  if (on) { worker.postMessage({ type: 'start', ms: SAT_INTERVAL }); return }
  worker.postMessage({ type: 'stop' })
  if (objs) c.world.particlesData([])
  c.world.pathsData([]); c.setHtml('iss', []); c.setPickSource('sat', null); pickReady = false; setIssCard(false)
  layerBus.changed('satellites')
}

/** Ricolora i gruppi (cambio tema). */
export function recolorSatellites() {
  if (!groups || !meta) return
  groups.forEach((g, i) => { g.color = colorFor(meta!.groupKeys[i]) })
  ctrl?.world.particlesData(groups)
}

export function pauseSatellites(paused: boolean) {
  if (!worker || !useApp.getState().layers.satellites) return
  worker.postMessage(paused ? { type: 'stop' } : { type: 'start', ms: SAT_INTERVAL })
}
