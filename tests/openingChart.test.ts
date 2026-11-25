import { describe, expect, it } from 'vitest'

import { openingChart } from '../lib/openingChart'

const now = new Date('2026-11-24T20:00:00Z')

describe('opening chart', () => {
  it('counts the last 7 Rome days, including a click after midnight there', () => {
    const bars = openingChart(
      ['2026-11-24T18:00:00Z', '2026-11-23T23:30:00Z', '2026-11-01T10:00:00Z'],
      'week',
      'Europe/Rome',
      now,
    )
    expect(bars).toHaveLength(7)
    expect(bars[6]).toMatchObject({ key: '2026-11-24', count: 2 })
    expect(bars[5]).toMatchObject({ key: '2026-11-23', count: 0 })
    expect(bars.reduce((sum, bar) => sum + bar.count, 0)).toBe(2)
  })

  it('uses one bar for each of the last 30 days', () => {
    const bars = openingChart(['2026-10-26T10:00:00Z', '2026-11-24T10:00:00Z'], 'month', 'Europe/Rome', now)
    expect(bars).toHaveLength(30)
    expect(bars[0]?.key).toBe('2026-10-26')
    expect(bars[0]?.count).toBe(1)
    expect(bars.at(-1)?.count).toBe(1)
  })

  it('groups all openings by Rome week from the first click', () => {
    const bars = openingChart(['2026-11-10T10:00:00Z', '2026-11-12T10:00:00Z', '2026-11-24T10:00:00Z'], 'all', 'Europe/Rome', now)
    expect(bars.map((bar) => bar.key)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23'])
    expect(bars.map((bar) => bar.count)).toEqual([2, 0, 1])
  })

  it('stays empty when there are no openings', () => {
    expect(openingChart([], 'week', 'Europe/Rome', now).every((bar) => bar.count === 0)).toBe(true)
    expect(openingChart([], 'all', 'Europe/Rome', now)).toEqual([])
    expect(openingChart(['not-a-date'], 'week', 'Europe/Rome', now).every((bar) => bar.count === 0)).toBe(true)
  })
})
