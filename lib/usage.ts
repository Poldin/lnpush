import { daysBetween } from './dates'
import { todayIso } from './dates'

export type UsageClick = {
  memberId: string
  memberName: string
  contactName: string
  company: string
  clickedAt: string
}

export type MemberUsage = {
  id: string
  name: string
  today: number
  week: number
  total: number
}

export type RecentOpening = {
  memberName: string
  contactName: string
  company: string
  whenLabel: string
}

export type UsageSummary = {
  members: MemberUsage[]
  recent: RecentOpening[]
}

const RECENT_LIMIT = 40

export function summarizeUsage(
  members: { id: string; name: string }[],
  clicks: UsageClick[],
  timeZone: string,
  now = new Date(),
): UsageSummary {
  const today = todayIso(timeZone, now)
  const totals = new Map<string, MemberUsage>()
  for (const member of members) {
    totals.set(member.id, { id: member.id, name: member.name, today: 0, week: 0, total: 0 })
  }

  const ordered = [...clicks].sort((left, right) => right.clickedAt.localeCompare(left.clickedAt))
  for (const click of ordered) {
    const bucket = totals.get(click.memberId) ?? {
      id: click.memberId,
      name: click.memberName || 'Team',
      today: 0,
      week: 0,
      total: 0,
    }
    const day = todayIso(timeZone, new Date(click.clickedAt))
    const age = daysBetween(day, today)
    bucket.total += 1
    if (age >= 0 && age < 7) bucket.week += 1
    if (age === 0) bucket.today += 1
    totals.set(click.memberId, bucket)
  }

  const recent = ordered.slice(0, RECENT_LIMIT).map((click) => ({
    memberName: click.memberName || 'Team',
    contactName: click.contactName || 'Profilo',
    company: click.company,
    whenLabel: formatRome(click.clickedAt, timeZone),
  }))

  return {
    members: [...totals.values()].sort((left, right) => left.name.localeCompare(right.name, 'it')),
    recent,
  }
}

function formatRome(iso: string, timeZone: string): string {
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
