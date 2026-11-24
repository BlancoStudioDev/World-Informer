/* Controller imperativo del globo (globe.gl). React non lo ridisegna mai: monta un <div> una volta sola e tutto il
 * resto (dati, tema, camera) arriva da qui tramite ref/subscribe.
 *
 * Prestazioni: nessun marker è un elemento DOM. Tutti i punti (notizie, terremoti, incendi, voli…) finiscono in un unico
 * mesh "merged" (pointsData + pointsMerge) = 1 draw call; la mappa di base è una sola texture; hover e click sono risolti
 * sulla CPU con una proiezione schermo (throttled a un frame). Anelli animati solo per l'evento selezionato.
 */
import Globe from 'globe.gl'
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace, LinearMipmapLinearFilter } from 'three'
import type { PointItem, TipData } from '@/lib/types'
import { countryAt, paintBase, pickLabels, PALETTE, type Country, type LabelItem } from './basemap'
import { Tip } from './tip'
import { GLOBE_R, polar2xyz } from './geo'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type World = any
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export interface PickSource {
  n: number
  xyz: Float32Array
  r: number
  get(i: number): { tip?: () => TipData; click?: () => void }
}
interface InternalPickSet { n: number; xyz: Float32Array; r?: number; list?: PointItem[]; get(i: number): { tip?: () => TipData; click?: () => void } }

export interface HexFeature {
  geometry: unknown
  cap: string
  stroke: string
  alt: number
  tip: () => TipData
  polygon: [number, number][]   // [lng, lat] per l'hit-test
}
export interface RingItem { lat: number; lng: number; maxR: number; color: [number, number, number] }

export class GlobeController {
  readonly world: World
  private container: HTMLElement
  private tip = new Tip()
  private pointGroups = new Map<string, PointItem[]>()
  private pickSets = new Map<string, InternalPickSet>()
  private htmlGroups = new Map<string, unknown[]>()
  private hexes: HexFeature[] = []
  private pointsDirty = false
  private active = true
  private ro: ResizeObserver
  private countries: Country[] = []
  private riskByIso: Map<string, number> | null = null
  private risk = new Map<string, { risk: number; n: number; name?: string }>()
  private theme: 'light' | 'dark' = 'light'
  private canvas: HTMLCanvasElement | null = null
  private texture: CanvasTexture | null = null
  private material: MeshBasicMaterial
  private labelItems: LabelItem[] = []
  private labelsTier2 = false
  private autoRotateWanted = true
  /** contatori per il debug */
  stats = { pointFlushes: 0, paints: 0 }
  onEmptyClick?: () => void

