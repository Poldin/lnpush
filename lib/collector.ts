export const COLLECTOR_RESULT_TARGET = 60
export const COLLECTOR_PAGE_OFFSETS = [0, 1, 2] as const
export const COLLECTOR_BUDGET_MS = 250_000
export const COLLECTOR_RESERVE_MS = 40_000
export const COLLECTOR_INLINE_RESULTS = 5

export type CollectorHit = {
  full_name: string | null
  headline: string | null
  linkedin_url: string
  snippet: string | null
  rank: number
  already_in_contacts: boolean
  already_candidate: boolean
}

export type SearchResult = {
  title?: string
  url?: string
  description?: string
}

export type IngestItem = {
  title: string
  url: string
  snippet: string
  rank: number | null
}

export type CompanyRunResult = {
  company: string
  queries_used: number
  count: number
  saved: number
  skipped?: boolean
  error?: string
  results?: CollectorHit[]
}

export type RunMode =
  | { type: 'company'; company: string }
  | { type: 'companies'; companies: string[] }
  | { type: 'next'; count: number }

export type ParsedRun = {
  mode: RunMode
  limit: number
  save: boolean
  force: boolean
  includeResults: boolean
}

export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function clipText(value: string, max: number): string | null {
  const text = cleanText(value)
  if (!text) return null
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function normalizeCollectorUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  const host = parsed.hostname.toLowerCase()
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  const inIndex = parts.findIndex((part) => part.toLowerCase() === 'in')
  if (inIndex < 0 || inIndex + 1 >= parts.length) return null
  const slug = canonicalSlug(parts[inIndex + 1] ?? '')
  if (!slug) return null
  return `https://www.linkedin.com/in/${slug}`
}

function canonicalSlug(segment: string): string {
  let decoded = segment
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    decoded = segment
  }
  const lower = decoded.trim().toLowerCase()
  if (!lower || lower === '.' || lower === '..') return ''
  return encodeURIComponent(lower).toLowerCase()
}

export function parseLinkedInTitle(title: string): { fullName: string; headline: string } {
  let text = cleanText(title).slice(0, 300)
  text = text.replace(/\s*(?:\||[-–—])\s*linkedin\s*$/i, '').trim()
  if (!text || /^linkedin$/i.test(text)) return { fullName: '', headline: '' }
  const dash = text.match(/^(.+?)\s+[-–—]\s+(.+)$/)
  if (dash?.[1] && dash[2]) return { fullName: dash[1].trim(), headline: dash[2].trim() }
  const pipe = text.match(/^(.+?)\s+\|\s+(.+)$/)
  if (pipe?.[1] && pipe[2]) return { fullName: pipe[1].trim(), headline: pipe[2].trim() }
  return { fullName: text, headline: '' }
}

export function contactName(fullName: string | null, linkedinUrl: string): string {
  const cleaned = cleanText(fullName ?? '')
  if (cleaned) return cleaned
  const slug = decodeURIComponent(linkedinUrl.split('/in/')[1] ?? '')
  const words = slug.replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim()
  if (!words) return 'Unknown'
  return words.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('en'))
}

export function companySearchQuery(company: string): string {
  return `site:linkedin.com/in "${cleanText(company).replace(/"/g, '')}"`
}

export function braveSearchUrl(query: string, offset: number): string {
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', '20')
  url.searchParams.set('offset', String(offset))
  return url.toString()
}

