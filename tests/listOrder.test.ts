import { describe, expect, it } from 'vitest'

import {
  HOT_EPOCH,
  REFRESH_AFTER_MS,
  buildMemberList,
  companyScores,
  isCooled,
  resolveHotCompany,
  weekStartFromIsoDate,
  type CompanyScore,
  type ListContact,
} from '../lib/listOrder'

const now = new Date('2026-11-25T12:00:00Z')

function contact(id: string, company: string): ListContact {
  return { id, name: id, role: 'Role', company, linkedinUrl: `https://www.linkedin.com/in/${id}` }
}

describe('48 hour cooling', () => {
  it('cools a profile only while two team clicks sit inside the rolling window', () => {
    expect(isCooled(['2026-11-25T11:00:00Z'], now)).toBe(false)
    expect(isCooled(['2026-11-25T10:00:00Z', '2026-11-25T11:00:00Z'], now)).toBe(true)
    expect(isCooled(['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z'], now)).toBe(false)
    expect(isCooled(['2026-11-23T11:00:00Z', '2026-11-25T11:00:00Z', '2026-11-25T11:30:00Z'], now)).toBe(true)
  })

  it('hides only profiles this member opened and sinks cooled ones, hot first', () => {
    const contacts = [contact('hot-fresh', 'Hot'), contact('plain', 'Other'), contact('hot-cool', 'Hot'), contact('mine', 'Other'), contact('cool', 'Other')]
    const clicks = [
      { memberId: 'andrea', contactId: 'hot-cool', clickedAt: '2026-11-25T10:00:00Z' },
      { memberId: 'm3', contactId: 'hot-cool', clickedAt: '2026-11-25T11:00:00Z' },
      { memberId: 'andrea', contactId: 'cool', clickedAt: '2026-11-25T09:00:00Z' },
      { memberId: 'andrea', contactId: 'cool', clickedAt: '2026-11-25T09:30:00Z' },
      { memberId: 'paolo', contactId: 'mine', clickedAt: '2026-11-20T09:00:00Z' },
    ]
    const list = buildMemberList(contacts, clicks, 'paolo', '2026-11-25', now, 'Hot')
    expect(list.map((item) => item.id)).toEqual(['hot-fresh', 'plain', 'hot-cool', 'cool'])
    expect(list.find((item) => item.id === 'mine')).toBeUndefined()
    expect(list.find((item) => item.id === 'hot-cool')?.cooled).toBe(true)
    expect(buildMemberList(contacts, clicks, 'paolo', '2026-11-25', now, 'Hot').map((item) => item.id)).toEqual(list.map((item) => item.id))
  })

  it('shows my profile again 10 days after my last click, behind profiles I never opened', () => {
    expect(REFRESH_AFTER_MS).toBe(10 * 24 * 60 * 60 * 1000)
    const contacts = [
      contact('fresh', 'Other'),
      contact('hot-fresh', 'Hot'),
      contact('refresh', 'Other'),
      contact('hot-refresh', 'Hot'),
      contact('recent', 'Other'),
      contact('cool', 'Other'),
      contact('cool-refresh', 'Other'),
      contact('hot-cool', 'Hot'),
    ]
    const old = '2026-11-15T11:00:00Z'
    const clicks = [
      { memberId: 'paolo', contactId: 'refresh', clickedAt: old },
      { memberId: 'paolo', contactId: 'hot-refresh', clickedAt: old },
      { memberId: 'paolo', contactId: 'recent', clickedAt: '2026-11-20T12:00:00Z' },
      { memberId: 'paolo', contactId: 'cool-refresh', clickedAt: old },
      { memberId: 'andrea', contactId: 'cool', clickedAt: '2026-11-25T09:00:00Z' },
      { memberId: 'm3', contactId: 'cool', clickedAt: '2026-11-25T09:30:00Z' },
      { memberId: 'andrea', contactId: 'cool-refresh', clickedAt: '2026-11-25T10:00:00Z' },
      { memberId: 'm3', contactId: 'cool-refresh', clickedAt: '2026-11-25T10:30:00Z' },
      { memberId: 'andrea', contactId: 'hot-cool', clickedAt: '2026-11-25T08:00:00Z' },
      { memberId: 'm3', contactId: 'hot-cool', clickedAt: '2026-11-25T08:30:00Z' },
    ]
    const list = buildMemberList(contacts, clicks, 'paolo', '2026-11-25', now, 'Hot')
    expect(list.map((item) => item.id)).toEqual(['hot-fresh', 'fresh', 'hot-refresh', 'refresh', 'hot-cool', 'cool', 'cool-refresh'])
    expect(list.find((item) => item.id === 'recent')).toBeUndefined()
    expect(list.find((item) => item.id === 'refresh')?.refresh).toBe(true)
    const exactly = new Date(Date.parse(old) + REFRESH_AFTER_MS)
    expect(buildMemberList([contact('edge', 'Other')], [{ memberId: 'paolo', contactId: 'edge', clickedAt: old }], 'paolo', '2026-11-25', exactly, null)).toHaveLength(1)
    expect(buildMemberList([contact('edge', 'Other')], [{ memberId: 'paolo', contactId: 'edge', clickedAt: old }], 'paolo', '2026-11-25', new Date(exactly.getTime() - 1), null)).toHaveLength(0)
  })
})

describe('hot company of the week', () => {
  const companies: CompanyScore[] = [
    { name: 'Alfa', profiles: 1, clicks: 0 },
    { name: 'Beta', profiles: 1, clicks: 0 },
    { name: 'Gamma', profiles: 1, clicks: 0 },
  ]

  it('uses Monday in the Rome calendar and the fixed epoch', () => {
    expect(weekStartFromIsoDate('2026-11-25')).toBe('2026-11-23')
    expect(HOT_EPOCH).toBe('2026-11-23')
  })

  it('rotates automatically, lets a forced week interrupt, then returns to automatic', () => {
    expect(resolveHotCompany('2026-11-23', companies, [])).toBe('Alfa')
    expect(resolveHotCompany('2026-11-30', companies, [])).toBe('Beta')
    expect(resolveHotCompany('2026-12-07', companies, [])).toBe('Gamma')
    expect(resolveHotCompany('2026-12-14', companies, [])).toBe('Alfa')

    const forced = [{ weekStart: '2026-11-30', company: 'Gamma' }]
    expect(resolveHotCompany('2026-11-30', companies, forced)).toBe('Gamma')
    expect(resolveHotCompany('2026-12-07', companies, forced)).toBe('Beta')
    expect(resolveHotCompany('2026-12-14', companies, forced)).toBe('Alfa')
  })

  it('breaks ties by more profiles, then fewer clicks, then name', () => {
    const tied: CompanyScore[] = [
      { name: 'Beta', profiles: 2, clicks: 5 },
      { name: 'Alfa', profiles: 2, clicks: 1 },
      { name: 'Gamma', profiles: 1, clicks: 0 },
    ]
    expect(resolveHotCompany('2026-11-23', tied, [])).toBe('Alfa')
    expect(companyScores([contact('a', 'Alfa'), contact('b', 'Alfa'), contact('c', 'Beta')], [{ memberId: 'p', contactId: 'a', clickedAt: '2026-11-01T00:00:00Z' }])).toEqual([
      { name: 'Alfa', profiles: 2, clicks: 1 },
      { name: 'Beta', profiles: 1, clicks: 0 },
    ])
  })
})
