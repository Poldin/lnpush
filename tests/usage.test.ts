import { describe, expect, it } from 'vitest'

import { summarizeUsage } from '../lib/usage'

describe('usage summary', () => {
  it('counts today, the last 7 Rome days, and the total per person', () => {
    const now = new Date('2026-11-24T20:00:00Z')
    const summary = summarizeUsage(
      [
        { id: 'paolo', name: 'Paolo' },
        { id: 'andrea', name: 'Andrea' },
      ],
      [
        {
          memberId: 'paolo',
          memberName: 'Paolo',
          contactName: 'Eleni Nikoloudaki',
          company: 'Brusa HyPower',
          clickedAt: '2026-11-24T18:30:00Z',
        },
        {
          memberId: 'paolo',
          memberName: 'Paolo',
          contactName: 'Roland Fromherz',
          company: 'Brusa HyPower',
          clickedAt: '2026-11-20T10:00:00Z',
        },
        {
          memberId: 'andrea',
          memberName: 'Andrea',
          contactName: 'Dave Hutton',
          company: 'CISSOID',
          clickedAt: '2026-11-01T10:00:00Z',
        },
      ],
      'Europe/Rome',
      now,
    )

    expect(summary.members).toEqual([
      { id: 'andrea', name: 'Andrea', today: 0, week: 0, total: 1 },
      { id: 'paolo', name: 'Paolo', today: 1, week: 2, total: 2 },
    ])
    expect(summary.recent[0]).toMatchObject({
      memberName: 'Paolo',
      contactName: 'Eleni Nikoloudaki',
      company: 'Brusa HyPower',
    })
    expect(summary.recent[0]?.whenLabel).toContain('24')
  })
})
