import { describe, expect, it } from 'vitest'

import { parseTab, withTab } from '../lib/tabs'
import { applyOpening, ownCounts, ownOpenings } from '../lib/usage'

const clicks = [
  {
    memberId: 'paolo',
    contactId: 'eleni',
        contactName: 'Eleni Nikoloudaki',
        role: 'Head of HW',
        company: 'Brusa HyPower',
    clickedAt: '2026-11-24T18:30:00Z',
  },
  {
    memberId: 'andrea',
    contactId: 'dave',
        contactName: 'Dave Hutton',
        role: 'CEO',
        company: 'CISSOID',
    clickedAt: '2026-11-24T19:00:00Z',
  },
  {
    memberId: 'paolo',
    contactId: 'roland',
        contactName: 'Roland Fromherz',
        role: 'Head of Software',
        company: 'Brusa HyPower',
    clickedAt: '2026-11-20T10:00:00Z',
  },
]

describe('own openings', () => {
  it('keeps only that person, newest first, in Rome time', () => {
    const openings = ownOpenings(clicks, 'paolo', 'Europe/Rome')
    expect(ownCounts(clicks, 'paolo', 'Europe/Rome', new Date('2026-11-24T20:00:00Z'))).toEqual({
      today: 1,
      week: 2,
      total: 2,
    })
    expect(openings.map((item) => item.contactName)).toEqual(['Eleni Nikoloudaki', 'Roland Fromherz'])
    expect(openings[0]?.whenLabel).toContain('24')
    expect(openings[0]?.company).toBe('Brusa HyPower')
  })

  it('does not count the same live opening twice', () => {
    const now = new Date('2026-11-24T20:00:00Z')
    const first = applyOpening(
      { recent: [], counts: { today: 0, week: 0, total: 0 } },
      {
        contactId: 'eleni',
        contactName: 'Eleni Nikoloudaki',
        role: 'Head',
        company: 'Brusa',
        clickedAt: '2026-11-24T18:30:02Z',
        whenLabel: '24 nov, 19:30',
      },
      'Europe/Rome',
      now,
    )
    const merged = applyOpening(
      first,
      {
        contactId: 'eleni',
        contactName: 'Eleni Nikoloudaki',
        role: 'Head',
        company: 'Brusa',
        clickedAt: '2026-11-24T18:30:03Z',
        whenLabel: '24 nov, 19:30',
      },
      'Europe/Rome',
      now,
    )
    expect(merged.recent).toHaveLength(1)
    expect(merged.counts).toEqual({ today: 1, week: 1, total: 1 })
  })
})

describe('tab query', () => {
  it('defaults to elenco and keeps a chosen tab on the next URL', () => {
    expect(parseTab(null)).toBe('elenco')
    expect(parseTab('altro')).toBe('elenco')
    expect(parseTab('utilizzo')).toBe('utilizzo')
    expect(withTab('/', 'utilizzo')).toBe('/?tab=utilizzo')
    expect(withTab('/login?errore=link', 'elenco')).toBe('/login?errore=link&tab=elenco')
    expect(withTab('/', null)).toBe('/')
  })
})
