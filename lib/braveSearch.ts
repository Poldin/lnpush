import {
  COLLECTOR_PAGE_OFFSETS,
  appendProfileHits,
  braveSearchUrl,
  companySearchQuery,
  type CollectorHit,
  type SearchResult,
} from './collector'

export function braveConfigured(): boolean {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim())
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type BraveResponse = { web?: { results?: SearchResult[] } }

export function createBraveSearcher(
  apiKey: string,
  sleep: (ms: number) => Promise<void> = delay,
  fetchImpl: typeof fetch = fetch,
) {
  let started = false
  return async function searchCompany(
    company: string,
    limit: number,
    contacts: Set<string>,
    candidates: Set<string>,
  ): Promise<{ query: string; queries_used: number; hits: CollectorHit[] }> {
    const query = companySearchQuery(company)
    let hits: CollectorHit[] = []
    let queriesUsed = 0
    for (const offset of COLLECTOR_PAGE_OFFSETS) {
      if (hits.length >= limit) break
      const page = await bravePage(apiKey, query, offset, () => {
        const wait = started
        started = true
        return wait
      }, sleep, fetchImpl)
      queriesUsed += page.calls
      hits = appendProfileHits(hits, page.results, limit, contacts, candidates)
      if (page.results.length === 0) break
    }
    return { query, queries_used: queriesUsed, hits }
  }
}

async function bravePage(
  apiKey: string,
  query: string,
  offset: number,
  pace: () => boolean,
  sleep: (ms: number) => Promise<void>,
  fetchImpl: typeof fetch,
): Promise<{ results: SearchResult[]; calls: number }> {
  let calls = 0
  const load = async () => {
    if (pace()) await sleep(1000)
    calls += 1
    const response = await fetchImpl(braveSearchUrl(query, offset), {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal: AbortSignal.timeout(20_000),
    })
    return response
  }
  let response = await load()
  if (response.status === 429) response = await load()
  if (response.status === 401 || response.status === 403) throw new Error('Brave Search rejected the API key.')
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}.`)
  const body = (await response.json().catch(() => null)) as BraveResponse | null
  const results = body?.web?.results
  return { results: Array.isArray(results) ? results : [], calls }
}
