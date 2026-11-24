import { SEV_COLOR } from '@/lib/domain'

type Theme = 'light' | 'dark'
/** Fuori dalla gravità il colore non esiste: i layer OSINT usano toni di grigio, invertiti nel tema scuro. */
export const ink = (theme: Theme, level: 1 | 2 | 3 = 2) =>
  theme === 'dark' ? ['#e4e4e7', '#c4c4cb', '#9a9aa3'][level - 1] : ['#18181b', '#3f3f46', '#71717a'][level - 1]
export { SEV_COLOR }
