import { addDays, todayIso } from './dates'
import { weekStartFromIsoDate } from './listOrder'

export type ChartRange = 'week' | 'month' | 'all'

export type ChartBar = {
  key: string
  label: string
  count: number
}

export function openingChart(clickedAt: string[], range: ChartRange, timeZone: string, now = new Date()): ChartBar[] {
  const today = todayIso(timeZone, now)
  const days = clickedAt.map((value) => romeDay(value, timeZone)).filter((day): day is string => Boolean(day))
  if (range === 'all') return weekBars(days, today)
  const length = range === 'week' ? 7 : 30
  const bars = Array.from({ length }, (_, index) => {
    const date = addDays(today, index - (length - 1))
    return { key: date, label: date.slice(8), count: 0 }
  })
  const index = new Map(bars.map((bar, position) => [bar.key, position]))
  for (const day of days) {
    const position = index.get(day)
    if (position !== undefined) bars[position].count += 1
  }
  return bars
}

function weekBars(days: string[], today: string): ChartBar[] {
  if (days.length === 0) return []
  const first = days.reduce((left, right) => (left < right ? left : right))
  const bars: ChartBar[] = []
  let cursor = weekStartFromIsoDate(first)
  const end = weekStartFromIsoDate(today)
  while (cursor <= end && bars.length < 520) {
    bars.push({ key: cursor, label: cursor.slice(5), count: 0 })
    cursor = addDays(cursor, 7)
  }
  for (const day of days) {
    const week = weekStartFromIsoDate(day)
    const bar = bars.find((item) => item.key === week)
    if (bar && day <= today) bar.count += 1
  }
  return bars
}

function romeDay(value: string, timeZone: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  try {
    return todayIso(timeZone, date)
  } catch {
    return null
  }
}
