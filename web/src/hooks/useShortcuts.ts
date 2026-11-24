import { useEffect } from 'react'
import { selectEvent, stepSelection, useApp } from '@/store/app'
import { toast } from 'sonner'

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}
/** overlay Radix aperti (popover, sheet, select): Esc spetta a loro */
const overlayOpen = () => !!document.querySelector('[data-slot="popover-content"][data-state="open"], [role="dialog"][data-state="open"], [role="listbox"]')

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const typing = isTyping(e.target)
      if (e.key === 'Escape') {
        if (overlayOpen()) return
        const el = e.target as HTMLInputElement
        if (typing && el.value) { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); useApp.getState().setFilters({ q: '' }); return }
        if (typing) { el.blur(); return }
        if (useApp.getState().selectedId) selectEvent(null)
        return
      }
      if (typing || overlayOpen()) return
      if (e.key === '/') {
        e.preventDefault()
        const st = useApp.getState()
        st.setTab('news'); st.setNewsSource('events')
        requestAnimationFrame(() => { const i = document.getElementById('news-search') as HTMLInputElement | null; i?.focus(); i?.select() })
      } else if (e.key === 'j' || e.key === 'J') { e.preventDefault(); useApp.getState().setTab('news'); stepSelection(1) }
      else if (e.key === 'k' || e.key === 'K') { e.preventDefault(); useApp.getState().setTab('news'); stepSelection(-1) }
      else if (e.key === '?') toast('Scorciatoie: J / K evento successivo o precedente · / cerca · Esc chiude', { duration: 5000 })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}
