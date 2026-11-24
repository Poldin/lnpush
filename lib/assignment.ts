import { eachDate, daysBetween } from './dates'
import { assignmentRank, memberOrderRank } from './hash'
import type { Assignment, ClickIndex, Contact, PlanConfig, TeamMember } from './types'

/**
 * Deterministic daily plan.
 * A contact is given to at most one teammate per day, then locked until
 * `cooldownDays` have elapsed (assigned on D, eligible again on D + cooldownDays).
 * Each teammate receives a contact at most once. At most `maxMembersPerContact`
 * distinct teammates ever receive it.
 * With affinity on, a teammate is served from contacts that share their
 * technical flag when that pool still has someone eligible.
 * A person never receives a contact they already opened. Profiles nobody
 * has opened are chosen before the others.
 */
export function planAssignments(
  contacts: Contact[],
  team: TeamMember[],
  config: PlanConfig,
  throughDate: string,
  clicks: ClickIndex = emptyClicks(),
): Assignment[] {
  const people = uniqueMembers(team)
  const roster = uniqueContacts(contacts)
  if (people.length === 0 || roster.length === 0 || config.cardsPerDay < 1 || config.maxMembersPerContact < 1) {
    return []
  }

  const dates = eachDate(config.startDate, throughDate)
  const history = new Map<string, { lastDate: string; members: Set<string> }>()
  const assignments: Assignment[] = []

  for (const date of dates) {
    const order = [...people].sort((left, right) => compareNumber(memberOrderRank(date, left.id), memberOrderRank(date, right.id), left.id, right.id))
    const takenToday = new Set<string>()

    for (let slot = 0; slot < config.cardsPerDay; slot += 1) {
      for (const member of order) {
        const eligible = roster.filter((contact) => isEligible(contact, member.id, date, takenToday, history, config, clicks))
        const pool = selectPool(member, eligible, config.affinityEnabled)
        if (pool.length === 0) continue
        pool.sort((left, right) => compareForPick(date, member.id, left, right, clicks))
        const chosen = pool[0]
        if (!chosen) continue
        takenToday.add(chosen.id)
        const past = history.get(chosen.id) ?? { lastDate: date, members: new Set<string>() }
        past.lastDate = date
        past.members.add(member.id)
        history.set(chosen.id, past)
        assignments.push({ date, contactId: chosen.id, memberId: member.id })
      }
    }
  }

  return assignments
}

export function emptyClicks(): ClickIndex {
  return { byMember: new Set<string>(), any: new Set<string>() }
}

export function clickIndex(rows: { memberId: string; contactId: string }[]): ClickIndex {
  const index = emptyClicks()
  for (const row of rows) {
    if (!row.memberId || !row.contactId) continue
    index.byMember.add(`${row.memberId}\0${row.contactId}`)
    index.any.add(row.contactId)
  }
  return index
}

function isEligible(
  contact: Contact,
  memberId: string,
  date: string,
  takenToday: Set<string>,
  history: Map<string, { lastDate: string; members: Set<string> }>,
  config: PlanConfig,
  clicks: ClickIndex,
): boolean {
  if (!contact.linkedinUrl || takenToday.has(contact.id)) return false
  if (clicks.byMember.has(`${memberId}\0${contact.id}`)) return false
  const past = history.get(contact.id)
  if (!past) return true
  if (past.members.has(memberId)) return false
  if (past.members.size >= config.maxMembersPerContact) return false
  return daysBetween(past.lastDate, date) >= config.cooldownDays
}

function selectPool(member: TeamMember, eligible: Contact[], affinityEnabled: boolean): Contact[] {
  if (!affinityEnabled) return eligible.slice()
  const preferred = eligible.filter((contact) => contact.technical === member.technical)
  return preferred.length > 0 ? preferred : eligible.slice()
}

function uniqueMembers(team: TeamMember[]): TeamMember[] {
  const seen = new Set<string>()
  const members: TeamMember[] = []
  for (const member of [...team].sort((left, right) => left.id.localeCompare(right.id))) {
    const id = member.id.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    members.push({ ...member, id, name: member.name.trim() })
  }
  return members
}

function uniqueContacts(contacts: Contact[]): Contact[] {
  const seen = new Set<string>()
  const roster: Contact[] = []
  for (const contact of [...contacts].sort((left, right) => left.id.localeCompare(right.id))) {
    const id = contact.id.trim()
    if (!id || !contact.linkedinUrl.trim() || seen.has(id)) continue
    seen.add(id)
    roster.push({ ...contact, id })
  }
  return roster
}

function compareForPick(date: string, memberId: string, left: Contact, right: Contact, clicks: ClickIndex): number {
  const leftSeen = clicks.any.has(left.id) ? 1 : 0
  const rightSeen = clicks.any.has(right.id) ? 1 : 0
  if (leftSeen !== rightSeen) return leftSeen - rightSeen
  return compareNumber(assignmentRank(date, memberId, left.id), assignmentRank(date, memberId, right.id), left.id, right.id)
}

function compareNumber(leftRank: number, rightRank: number, leftId: string, rightId: string): number {
  if (leftRank !== rightRank) return leftRank < rightRank ? -1 : 1
  return leftId.localeCompare(rightId)
}
