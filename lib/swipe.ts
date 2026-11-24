import type { AppTab } from './tabs'

const SWIPE_DISTANCE = 60

export function nextTabFromSwipe(tab: AppTab, dx: number, dy: number, dialogOpen: boolean): AppTab | null {
  if (dialogOpen) return null
  if (Math.abs(dx) <= SWIPE_DISTANCE) return null
  if (Math.abs(dx) <= Math.abs(dy) * 1.5) return null
  if (dx < 0 && tab === 'elenco') return 'utilizzo'
  if (dx > 0 && tab === 'utilizzo') return 'elenco'
  return null
}