  constructor(container: HTMLElement, theme: 'light' | 'dark') {
    this.container = container
    this.theme = theme
    const world: World = new (Globe as unknown as new (el: HTMLElement, o?: object) => World)(container, { animateIn: false })
    this.world = world
    world
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(false)
      .showGraticules(false)
      .polygonsTransitionDuration(0)
      .pointsMerge(true).pointResolution(10).pointsTransitionDuration(0)
      .pointLat('lat').pointLng('lng').pointAltitude('alt').pointRadius('r').pointColor('color')
      .ringLat('lat').ringLng('lng').ringAltitude(0.004).ringMaxRadius('maxR').ringPropagationSpeed(1.2)
      .ringRepeatPeriod(2200).ringColor((d: RingItem) => (t: number) => `rgba(${d.color.join(',')},${((1 - t) * 0.8).toFixed(2)})`)
      .polygonGeoJsonGeometry((d: HexFeature) => d.geometry)
      .polygonCapColor((d: HexFeature) => d.cap).polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor((d: HexFeature) => d.stroke).polygonAltitude((d: HexFeature) => d.alt)
      .htmlTransitionDuration(0)
      .htmlLat((d: { lat: number }) => d.lat).htmlLng((d: { lng: number }) => d.lng).htmlAltitude((d: { alt?: number }) => d.alt ?? 0.01)
      .htmlElement((d: { el: HTMLElement }) => d.el)

    // pixel ratio limitato: a DPR 2–3 il fill rate domina senza benefici visibili
    const renderer = world.renderer()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))

    // superficie piatta (nessuna illuminazione): ocean + texture della mappa
    this.material = new MeshBasicMaterial({ color: PALETTE[theme].ocean })
    world.globeMaterial(this.material)

    // luci ridotte al minimo: i punti sono lambert, il globo non è illuminato
    const controls = world.controls()
    controls.autoRotate = !reducedMotion()
    this.autoRotateWanted = controls.autoRotate
    controls.autoRotateSpeed = 0.25
    controls.enableDamping = true
    controls.minDistance = 120
    world.pointOfView({ lat: 28, lng: 18, altitude: container.clientWidth < 600 ? 2.4 : 2.05 })
    container.addEventListener('pointerdown', () => { controls.autoRotate = false })
    container.addEventListener('dblclick', () => { if (this.autoRotateWanted) controls.autoRotate = true })

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
    document.addEventListener('visibilitychange', this.applyPause)

    this.wirePointer()
    controls.addEventListener('end', this.onCameraEnd)
  }

  /* ── ciclo di vita ── */
  private applyPause = () => {
    if (this.active && !document.hidden) this.world.resumeAnimation()
    else this.world.pauseAnimation()
  }
  setActive(on: boolean) {
    this.active = on
    this.applyPause()
    if (on) requestAnimationFrame(() => this.resize())
  }
  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight
    if (w > 0 && h > 0) this.world.width(w).height(h)
  }
  dispose() {
    this.ro.disconnect()
    document.removeEventListener('visibilitychange', this.applyPause)
    this.tip.destroy()
    this.world.pauseAnimation()
    this.world._destructor?.()
  }

  /* ── mappa di base ── */
  setCountries(countries: Country[], risk: Map<string, { risk: number; n: number; name?: string }>) {
    this.countries = countries
    this.risk = risk
    this.labelItems = pickLabels(countries)
    this.paint()
    this.applyLabels()
  }
  setRisk(risk: Map<string, { risk: number; n: number; name?: string }>, show: boolean) {
    this.risk = risk
    this.riskByIso = show ? new Map([...risk].map(([k, v]) => [k, v.risk])) : null
    if (this.countries.length) this.paint()
  }
  setTheme(theme: 'light' | 'dark') {
    this.theme = theme
    if (this.countries.length) { this.paint(); this.applyLabels() } else this.material.color.set(PALETTE[theme].ocean)
  }
  private paint() {
    const small = this.container.clientWidth < 600
    const W = small ? 2048 : 4096, H = W / 2
    if (!this.canvas || this.canvas.width !== W) {
      this.canvas = document.createElement('canvas')
      this.canvas.width = W; this.canvas.height = H
      this.texture?.dispose()
      this.texture = null
    }
    paintBase(this.canvas, this.countries, PALETTE[this.theme], this.riskByIso)
    if (!this.texture) {
      const t = new CanvasTexture(this.canvas)
      t.colorSpace = SRGBColorSpace
      t.minFilter = LinearMipmapLinearFilter
      t.anisotropy = Math.min(8, this.world.renderer().capabilities.getMaxAnisotropy())
      this.texture = t
      this.material.map = t
      this.material.color.set('#ffffff')
      this.material.needsUpdate = true
    } else this.texture.needsUpdate = true
    this.stats.paints++
  }
  private applyLabels() {
    const color = PALETTE[this.theme].label
    const items = this.labelItems.filter((l) => l.tier === 1 || this.labelsTier2)
    this.world
      .labelsData(items)
      .labelLat('lat').labelLng('lng').labelText('text')
      .labelSize(this.container.clientWidth < 600 ? 1.1 : 0.9)
      .labelDotRadius(0).labelIncludeDot(false).labelResolution(2).labelAltitude(0.0015)
      .labelColor(() => color).labelsTransitionDuration(0)
  }
  /** I paesi minori compaiono solo avvicinandosi (ricostruisce le etichette solo quando si attraversa la soglia). */
  private onCameraEnd = () => {
    const alt = this.world.pointOfView().altitude as number
    const want = alt < 1.9
    if (want !== this.labelsTier2 && this.labelItems.length) { this.labelsTier2 = want; this.applyLabels() }
  }

  /* ── punti WebGL ── */
  setPoints(key: string, items: PointItem[] | null) {
    const list = items ?? []
    const prev = this.pointGroups.get(key)
    if (prev && prev.length === list.length && prev.every((p, i) => p === list[i])) return   // invariato: niente rebuild del mesh
    this.pointGroups.set(key, list)
    const xyz = new Float32Array(list.length * 3)
    list.forEach((it, i) => polar2xyz(it.lat, it.lng, it.alt, xyz, i * 3))
    this.pickSets.set(key, { n: list.length, xyz, list, get: (i) => list[i] })
    if (!this.pointsDirty) { this.pointsDirty = true; requestAnimationFrame(this.flushPoints) }
  }
  private flushPoints = () => {
    this.pointsDirty = false
    this.stats.pointFlushes++
    this.world.pointsData(([] as PointItem[]).concat(...this.pointGroups.values()))
  }
  setRings(items: RingItem[]) { this.world.ringsData(items) }
  setPickSource(key: string, src: PickSource | null) { if (src) this.pickSets.set(key, src); else this.pickSets.delete(key) }
  setHtml(key: string, items: unknown[]) {
    this.htmlGroups.set(key, items)
    this.world.htmlElementsData(([] as unknown[]).concat(...this.htmlGroups.values()))
  }
  setHexes(features: HexFeature[]) { this.hexes = features; this.world.polygonsData(features) }

  flyTo(lat: number, lng: number, altitude = 1.5, ms = 900) {
    this.world.controls().autoRotate = false
    this.world.pointOfView({ lat, lng, altitude }, reducedMotion() ? 0 : ms)
  }

  /** Tempo medio (ms) di N render consecutivi con gl.finish(): misura il costo reale del renderer. */
  bench(n = 60): number {
    const r = this.world.renderer(), scene = this.world.scene(), cam = this.world.camera(), gl = r.getContext()
    gl.finish()
    const t0 = performance.now()
    for (let i = 0; i < n; i++) r.render(scene, cam)
    gl.finish()
    return (performance.now() - t0) / n
  }

  /* ── picking sulla CPU ── */
  private pick(px: number, py: number) {
    const cam = this.world.camera()
    const P = cam.projectionMatrix.elements, V = cam.matrixWorldInverse.elements
    const cp = cam.position
    const w = this.container.clientWidth, hh = this.container.clientHeight
    const focal = (P[5] * hh) / 2
    const limit = GLOBE_R * GLOBE_R * 0.999
    let best: { tip?: () => TipData; click?: () => void } | null = null
    let bestScore = 1
    for (const set of this.pickSets.values()) {
      const { n, xyz, list } = set
      for (let i = 0; i < n; i++) {
        const x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2]
        if (x * cp.x + y * cp.y + z * cp.z < limit) continue              // lato opposto del globo
        const vx = V[0] * x + V[4] * y + V[8] * z + V[12]
        const vy = V[1] * x + V[5] * y + V[9] * z + V[13]
        const vz = V[2] * x + V[6] * y + V[10] * z + V[14]
        const cw = -vz
        if (cw <= 0) continue
        const sx = ((P[0] * vx) / cw + 1) / 2 * w
        const sy = (1 - (P[5] * vy) / cw) / 2 * hh
        const dx = sx - px, dy = sy - py
        const rdeg = set.r != null ? set.r : list?.[i].r || 0
        const rad = Math.max(7, ((rdeg * Math.PI) / 180) * GLOBE_R * focal / cw + 4)
        const d2 = dx * dx + dy * dy
        if (d2 > rad * rad) continue
        const score = d2 / (rad * rad)
        if (score < bestScore) { bestScore = score; best = set.get(i) }
      }
    }
    return best
  }

  private regionTip(px: number, py: number): TipData | null {
    const g = this.world.toGlobeCoords(px, py) as { lat: number; lng: number } | null
    if (!g) return null
    if (this.hexes.length) {
      for (const h of this.hexes) if (pointInPoly(g.lng, g.lat, h.polygon)) return h.tip()
    }
    if (this.riskByIso && this.countries.length) {
      const c = countryAt(this.countries, g.lat, g.lng)
      const r = c?.iso ? this.risk.get(c.iso) : null
      if (c && r && r.risk > 0) return {
        title: r.name || c.name,
        badge: { text: `Rischio ${Math.round(r.risk)}`, color: '#d9534f' },
        meta: [`${r.n} ${r.n === 1 ? 'evento' : 'eventi'} in corso`],
      }
    }
    return null
  }

  private wirePointer() {
    const el = this.container
    let ptr: { x: number; y: number; buttons: number; ev: PointerEvent } | null = null
    let raf = 0
    let hovered: unknown = null
    let hoveredRegion = false
    let down: { x: number; y: number; t: number } | null = null
    const rect = () => el.getBoundingClientRect()

    const doHover = () => {
      raf = 0
      if (!ptr || (ptr.buttons & 1)) return
      const hit = this.pick(ptr.x, ptr.y)
      if (hit) {
        if (hit !== hovered) {
          hovered = hit; hoveredRegion = false
          el.style.cursor = hit.click ? 'pointer' : ''
          if (hit.tip) this.tip.show(hit.tip(), ptr.ev); else this.tip.hide()
        } else this.tip.move(ptr.ev)
        return
      }
      hovered = null
      const rt = this.regionTip(ptr.x, ptr.y)
      if (rt) { this.tip.show(rt, ptr.ev); hoveredRegion = true; el.style.cursor = '' }
      else if (hoveredRegion) { this.tip.hide(); hoveredRegion = false }
      else if (el.style.cursor) { el.style.cursor = ''; this.tip.hide() }
    }
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return
      const r = rect()
      ptr = { x: e.clientX - r.left, y: e.clientY - r.top, buttons: e.buttons, ev: e }
      if (!raf) raf = requestAnimationFrame(doHover)
    })
    el.addEventListener('pointerleave', () => { ptr = null; hovered = null; hoveredRegion = false; this.tip.hide(); el.style.cursor = '' })
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; this.tip.hide() })
    el.addEventListener('pointerup', (e) => {
      if (!down) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t
      down = null
      if (moved > 6 || dt > 600) return
      const r = rect()
      const hit = this.pick(e.clientX - r.left, e.clientY - r.top)
      if (hit) {
        if (hit.click) hit.click()
        else if (hit.tip && e.pointerType === 'touch') { this.tip.show(hit.tip(), e); setTimeout(() => this.tip.hide(), 2500) }
      } else if (e.pointerType === 'touch') {
        const rt = this.regionTip(e.clientX - r.left, e.clientY - r.top)
        if (rt) { this.tip.show(rt, e); setTimeout(() => this.tip.hide(), 2500) }
        this.onEmptyClick?.()
      } else this.onEmptyClick?.()
    })
  }
}

function pointInPoly(x: number, y: number, ring: [number, number][]) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
