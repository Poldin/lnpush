import { cleanText, clipText, normalizeCollectorUrl, parseLinkedInTitle } from './collector'

export type ParsedProfile = {
  full_name: string | null
  headline: string | null
  linkedin_url: string
  snippet: string | null
}

export type PasteParse = {
  profiles: ParsedProfile[]
  duplicates: number
}

const PROFILE_URL = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s<>"'\\)\]]+/gi

export function parseGoogleLinkedInPaste(input: { html?: string; text?: string }): PasteParse {
  const html = typeof input.html === 'string' ? input.html : ''
  const text = typeof input.text === 'string' ? input.text : ''
  if (html.trim()) {
    const fromHtml = dedupe(parseHtml(html))
    if (fromHtml.profiles.length > 0) return fromHtml
  }
  if (text.trim()) return dedupe(parsePlain(text))
  return { profiles: [], duplicates: 0 }
}

function parseHtml(html: string): ParsedProfile[] {
  const cleaned = stripNoise(html)
  const profiles: ParsedProfile[] = []
  const seen = new Set<string>()
  for (const anchor of readAnchors(cleaned)) {
    const profile = profileFromAnchor(anchor)
    if (!profile || seen.has(profile.linkedin_url)) {
      if (profile && seen.has(profile.linkedin_url)) profiles.push(profile)
      continue
    }
    seen.add(profile.linkedin_url)
    profiles.push(profile)
  }
  for (const url of urlsInText(textOf(cleaned))) {
    if (seen.has(url)) continue
    seen.add(url)
    profiles.push({ full_name: null, headline: null, linkedin_url: url, snippet: null })
  }
  return profiles
}

function parsePlain(text: string): ParsedProfile[] {
  const lines = text.split(/\r?\n/)
  const profiles: ParsedProfile[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const urls = urlsInText(lines[index] ?? '')
    if (urls.length === 0) continue
    const title = previousPlainTitle(lines, index)
    const parsed = parseLinkedInTitle(title)
    const snippet = cleanSnippet(nextPlainLine(lines, index), title)
    for (const url of urls) {
      profiles.push({
        full_name: clipText(parsed.fullName, 200),
        headline: clipText(parsed.headline, 300),
        linkedin_url: url,
        snippet,
      })
    }
  }
  return profiles
}

type Anchor = { href: string; inner: string; after: string }

function profileFromAnchor(anchor: Anchor): ParsedProfile | null {
  const url = linkedInProfileFromHref(anchor.href)
  if (!url) return null
  const title = titleFromAnchor(anchor.inner)
  const parsed = parseLinkedInTitle(title)
  const snippet = cleanSnippet(`${snippetInside(anchor.inner)}\n${textOf(anchor.after)}`, title)
  return {
    full_name: clipText(parsed.fullName, 200),
    headline: clipText(parsed.headline, 300),
    linkedin_url: url,
    snippet,
  }
}

function titleFromAnchor(inner: string): string {
  const heading = cleanText(firstHeading(inner))
  if (heading && !/^linkedin$/i.test(heading)) return heading
  const line = textOf(inner)
    .split('\n')
    .map((item) => cleanText(item))
    .find((item) => item && !/^https?:\/\//i.test(item) && !/^linkedin$/i.test(item))
  return line ?? ''
}

function firstHeading(html: string): string {
  const match = /<h3\b[^>]*>([\s\S]*?)<\/h3>/i.exec(html)
  return match ? textOf(match[1] ?? '') : ''
}

function snippetInside(inner: string): string {
  return textOf(inner.replace(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi, ' '))
}

function previousPlainTitle(lines: string[], index: number): string {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = cleanText(lines[cursor] ?? '')
    if (!line) continue
    if (isUrlLike(line) || urlsInText(line).length > 0) return ''
    return line
  }
  return ''
}

function nextPlainLine(lines: string[], index: number): string {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = cleanText(lines[cursor] ?? '')
    if (!line) continue
    if (isUrlLike(line) || urlsInText(line).length > 0) return ''
    return line
  }
  return ''
}

function isUrlLike(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^(?:[a-z]{2,3}\.)?linkedin\.com\//i.test(value)
}

