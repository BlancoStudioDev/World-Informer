/* Dati dei layer (fuori da React) + piccolo emettitore: globo e mappa piatta si ridisegnano quando cambia un layer. */
import type { LayerId } from '@/lib/types'

export interface Quake { lat: number; lng: number; depth: number; mag: number; place: string; time: number; url?: string }
export interface Aircraft { hex?: string; flight?: string; lat: number; lng: number; alt?: number | string; gs?: number; type?: string; squawk?: string; category?: string }
export interface Ship { mmsi?: number; name?: string; lat: number; lng: number; speed?: number; type?: string; category?: string; kind: 'military' | 'rescue' | 'law' }
export interface Fire { lat: number; lng: number; frp?: number; confidence?: string; date?: string; time?: string; sensor?: string }
export interface Nuclear { name: string; lat: number; lng: number; output?: string }
export interface Jam { id?: string; polygon: [number, number][]; bad_pct?: number; bad_ac?: number; total_ac?: number; severity?: string }
export interface RadPoint { lat: number; lng: number; value: number; unit: string; captured?: string }

export const layerData = {
  quakes: [] as Quake[],
  flights: [] as Aircraft[],
  ships: [] as Ship[],
  firms: [] as Fire[],
  nuclear: [] as Nuclear[],
  gpsjam: [] as Jam[],
  radiation: [] as RadPoint[],
}

const subs = new Set<(id: LayerId | '*') => void>()
export const layerBus = {
  on(fn: (id: LayerId | '*') => void) { subs.add(fn); return () => { subs.delete(fn) } },
  changed(id: LayerId | '*') { subs.forEach((f) => f(id)) },
}
