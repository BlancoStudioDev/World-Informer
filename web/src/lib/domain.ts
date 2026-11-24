import type { RawCountry, SeverityBand } from './types'

/* ── Gravità: tre toni (alta / media / bassa), l'unico colore dell'interfaccia ── */
export type Sev3 = 'high' | 'medium' | 'low'
export const sev3 = (band?: SeverityBand): Sev3 =>
  band === 'severe' || band === 'high' ? 'high' : band === 'moderate' ? 'medium' : 'low'
export const SEV_LABEL: Record<Sev3, string> = { high: 'alta', medium: 'media', low: 'bassa' }
export const SEV_COLOR: Record<Sev3, string> = { high: '#d9534f', medium: '#e0a030', low: '#4fa66a' }
export const SEV_RANK: Record<Sev3, number> = { high: 3, medium: 2, low: 1 }
export const sevColor = (band?: SeverityBand) => SEV_COLOR[sev3(band)]

/* ── Settori GICS ── */
export const SECTOR_LABELS: Record<string, string> = {
  energy: 'Energia',
  materials: 'Materiali',
  industrials: 'Industriali',
  consumer_discretionary: 'Beni di consumo ciclici',
  consumer_staples: 'Beni di consumo primari',
  health_care: 'Sanità',
  financials: 'Finanziari',
  information_technology: 'Tecnologia',
  communication_services: 'Comunicazioni',
  utilities: 'Pubblica utilità',
  real_estate: 'Immobiliare',
}
const SECTOR_ALIAS: Record<string, string> = {
  technology: 'information_technology', tech: 'information_technology', it: 'information_technology',
  healthcare: 'health_care', health: 'health_care',
  communication: 'communication_services', communications: 'communication_services', telecom: 'communication_services',
  consumer_cyclical: 'consumer_discretionary', consumer_defensive: 'consumer_staples',
  utility: 'utilities', realestate: 'real_estate',
}
export function normSector(k: string): string {
  const n = String(k || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return SECTOR_ALIAS[n] || n
}
export const sectorLabel = (key: string, fallback?: string) =>
  SECTOR_LABELS[normSector(key)] || fallback || String(key).replace(/_/g, ' ')

/* ── Regioni ── */
export const REGIONS = [
  { key: 'EU', label: 'Europa' },
  { key: 'ME', label: 'Medio Oriente' },
  { key: 'AS', label: 'Asia-Pacifico' },
  { key: 'AM', label: 'Americhe' },
  { key: 'AF', label: 'Africa' },
]
const REGION_CODES: Record<string, string> = {
  EU: 'AD AL AM AT AX AZ BA BE BG BY CH CY CZ DE DK EE ES EU FI FO FR GB GE GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
  ME: 'AE BH EG IL IQ IR JO KW LB OM PS QA SA SY TR YE',
  AS: 'AF AU BD BN BT CN FJ GU HK ID IN JP KG KH KP KR KZ LA LK MM MN MO MV MY NC NP NZ PF PG PH PK SB SG TH TJ TL TM TO TW UZ VN VU WS',
  AM: 'AG AI AR AW BB BM BO BR BS BZ CA CL CO CR CU CW DM DO EC GD GL GT GY HN HT JM KN KY LC MX NI PA PE PR PY SR SV TT US UY VC VE VG VI',
  AF: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG ZA ZM ZW',
}
const ISO2_REGION: Record<string, string> = {}
for (const [region, codes] of Object.entries(REGION_CODES)) codes.split(' ').forEach((c) => { ISO2_REGION[c] = region })
const REGION_ALIAS: Record<string, string> = {
  europe: 'EU', europa: 'EU', 'middle east': 'ME', 'medio oriente': 'ME', mena: 'ME',
  asia: 'AS', 'asia-pacifico': 'AS', 'asia pacific': 'AS', 'asia-pacific': 'AS', oceania: 'AS',
  americas: 'AM', america: 'AM', americhe: 'AM', 'north america': 'AM', 'south america': 'AM', 'latin america': 'AM',
  'nord america': 'AM', 'sud america': 'AM', africa: 'AF',
}
export const regionLabel = (key: string | null | undefined) => REGIONS.find((r) => r.key === key)?.label ?? key ?? ''
export function regionOfCountry(c: RawCountry | null | undefined): string | null {
  if (!c) return null
  if (c.region) {
    const r = REGION_ALIAS[String(c.region).toLowerCase().trim()]
    if (r) return r
    if (REGIONS.some((x) => x.key === c.region)) return c.region
  }
  return ISO2_REGION[String(c.iso2 || '').toUpperCase()] || null
}

export const riskLabel = (r: number) => (r >= 70 ? 'critico' : r >= 50 ? 'alto' : r >= 30 ? 'medio' : 'basso')