function cleanSnippet(value: string, title: string): string | null {
  const titleClean = cleanText(title)
  const parts = value
    .split('\n')
    .map((line) => cleanText(line))
    .filter((line) => {
      if (!line) return false
      if (titleClean && (line === titleClean || line === cleanText(titleClean.replace(/\s*(?:\||[-–—])\s*linkedin\s*$/i, '')))) return false
      if (/^https?:\/\//i.test(line)) return false
      if (/linkedin\.com/i.test(line) && /[›>]/.test(line)) return false
      return true
    })
  return clipText(parts.join(' '), 500)
}

function dedupe(profiles: ParsedProfile[]): PasteParse {
  const order: string[] = []
  const map = new Map<string, ParsedProfile>()
  let duplicates = 0
  for (const profile of profiles) {
    const existing = map.get(profile.linkedin_url)
    if (!existing) {
      map.set(profile.linkedin_url, profile)
      order.push(profile.linkedin_url)
      continue
    }
    duplicates += 1
    if (!existing.full_name && profile.full_name) existing.full_name = profile.full_name
    if (!existing.headline && profile.headline) existing.headline = profile.headline
    if (!existing.snippet && profile.snippet) existing.snippet = profile.snippet
  }
  return { profiles: order.map((url) => map.get(url)!), duplicates }
}

export function linkedInProfileFromHref(rawHref: string): string | null {
  const href = decodeHtmlEntities(rawHref).trim()
  if (!href || href.startsWith('#')) return null
  const unwrapped = unwrapGoogleRedirect(href)
  if (!unwrapped) return null
  return profileUrlFromAbsolute(unwrapped)
}

function unwrapGoogleRedirect(href: string): string | null {
  const absolute = absolutize(href)
  if (!absolute) return null
  let parsed: URL
  try {
    parsed = new URL(absolute)
  } catch {
    return null
  }
  if (isGoogleRedirect(parsed)) {
    const target = (parsed.searchParams.get('q') || parsed.searchParams.get('url') || '').trim()
    if (!target) return null
    let inner: URL
    try {
      inner = new URL(target)
    } catch {
      return null
    }
    if (isIgnoredGoogle(inner)) return null
    return inner.toString()
  }
  if (isIgnoredGoogle(parsed)) return null
  return parsed.toString()
}

function profileUrlFromAbsolute(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!linkedInHostOk(parsed.hostname)) return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts[0]?.toLowerCase() !== 'in') return null
  return normalizeCollectorUrl(parsed.toString())
}

function linkedInHostOk(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return host === 'linkedin.com' || /^[a-z]{2,3}\.linkedin\.com$/.test(host)
}

function isGoogleRedirect(parsed: URL): boolean {
  return isGoogleSearchHost(parsed.hostname) && (parsed.pathname === '/url' || parsed.pathname === '/url/')
}

function isIgnoredGoogle(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com')) return true
  if (host === 'translate.google' || host.startsWith('translate.google.') || host.includes('.translate.google.')) return true
  if (host === 'webcache.googleusercontent.com') return true
  return isGoogleSearchHost(parsed.hostname)
}

function isGoogleSearchHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '')
  return host === 'google.com' || /^google\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})$/.test(host)
}

function absolutize(href: string): string | null {
  const value = href.trim()
  if (!value) return null
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `https://www.google.com${value}`
  if (/^https?:\/\//i.test(value)) return value
  if (/^(?:[a-z]{2,3}\.)?linkedin\.com\//i.test(value)) return `https://${value}`
  return null
}

function urlsInText(text: string): string[] {
  const urls: string[] = []
  const re = new RegExp(PROFILE_URL.source, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const raw = trimUrlTail(decodeHtmlEntities(match[0] ?? ''))
    const url = profileUrlFromAbsolute(raw)
    if (url) urls.push(url)
  }
  return urls
}

function trimUrlTail(url: string): string {
  return url.replace(/[),.;:]+$/g, '')
}

function readAnchors(html: string): Anchor[] {
  const anchors: Anchor[] = []
  const opener = /<a\b/gi
  let match: RegExpExecArray | null
  while ((match = opener.exec(html))) {
    const start = match.index
    const openEnd = html.indexOf('>', start)
    if (openEnd < 0) break
    const openTag = html.slice(start, openEnd + 1)
    if (openTag.endsWith('/>')) {
      opener.lastIndex = openEnd + 1
      continue
    }
    const close = findCloseAnchor(html, openEnd + 1)
    anchors.push({
      href: readHref(openTag),
      inner: html.slice(openEnd + 1, close.start),
      after: afterSlice(html, close.end),
    })
    opener.lastIndex = close.end
  }
  return anchors
}

function findCloseAnchor(html: string, from: number): { start: number; end: number } {
  const tokens = /<a\b|<\/a\s*>/gi
  tokens.lastIndex = from
  let depth = 1
  let match: RegExpExecArray | null
  while ((match = tokens.exec(html))) {
    if (match[0].startsWith('</') || match[0].startsWith('<\\/')) depth -= 1
    else depth += 1
    if (depth === 0) return { start: match.index, end: match.index + match[0].length }
  }
  return { start: html.length, end: html.length }
}

function afterSlice(html: string, from: number): string {
  const window = html.slice(from, from + 1200)
  const next = window.search(/<a\b/i)
  return next < 0 ? window : window.slice(0, next)
}

function readHref(openTag: string): string {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(openTag)
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? '')
}

function stripNoise(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
}

function textOf(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d|tr|span)>/gi, '\n')
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity
      try {
        return String.fromCodePoint(code)
      } catch {
        return entity
      }
    }
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    return named[body.toLowerCase()] ?? entity
  })
}
