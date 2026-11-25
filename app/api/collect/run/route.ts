import { NextResponse } from 'next/server'

import { braveConfigured, createBraveSearcher } from '../../../../lib/braveSearch'
import {
  COLLECTOR_BUDGET_MS,
  COLLECTOR_RESERVE_MS,
  explicitQueue,
  parseRunBody,
  presentCompanyResults,
  runQueue,
  uncollectedCompanies,
  type CompanyRunResult,
} from '../../../../lib/collector'
import { countCandidates, loadBlocked, loadCompanyNames, loadRuns, saveHits } from '../../../../lib/collectDb'
import { authorizeCollector } from '../../../../lib/cronAuth'
import { createServiceSupabase } from '../../../../lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await authorizeCollector(request, true)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!braveConfigured()) return NextResponse.json({ error: 'BRAVE_SEARCH_API_KEY is not configured.' }, { status: 503 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 })
  }
  const parsed = parseRunBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createServiceSupabase()
  if (!supabase) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 503 })
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim() ?? ''

  try {
    const [companies, runs, blocked] = await Promise.all([
      loadCompanyNames(supabase),
      loadRuns(supabase),
      loadBlocked(supabase),
    ])
    const runMap = new Map(runs.map((run) => [run.company, run.lastRunAt]))
    const selected =
      parsed.value.mode.type === 'next'
        ? { queue: uncollectedCompanies(companies, runs).slice(0, parsed.value.mode.count), skipped: [] as string[] }
        : explicitQueue(
            parsed.value.mode.type === 'company' ? [parsed.value.mode.company] : parsed.value.mode.companies,
            runMap,
            parsed.value.force,
          )
    const search = createBraveSearcher(apiKey)
    const startedAt = Date.now()
    const chunk = await runQueue({
      queue: selected.queue,
      startedAt,
      now: () => Date.now(),
      budgetMs: COLLECTOR_BUDGET_MS,
      reserveMs: COLLECTOR_RESERVE_MS,
      save: parsed.value.save,
      search: (company) => search(company, parsed.value.limit, blocked.contacts, blocked.candidates),
      persist: (company, hits, query) => saveHits(supabase, company, query, hits),
    })
    const skippedResults: CompanyRunResult[] = selected.skipped.map((company) => ({
      company,
      queries_used: 0,
      count: 0,
      saved: 0,
      skipped: true,
    }))
    const [latestRuns, candidates] = await Promise.all([loadRuns(supabase), countCandidates(supabase)])
    const collected = new Set(latestRuns.filter((run) => run.lastRunAt).map((run) => run.company))
    return NextResponse.json({
      ok: chunk.ok,
      save: parsed.value.save,
      error: chunk.error,
      results: presentCompanyResults([...skippedResults, ...chunk.results], parsed.value.includeResults),
      remaining: chunk.remaining,
      progress: {
        done: companies.filter((company) => collected.has(company)).length,
        total: companies.length,
        candidates,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Collection failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
