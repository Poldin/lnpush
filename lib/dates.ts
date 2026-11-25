const MAX_DAYS = 20000

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay)
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay)
  return Math.round((endUtc - startUtc) / 86400000)
}

export function eachDate(from: string, to: string): string[] {
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return []
  const dates: string[] = []
  let cursor = from
  while (cursor <= to) {
    dates.push(cursor)
    if (dates.length > MAX_DAYS) {
      throw new Error('The start date is too far away. Move startDate closer in data/config.json.')
    }
    cursor = addDays(cursor, 1)
  }
  return dates
}

export function todayIso(timeZone: string, now = new Date()): string {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
  } catch {
    throw new Error(`Unrecognized time zone: ${timeZone}. Example: Europe/Rome.`)
  }
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error(`Unrecognized time zone: ${timeZone}. Example: Europe/Rome.`)
  }
  return `${year}-${month}-${day}`
}

export function splitDate(iso: string): { weekday: string; day: string; monthYear: string; full: string } {
  if (!isIsoDate(iso)) {
    throw new Error(`Invalid date: ${iso}. Use YYYY-MM-DD.`)
  }
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(date)
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(date)
  const monthYear = `${monthName} ${year}`
  return {
    weekday,
    day: String(day),
    monthYear,
    full: `${day} ${monthYear}`,
  }
}
