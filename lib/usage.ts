import { daysBetween, todayIso } from './dates'

export type UsageClick = {
  memberId: string
  contactId: string
  contactName: string
  role: string
  company: string
  linkedinUrl?: string
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
  role: string
  company: string
  linkedinUrl: string
  whenLabel: string
  clickedAt: string
}

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
  const previous = current.find((item) => {
    if (item.contactId !== next.contactId) return false
    const gap = Math.abs(Date.parse(item.clickedAt) - nextTime)
    return !Number.isNaN(gap) && gap <= 20000
  })
  const merged = next.linkedinUrl ? next : { ...next, linkedinUrl: previous?.linkedinUrl ?? '' }
  const withoutNearDuplicate = current.filter((item) => {
    if (item.contactId !== next.contactId) return true
    const gap = Math.abs(Date.parse(item.clickedAt) - nextTime)
    return Number.isNaN(gap) || gap > 20000
  })
  return [merged, ...withoutNearDuplicate].sort((left, right) => right.clickedAt.localeCompare(left.clickedAt))
}

export function toOpening(
  click: Pick<UsageClick, 'contactId' | 'contactName' | 'role' | 'company' | 'clickedAt'> & { linkedinUrl?: string },
  timeZone: string,
): OwnOpening {
  return {
    contactId: click.contactId,
    contactName: click.contactName || 'Profile',
    role: click.role,
    company: click.company,
    linkedinUrl: click.linkedinUrl ?? '',
    clickedAt: click.clickedAt,
    whenLabel: formatRomeDateTime(click.clickedAt, timeZone),
  }
}

export function formatRomeDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
