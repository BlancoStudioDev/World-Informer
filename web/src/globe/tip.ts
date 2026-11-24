import type { TipData } from '@/lib/types'

/** Unico tooltip DOM condiviso (testo sempre via textContent: nessun HTML remoto). */
export class Tip {
  private el: HTMLDivElement
  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'map-tip'
    this.el.setAttribute('role', 'tooltip')
    document.body.append(this.el)
  }
  show(d: TipData, ev: { clientX: number; clientY: number }) {
    const el = this.el
    el.replaceChildren()
    const t = document.createElement('strong'); t.textContent = d.title; el.append(t)
    if (d.sub) { const s = document.createElement('span'); s.className = 'tip-sub'; s.textContent = d.sub; el.append(s) }
    if (d.badge) {
      const b = document.createElement('span'); b.className = 'tip-badge'; b.textContent = d.badge.text
      b.style.setProperty('--c', d.badge.color); el.append(b)
    }
    for (const m of d.meta ?? []) { const s = document.createElement('span'); s.className = 'tip-meta'; s.textContent = m; el.append(s) }
    el.style.display = 'block'
    this.move(ev)
  }
  move(ev: { clientX: number; clientY: number }) {
    const el = this.el, pad = 14
    const w = el.offsetWidth, h = el.offsetHeight
    let x = ev.clientX + pad, y = ev.clientY + pad
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad
    el.style.left = `${Math.max(8, x)}px`
    el.style.top = `${Math.max(8, y)}px`
  }
  hide() { this.el.style.display = 'none' }
  destroy() { this.el.remove() }
}
