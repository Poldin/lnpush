import type { SupabaseClient } from '@supabase/supabase-js'

import { cleanText } from './collector'
import { countCandidates, explainDbError, loadCompanyNames, loadRuns } from './collectDb'
import type { ReviewCandidate, ReviewProgress } from './review'

const PAGE = 1000

export async function loadReviewQueue(
  supabase: SupabaseClient,
): Promise<{ ok: true; pending: ReviewCandidate[]; progress: ReviewProgress } | { ok: false; error: string }> {
  try {
    const pending: ReviewCandidate[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('profile_candidates')
        .select('id, company, full_name, headline, linkedin_url, snippet, rank')
        .eq('status', 'pending')
        .order('company')
        .order('rank')
        .range(from, from + PAGE - 1)
      if (error) return { ok: false, error: explainDbError(error) }
      for (const row of data ?? []) {
        if (!row.id || !row.linkedin_url) continue
        pending.push({
          id: row.id,
          company: cleanText(row.company ?? ''),
          fullName: cleanText(row.full_name ?? ''),
          headline: cleanText(row.headline ?? ''),
          linkedinUrl: row.linkedin_url,
          snippet: cleanText(row.snippet ?? ''),
          rank: typeof row.rank === 'number' ? row.rank : null,
        })
      }
      if ((data ?? []).length < PAGE) break
    }
    const [companies, runs, candidates] = await Promise.all([
      loadCompanyNames(supabase),
      loadRuns(supabase),
      countCandidates(supabase),
    ])
    const collected = new Set(runs.filter((run) => run.lastRunAt).map((run) => run.company))
    return {
      ok: true,
      pending,
      progress: {
        done: companies.filter((company) => collected.has(company)).length,
        total: companies.length,
        candidates,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read candidates.' }
  }
}
