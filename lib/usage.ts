import { daysBetween, todayIso } from './dates'

export type UsageClick = {
  memberId: string
  contactId: string
  contactName: string
  company: string
  clickedAt: string
}

export type OwnCounts = {
  today: number
  week: number
  total: number
}

export type OwnOpening = {
  contactId: string
  contactName: string
  company: string
  whenLabel: string
  clickedAt: string
}

const RECENT_LIMIT = 40

export function ownCounts(clicks: UsageClick[], memberId: string, timeZone: string, now = new Date()): OwnCounts {
  const today = todayIso(timeZone, now)
  const counts: OwnCounts = { today: 0, week: 0, total: 0 }
  for (const click of clicks) {
    if (click.memberId !== memberId || !click.contactId) continue
    counts.total += 1
    const age = daysBetween(todayIso(timeZone, new Date(click.clickedAt)), today)
    if (age >= 0 && age < 7) counts.week += 1
    if (age === 0) counts.today += 1
  }
  return counts
}

export function ownOpenings(clicks: UsageClick[], memberId: string, timeZone: string): OwnOpening[] {
  return clicks
    .filter((click) => click.memberId === memberId && click.contactId)
    .sort((left, right) => right.clickedAt.localeCompare(left.clickedAt))
    .slice(0, RECENT_LIMIT)
    .map((click) => toOpening(click, timeZone))
}

export function applyOpening(
  current: { recent: OwnOpening[]; counts: OwnCounts },
  next: OwnOpening,
  timeZone: string,
  now = new Date(),
): { recent: OwnOpening[]; counts: OwnCounts } {
  const nextTime = Date.parse(next.clickedAt)
  const alreadyThere = current.recent.some((item) => {
    if (item.contactId !== next.contactId) return false
    const gap = Math.abs(Date.parse(item.clickedAt) - nextTime)
    return !Number.isNaN(gap) && gap <= 20000
  })
  const recent = mergeOpening(current.recent, next)
  if (alreadyThere) return { recent, counts: current.counts }
  const today = todayIso(timeZone, now)
  const age = daysBetween(todayIso(timeZone, new Date(next.clickedAt)), today)
  return {
    recent,
    counts: {
      total: current.counts.total + 1,
      week: current.counts.week + (age >= 0 && age < 7 ? 1 : 0),
      today: current.counts.today + (age === 0 ? 1 : 0),
    },
  }
}

export function mergeOpening(current: OwnOpening[], next: OwnOpening): OwnOpening[] {
  const nextTime = Date.parse(next.clickedAt)
  const withoutNearDuplicate = current.filter((item) => {
    if (item.contactId !== next.contactId) return true
    const gap = Math.abs(Date.parse(item.clickedAt) - nextTime)
    return Number.isNaN(gap) || gap > 20000
  })
  return [next, ...withoutNearDuplicate].sort((left, right) => right.clickedAt.localeCompare(left.clickedAt)).slice(0, RECENT_LIMIT)
}

export function toOpening(click: Pick<UsageClick, 'contactId' | 'contactName' | 'company' | 'clickedAt'>, timeZone: string): OwnOpening {
  return {
    contactId: click.contactId,
    contactName: click.contactName || 'Profilo',
    company: click.company,
    clickedAt: click.clickedAt,
    whenLabel: formatRomeDateTime(click.clickedAt, timeZone),
  }
}

export function formatRomeDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('it-IT', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
