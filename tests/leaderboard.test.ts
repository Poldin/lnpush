import { describe, expect, it } from 'vitest'

import { teamBoards, type TeamClick } from '../lib/leaderboard'

const now = new Date('2026-11-24T20:00:00Z')

function click(partial: Partial<TeamClick> & Pick<TeamClick, 'contactId' | 'clickedAt'>): TeamClick {
  return {
    contactName: partial.contactName ?? partial.contactId,
    company: partial.company ?? 'Acme',
    ...partial,
  }
}

describe('team leaderboards', () => {
  const clicks: TeamClick[] = [
    click({ contactId: 'a', contactName: 'Ada', company: 'Hot', clickedAt: '2026-11-24T10:00:00Z' }),
    click({ contactId: 'a', contactName: 'Ada', company: 'Hot', clickedAt: '2026-11-24T12:00:00Z' }),
    click({ contactId: 'b', contactName: 'Bea', company: 'Hot', clickedAt: '2026-11-20T10:00:00Z' }),
    click({ contactId: 'c', contactName: 'Cio', company: 'Cold', clickedAt: '2026-10-20T10:00:00Z' }),
    click({ contactId: 'd', contactName: 'Dee', company: '', clickedAt: '2026-11-24T11:00:00Z' }),
  ]

  it('counts every member click in the 7-day and 30-day windows', () => {
    const boards = teamBoards(clicks, 'Europe/Rome', now)
    expect(boards.week).toBe(4)
    expect(boards.month).toBe(4)
    expect(boards.people.all.map((row) => row.contactId)).toEqual(['a', 'b', 'c', 'd'])
    expect(boards.people.week[0]).toMatchObject({ contactId: 'a', name: 'Ada', company: 'Hot', clicks: 2 })
    expect(boards.people.month.map((row) => row.contactId)).toEqual(['a', 'b', 'd'])
    expect(boards.companies.week).toEqual([{ company: 'Hot', clicks: 3 }])
    expect(boards.companies.all.map((row) => row.company)).toEqual(['Hot', 'Cold'])
  })

  it('keeps only the top ten and breaks ties by name', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      click({
        contactId: `p${index}`,
        contactName: `Person ${String.fromCharCode(90 - index)}`,
        company: 'Co',
        clickedAt: '2026-11-24T10:00:00Z',
      }),
    )
    const boards = teamBoards(many, 'Europe/Rome', now, 10)
    expect(boards.people.all).toHaveLength(10)
    expect(boards.people.all[0]?.clicks).toBe(1)
  })
})
