import { daysBetween, todayIso } from './dates'

export type BoardPeriod = 'week' | 'month' | 'all'

export type TeamClick = {
  contactId: string
  contactName: string
  company: string
  clickedAt: string
}

export type PersonRank = {
  contactId: string
  name: string
  company: string
  clicks: number
}

export type CompanyRank = {
  company: string
  clicks: number
}

export type TeamBoards = {
  week: number
  month: number
  total: number
  times: string[]
  people: Record<BoardPeriod, PersonRank[]>
  companies: Record<BoardPeriod, CompanyRank[]>
}

export function teamBoards(clicks: TeamClick[], timeZone: string, now = new Date(), limit = 10): TeamBoards {
  const today = todayIso(timeZone, now)
  const dated = clicks.flatMap((click) => {
    if (!click.contactId || !click.clickedAt) return []
    const age = daysBetween(todayIso(timeZone, new Date(click.clickedAt)), today)
    if (Number.isNaN(age)) return []
    return [{ ...click, age }]
  })
  return {
    week: dated.filter((click) => inPeriod(click.age, 'week')).length,
    month: dated.filter((click) => inPeriod(click.age, 'month')).length,
    total: dated.length,
    times: dated.map((click) => click.clickedAt),
    people: {
      week: topPeople(dated, 'week', limit),
      month: topPeople(dated, 'month', limit),
      all: topPeople(dated, 'all', limit),
    },
    companies: {
      week: topCompanies(dated, 'week', limit),
      month: topCompanies(dated, 'month', limit),
      all: topCompanies(dated, 'all', limit),
    },
  }
}

export function emptyTeamBoards(): TeamBoards {
  const emptyPeople = { week: [], month: [], all: [] }
  const emptyCompanies = { week: [], month: [], all: [] }
  return { week: 0, month: 0, total: 0, times: [], people: emptyPeople, companies: emptyCompanies }
}

function topPeople(clicks: Array<TeamClick & { age: number }>, period: BoardPeriod, limit: number): PersonRank[] {
  const counts = new Map<string, PersonRank>()
  for (const click of clicks) {
    if (!inPeriod(click.age, period)) continue
    const current = counts.get(click.contactId) ?? {
      contactId: click.contactId,
      name: click.contactName || 'Profile',
      company: click.company,
      clicks: 0,
    }
    current.clicks += 1
    if (!current.name && click.contactName) current.name = click.contactName
    if (!current.company && click.company) current.company = click.company
    counts.set(click.contactId, current)
  }
  return [...counts.values()].sort(byClicksThenName).slice(0, limit)
}

function topCompanies(clicks: Array<TeamClick & { age: number }>, period: BoardPeriod, limit: number): CompanyRank[] {
  const counts = new Map<string, CompanyRank>()
  for (const click of clicks) {
    const company = click.company.trim()
    if (!company || !inPeriod(click.age, period)) continue
    const current = counts.get(company) ?? { company, clicks: 0 }
    current.clicks += 1
    counts.set(company, current)
  }
  return [...counts.values()]
    .sort((left, right) => right.clicks - left.clicks || left.company.localeCompare(right.company, 'en'))
    .slice(0, limit)
}

function byClicksThenName(left: PersonRank, right: PersonRank): number {
  return right.clicks - left.clicks || left.name.localeCompare(right.name, 'en') || left.company.localeCompare(right.company, 'en')
}

function inPeriod(age: number, period: BoardPeriod): boolean {
  if (period === 'all') return true
  if (age < 0) return false
  if (period === 'week') return age < 7
  return age < 30
}
