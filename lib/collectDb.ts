import type { SupabaseClient } from '@supabase/supabase-js'

import { freshHits, normalizeCollectorUrl, cleanText, type CollectorHit, type CollectorRunRow } from './collector'

const PAGE = 1000

export function explainDbError(error: { message?: string; code?: string }): string {
  const message = error.message ?? ''
  if (/collector_companies/.test(message)) {
    return 'Apply supabase/collector_companies.sql in the Supabase SQL editor.'
  }
  if (
    /profile_candidates/.test(message) &&
    (error.code === '42501' || /permission denied/i.test(message))
  ) {
    return 'Apply supabase/collector_companies.sql in the Supabase SQL editor.'
  }
  if (error.code === '42P01' || /profile_candidates|collector_runs/.test(message)) {
    return 'Apply supabase/profile_candidates.sql in the Supabase SQL editor.'
  }
  return 'Could not use the collector tables.'
}

async function pageAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await load(from, from + PAGE - 1)
    if (error) throw new Error(explainDbError(error))
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

export async function loadCompanyNames(supabase: SupabaseClient): Promise<string[]> {
  const rows = await pageAll<{ company: string | null }>(async (from, to) =>
    supabase.from('contacts').select('company').eq('active', true).range(from, to),
  )
  return [...new Set(rows.map((row) => cleanText(row.company ?? '')).filter(Boolean))]
}

export async function loadRuns(supabase: SupabaseClient): Promise<CollectorRunRow[]> {
  const rows = await pageAll<{ company: string | null; last_run_at: string | null }>(async (from, to) =>
    supabase.from('collector_runs').select('company, last_run_at').range(from, to),
  )
  return rows.flatMap((row) => {
    const company = cleanText(row.company ?? '')
    return company ? [{ company, lastRunAt: row.last_run_at }] : []
  })
}

export async function loadBlocked(supabase: SupabaseClient): Promise<{ contacts: Set<string>; candidates: Set<string> }> {
  const [contactRows, candidateRows] = await Promise.all([
    pageAll<{ linkedin_url: string | null }>(async (from, to) =>
      supabase.from('contacts').select('linkedin_url').not('linkedin_url', 'is', null).range(from, to),
    ),
    pageAll<{ linkedin_url: string | null }>(async (from, to) =>
      supabase.from('profile_candidates').select('linkedin_url').range(from, to),
    ),
  ])
  return {
    contacts: urlsOf(contactRows),
    candidates: urlsOf(candidateRows),
  }
}

function urlsOf(rows: { linkedin_url: string | null }[]): Set<string> {
  const urls = new Set<string>()
  for (const row of rows) {
    const url = normalizeCollectorUrl(row.linkedin_url ?? '')
    if (url) urls.add(url)
  }
  return urls
}

export async function countCandidates(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('profile_candidates').select('id', { count: 'exact', head: true })
  if (error) throw new Error(explainDbError(error))
  return count ?? 0
}

export async function saveHits(
  supabase: SupabaseClient,
  company: string,
  sourceQuery: string,
  hits: CollectorHit[],
): Promise<number> {
  const fresh = freshHits(hits)
  if (fresh.length > 0) {
    const { error } = await supabase.from('profile_candidates').upsert(
      fresh.map((hit) => ({
        company,
        full_name: hit.full_name,
        headline: hit.headline,
        linkedin_url: hit.linkedin_url,
        snippet: hit.snippet,
        source_query: sourceQuery,
        rank: hit.rank,
        status: 'pending',
      })),
      { onConflict: 'linkedin_url', ignoreDuplicates: true },
    )
    if (error) throw new Error(explainDbError(error))
  }
  const { data: existing, error: readError } = await supabase
    .from('collector_runs')
    .select('found')
    .eq('company', company)
    .maybeSingle()
  if (readError) throw new Error(explainDbError(readError))
  const found = (typeof existing?.found === 'number' ? existing.found : 0) + fresh.length
  const { error: runError } = await supabase.from('collector_runs').upsert(
    { company, last_run_at: new Date().toISOString(), found },
    { onConflict: 'company' },
  )
  if (runError) throw new Error(explainDbError(runError))
  return fresh.length
}
