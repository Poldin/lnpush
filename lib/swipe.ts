import type { AppTab } from './tabs'

const SWIPE_DISTANCE = 60

export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5
}

export function gestureCountsAsTap(dx: number, dy: number): boolean {
  if (isHorizontalSwipe(dx, dy)) return false
  return Math.hypot(dx, dy) <= 12
}

export function nextTabFromSwipe(tab: AppTab, dx: number, dy: number, dialogOpen: boolean): AppTab | null {
  if (dialogOpen || !isHorizontalSwipe(dx, dy)) return null
  if (dx < 0 && tab === 'elenco') return 'utilizzo'
  if (dx > 0 && tab === 'utilizzo') return 'elenco'
  return null
}
