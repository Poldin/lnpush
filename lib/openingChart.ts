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

export function smoothCurve(counts: number[], width = 320, height = 72): { line: string; area: string } | null {
  if (counts.length === 0) return null
  const max = Math.max(1, ...counts)
  const pad = 8
  const points = counts.map((count, index) => ({
    x: counts.length === 1 ? width / 2 : (index / (counts.length - 1)) * width,
    y: pad + (1 - count / max) * (height - pad * 2),
  }))
  const line = smoothPath(points, width)
  const last = points[points.length - 1]
  const first = points[0]
  return { line, area: `${line} L ${last.x} ${height} L ${first.x} ${height} Z` }
}

function smoothPath(points: { x: number; y: number }[], width: number): string {
  if (points.length === 1) return `M 0 ${points[0].y} L ${width} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const after = points[index + 2] ?? next
    const control1x = current.x + (next.x - previous.x) / 6
    const control1y = current.y + (next.y - previous.y) / 6
    const control2x = next.x - (after.x - current.x) / 6
    const control2y = next.y - (after.y - current.y) / 6
    path += ` C ${control1x} ${control1y} ${control2x} ${control2y} ${next.x} ${next.y}`
  }
  return path
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
