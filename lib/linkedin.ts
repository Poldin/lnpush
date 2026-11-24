export function normalizeLinkedInUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'linkedin.com') return null

  let path = parsed.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2 || parts[0]?.toLowerCase() !== 'in') return null

  const slug = parts
    .slice(1)
    .map((segment) => encodePathSegment(segment))
    .filter(Boolean)
    .join('/')
  if (!slug) return null

  return `https://www.linkedin.com/in/${slug}`
}

function encodePathSegment(segment: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(segment))
  } catch {
    return encodeURIComponent(segment)
  }
}
