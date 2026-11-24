import { describe, expect, it } from 'vitest'

import { mergeOpening, ownOpenings } from '../lib/usage'

describe('own openings', () => {
  it('keeps only that person, newest first, in Rome time', () => {
    const openings = ownOpenings(
      [
        {
          memberId: 'paolo',
          contactId: 'eleni',
          contactName: 'Eleni Nikoloudaki',
          company: 'Brusa HyPower',
          clickedAt: '2026-11-24T18:30:00Z',
        },
        {
          memberId: 'andrea',
          contactId: 'dave',
          contactName: 'Dave Hutton',
          company: 'CISSOID',
          clickedAt: '2026-11-24T19:00:00Z',
        },
        {
          memberId: 'paolo',
          contactId: 'roland',
          contactName: 'Roland Fromherz',
          company: 'Brusa HyPower',
          clickedAt: '2026-11-20T10:00:00Z',
        },
      ],
      'paolo',
      'Europe/Rome',
    )

    expect(openings.map((item) => item.contactName)).toEqual(['Eleni Nikoloudaki', 'Roland Fromherz'])
    expect(openings[0]?.whenLabel).toContain('24')
    expect(openings[0]?.company).toBe('Brusa HyPower')
  })

  it('replaces the optimistic row when the same opening arrives live', () => {
    const optimistic = ownOpenings(
      [
        {
          memberId: 'paolo',
          contactId: 'eleni',
          contactName: 'Eleni Nikoloudaki',
          company: 'Brusa',
          clickedAt: '2026-11-24T18:30:02Z',
        },
      ],
      'paolo',
      'Europe/Rome',
    )
    const merged = mergeOpening(optimistic, {
      contactId: 'eleni',
      contactName: 'Eleni Nikoloudaki',
      company: 'Brusa',
      clickedAt: '2026-11-24T18:30:03Z',
      whenLabel: '24 nov, 19:30',
    })
    expect(merged).toHaveLength(1)
    expect(merged[0]?.clickedAt).toBe('2026-11-24T18:30:03Z')
  })
})