export function appendProfileHits(
  existing: CollectorHit[],
  page: SearchResult[],
  limit: number,
  contacts: Set<string>,
  candidates: Set<string>,
): CollectorHit[] {
  const hits = [...existing]
  const seen = new Set(hits.map((hit) => hit.linkedin_url))
  for (const result of page) {
    if (hits.length >= limit) break
    const url = normalizeCollectorUrl(result.url ?? '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    const parsed = parseLinkedInTitle(result.title ?? '')
    hits.push({
      full_name: parsed.fullName || null,
      headline: parsed.headline || null,
      linkedin_url: url,
      snippet: clipText(result.description ?? '', 500),
      rank: hits.length + 1,
      already_in_contacts: contacts.has(url),
      already_candidate: candidates.has(url),
    })
  }
  return hits
}

export function freshHits(hits: CollectorHit[]): CollectorHit[] {
  return hits.filter((hit) => !hit.already_in_contacts && !hit.already_candidate)
}

export type CollectorRunRow = { company: string; lastRunAt: string | null }

export function uncollectedCompanies(companies: string[], runs: CollectorRunRow[]): string[] {
  const collected = new Set(runs.filter((run) => run.lastRunAt).map((run) => run.company))
  return [...new Set(companies.map((company) => cleanText(company)).filter(Boolean))]
    .filter((company) => !collected.has(company))
    .sort((left, right) => left.localeCompare(right, 'it'))
}

export function explicitQueue(
  names: string[],
  runs: Map<string, string | null>,
  force: boolean,
): { queue: string[]; skipped: string[] } {
  const queue: string[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  for (const name of names) {
    const company = cleanText(name)
    if (!company || seen.has(company)) continue
    seen.add(company)
    const lastRunAt = runs.get(company)
    if (!force && lastRunAt) skipped.push(company)
    else queue.push(company)
  }
  return { queue, skipped }
}

export function shouldStartCompany(startedAt: number, now: number, budgetMs: number, reserveMs: number): boolean {
  return now - startedAt <= budgetMs - reserveMs
}

export async function runQueue(options: {
  queue: string[]
  startedAt: number
  now: () => number
  budgetMs: number
  reserveMs: number
  save: boolean
  search: (company: string) => Promise<{ queries_used: number; hits: CollectorHit[]; query: string }>
  persist?: (company: string, hits: CollectorHit[], query: string) => Promise<number>
}): Promise<{ results: CompanyRunResult[]; remaining: string[]; ok: boolean; error?: string }> {
  const results: CompanyRunResult[] = []
  for (let index = 0; index < options.queue.length; index += 1) {
    if (!shouldStartCompany(options.startedAt, options.now(), options.budgetMs, options.reserveMs)) {
      return { results, remaining: options.queue.slice(index), ok: true }
    }
    const company = options.queue[index] ?? ''
    try {
      const searched = await options.search(company)
      let saved = 0
      if (options.save) {
        if (!options.persist) throw new Error('Save is unavailable.')
        saved = await options.persist(company, searched.hits, searched.query)
      }
      results.push({
        company,
        queries_used: searched.queries_used,
        count: searched.hits.length,
        saved,
        results: searched.hits,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Collection failed.'
      return { results, remaining: options.queue.slice(index), ok: false, error: message }
    }
  }
  return { results, remaining: [], ok: true }
}

export function presentCompanyResults(rows: CompanyRunResult[], includeResults: boolean): CompanyRunResult[] {
  if (includeResults || rows.length <= COLLECTOR_INLINE_RESULTS) return rows
  return rows.map((row) => {
    const { results: _results, ...rest } = row
    return rest
  })
}

export function parseRunBody(body: unknown): { ok: true; value: ParsedRun } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Expected a JSON object.' }
  const record = body as Record<string, unknown>
  const hasCompany = record.company !== undefined
  const hasCompanies = record.companies !== undefined
  const hasNext = record.next !== undefined
  const modes = [hasCompany, hasCompanies, hasNext].filter(Boolean).length
  if (modes !== 1) return { ok: false, error: 'Send exactly one of company, companies, or next.' }

  let mode: RunMode
  if (hasCompany) {
    if (typeof record.company !== 'string' || !cleanText(record.company)) {
      return { ok: false, error: 'company must be a non-empty string.' }
    }
    mode = { type: 'company', company: cleanText(record.company) }
  } else if (hasCompanies) {
    if (!Array.isArray(record.companies) || record.companies.length === 0 || record.companies.length > 500) {
      return { ok: false, error: 'companies must be an array of 1 to 500 names.' }
    }
    const companies: string[] = []
    for (const item of record.companies) {
      if (typeof item !== 'string' || !cleanText(item)) return { ok: false, error: 'companies must contain only names.' }
      companies.push(cleanText(item))
    }
    mode = { type: 'companies', companies }
  } else {
    if (typeof record.next !== 'number' || !Number.isInteger(record.next) || record.next < 1 || record.next > 500) {
      return { ok: false, error: 'next must be an integer from 1 to 500.' }
    }
    mode = { type: 'next', count: record.next }
  }

  const limit = record.limit === undefined ? COLLECTOR_RESULT_TARGET : record.limit
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > COLLECTOR_RESULT_TARGET) {
    return { ok: false, error: 'limit must be an integer from 1 to 60.' }
  }
  for (const key of ['save', 'force', 'include_results'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      return { ok: false, error: `${key} must be a boolean.` }
    }
  }
  return {
    ok: true,
    value: {
      mode,
      limit,
      save: record.save === true,
      force: record.force === true,
      includeResults: record.include_results === true,
    },
  }
}

export function parseIngestBody(
  body: unknown,
): { ok: true; value: { company: string; sourceQuery: string; dryRun: boolean; results: IngestItem[] } } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'Expected a JSON object.' }
  const record = body as Record<string, unknown>
  if (typeof record.company !== 'string' || !cleanText(record.company) || cleanText(record.company).length > 200) {
    return { ok: false, error: 'company must be a non-empty string.' }
  }
  if (typeof record.source_query !== 'string' || !cleanText(record.source_query) || record.source_query.length > 500) {
    return { ok: false, error: 'source_query must be a non-empty string.' }
  }
  if (record.dry_run !== undefined && typeof record.dry_run !== 'boolean') {
    return { ok: false, error: 'dry_run must be a boolean.' }
  }
  if (!Array.isArray(record.results) || record.results.length > 100) {
    return { ok: false, error: 'results must be an array of at most 100 items.' }
  }
  const results: IngestItem[] = []
  for (const item of record.results) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: 'Each result must be an object.' }
    const row = item as Record<string, unknown>
    results.push({
      title: typeof row.title === 'string' ? row.title : '',
      url: typeof row.url === 'string' ? row.url.slice(0, 2000) : '',
      snippet: typeof row.snippet === 'string' ? row.snippet : '',
      rank: typeof row.rank === 'number' && Number.isInteger(row.rank) && row.rank > 0 && row.rank <= 10_000 ? row.rank : null,
    })
  }
  return {
    ok: true,
    value: {
      company: cleanText(record.company),
      sourceQuery: cleanText(record.source_query),
      dryRun: record.dry_run === true,
      results,
    },
  }
}

export function planIngest(
  results: IngestItem[],
  contacts: Set<string>,
  candidates: Set<string>,
): CollectorHit[] {
  const ordered = results.map((item, index) => ({ item, index }))
  ordered.sort((left, right) => {
    const leftRank = left.item.rank ?? Number.MAX_SAFE_INTEGER
    const rightRank = right.item.rank ?? Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.index - right.index
  })
  const hits: CollectorHit[] = []
  const seen = new Set<string>()
  let nextRank = 1
  for (const { item } of ordered) {
    const url = normalizeCollectorUrl(item.url)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const rank = item.rank ?? nextRank
    nextRank = Math.max(nextRank, rank) + 1
    const parsed = parseLinkedInTitle(item.title)
    hits.push({
      full_name: parsed.fullName || null,
      headline: parsed.headline || null,
      linkedin_url: url,
      snippet: clipText(item.snippet, 500),
      rank,
      already_in_contacts: contacts.has(url),
      already_candidate: candidates.has(url),
    })
  }
  return hits
}
