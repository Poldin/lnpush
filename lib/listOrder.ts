import { addDays, todayIso } from './dates'
import { assignmentRank } from './hash'

export const HOT_EPOCH = '2026-11-23'
export const COOL_WINDOW_MS = 48 * 60 * 60 * 1000
export const REFRESH_AFTER_MS = 10 * 24 * 60 * 60 * 1000

export type ListContact = {
  id: string
  name: string
  role: string
  company: string
  linkedinUrl: string
}

export type ListClick = {
  memberId: string
  contactId: string
  clickedAt: string
}

export type ForcedWeek = {
  weekStart: string
  company: string
}

export type CompanyScore = {
  name: string
  profiles: number
  clicks: number
}

export function weekStartFromIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  const back = weekday === 0 ? 6 : weekday - 1
  date.setUTCDate(date.getUTCDate() - back)
  return date.toISOString().slice(0, 10)
}

export function weekStartIso(timeZone: string, now = new Date()): string {
  return weekStartFromIsoDate(todayIso(timeZone, now))
}

export function isCooled(clickTimes: string[], now: Date): boolean {
  const recent = clickTimes
    .map((value) => Date.parse(value))
    .filter((time) => !Number.isNaN(time) && now.getTime() - time >= 0 && now.getTime() - time < COOL_WINDOW_MS)
    .sort((left, right) => right - left)
  const second = recent[1]
  return second !== undefined && now.getTime() - second < COOL_WINDOW_MS
}

export function companyScores(contacts: ListContact[], clicks: ListClick[]): CompanyScore[] {
  const byCompany = new Map<string, CompanyScore>()
  const contactCompany = new Map<string, string>()
  for (const contact of contacts) {
    const name = contact.company.trim()
    if (!name || !contact.linkedinUrl.trim()) continue
    contactCompany.set(contact.id, name)
    const current = byCompany.get(name) ?? { name, profiles: 0, clicks: 0 }
    current.profiles += 1
    byCompany.set(name, current)
  }
  for (const click of clicks) {
    const name = contactCompany.get(click.contactId)
    const score = name ? byCompany.get(name) : undefined
    if (score) score.clicks += 1
  }
  return [...byCompany.values()]
}

export function resolveHotCompany(
  weekStart: string,
  companies: CompanyScore[],
  forced: ForcedWeek[],
  epoch = HOT_EPOCH,
): string | null {
  if (companies.length === 0) return null
  const forcedByWeek = new Map(forced.map((week) => [week.weekStart, week.company.trim()]))
  const lastHot = new Map<string, string>()
  const start = weekStart < epoch ? weekStart : epoch
  let chosen: string | null = null
  for (const week of eachMonday(start, weekStart)) {
    const forcedName = forcedByWeek.get(week)
    chosen = forcedName || pickAutomatic(companies, lastHot)
    if (chosen) lastHot.set(chosen, week)
  }
  return chosen
}

export function hiddenContactIds(clicks: ListClick[], memberId: string, now: Date): string[] {
  const lastByContact = new Map<string, number>()
  for (const click of clicks) {
    if (click.memberId !== memberId || !click.contactId) continue
    const time = Date.parse(click.clickedAt)
    if (Number.isNaN(time)) continue
    const previous = lastByContact.get(click.contactId)
    if (previous === undefined || time > previous) lastByContact.set(click.contactId, time)
  }
  return [...lastByContact.entries()].filter(([, time]) => now.getTime() - time < REFRESH_AFTER_MS).map(([id]) => id)
}

export function buildMemberList(
  contacts: ListContact[],
  clicks: ListClick[],
  memberId: string,
  date: string,
  now: Date,
  hotCompany: string | null,
): Array<ListContact & { hot: boolean; cooled: boolean; refresh: boolean; clickTimes: string[] }> {
  const times = new Map<string, string[]>()
  const myLast = new Map<string, number>()
  for (const click of clicks) {
    if (!click.contactId) continue
    const bucket = times.get(click.contactId) ?? []
    if (click.clickedAt) bucket.push(click.clickedAt)
    times.set(click.contactId, bucket)
    if (click.memberId !== memberId) continue
    const time = Date.parse(click.clickedAt)
    if (Number.isNaN(time)) continue
    const previous = myLast.get(click.contactId)
    if (previous === undefined || time > previous) myLast.set(click.contactId, time)
  }
  const cards = contacts
    .filter((contact) => contact.linkedinUrl.trim())
    .flatMap((contact) => {
      const last = myLast.get(contact.id)
      if (last !== undefined && now.getTime() - last < REFRESH_AFTER_MS) return []
      const clickTimes = times.get(contact.id) ?? []
      const hot = Boolean(hotCompany) && contact.company.trim() === hotCompany
      return [{ ...contact, hot, cooled: isCooled(clickTimes, now), refresh: last !== undefined, clickTimes }]
    })
  return sortListCards(cards, { memberId, date, now, hotCompany })
}

export function sortListCards<T extends { id: string; company: string; clickTimes?: string[]; hot?: boolean; refresh?: boolean }>(
  cards: T[],
  args: { memberId: string; date: string; now: Date; hotCompany: string | null },
): T[] {
  return [...cards].sort((left, right) => {
    const leftBucket = bucketOf(left, args)
    const rightBucket = bucketOf(right, args)
    if (leftBucket !== rightBucket) return leftBucket - rightBucket
    return assignmentRank(args.date, args.memberId, left.id) - assignmentRank(args.date, args.memberId, right.id)
  })
}

function bucketOf(
  card: { id: string; company: string; clickTimes?: string[]; hot?: boolean; refresh?: boolean },
  args: { now: Date; hotCompany: string | null },
): number {
  const hot = card.hot ?? (Boolean(args.hotCompany) && card.company.trim() === args.hotCompany)
  const cooled = isCooled(card.clickTimes ?? [], args.now)
  const refresh = card.refresh === true
  return (cooled ? 4 : 0) + (refresh ? 2 : 0) + (hot ? 0 : 1)
}

function pickAutomatic(companies: CompanyScore[], lastHot: Map<string, string>): string | null {
  const ranked = [...companies].sort((left, right) => {
    const leftLast = lastHot.get(left.name) ?? ''
    const rightLast = lastHot.get(right.name) ?? ''
    if (leftLast !== rightLast) return leftLast < rightLast ? -1 : 1
    if (left.profiles !== right.profiles) return right.profiles - left.profiles
    if (left.clicks !== right.clicks) return left.clicks - right.clicks
    return left.name.localeCompare(right.name, 'it')
  })
  return ranked[0]?.name ?? null
}

function eachMonday(from: string, to: string): string[] {
  const weeks: string[] = []
  let cursor = weekStartFromIsoDate(from)
  const end = weekStartFromIsoDate(to)
  while (cursor <= end && weeks.length < 2000) {
    weeks.push(cursor)
    cursor = addDays(cursor, 7)
  }
  return weeks
}
