export function assertPattern(pattern: string, label: string): void {
  if (!pattern.trim()) return
  try {
    new RegExp(pattern, 'i')
  } catch {
    throw new Error(`${label} is not a valid regular expression.`)
  }
}

export function matchesGroup(group: string, pattern: string): boolean {
  if (!pattern.trim()) return false
  return new RegExp(pattern, 'i').test(group)
}

export function suggestAction(group: string, pattern: string): 'Segui' | 'Collegati' {
  return matchesGroup(group, pattern) ? 'Segui' : 'Collegati'
}

export function contactIsTechnical(group: string, tag: string, pattern: string): boolean {
  const source = tag.trim() ? tag : group
  return matchesGroup(source, pattern)
}
