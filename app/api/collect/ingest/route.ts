import { NextResponse } from 'next/server'

import { parseIngestBody, planIngest } from '../../../../lib/collector'
import { loadBlocked, saveHits } from '../../../../lib/collectDb'
import { authorizeCollector } from '../../../../lib/cronAuth'
import { createServiceSupabase } from '../../../../lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const auth = await authorizeCollector(request, false)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 })
  }
  const parsed = parseIngestBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const supabase = createServiceSupabase()
  if (!supabase) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 503 })

  try {
    const blocked = await loadBlocked(supabase)
    const hits = planIngest(parsed.value.results, blocked.contacts, blocked.candidates)
    const saved = parsed.value.dryRun ? 0 : await saveHits(supabase, parsed.value.company, parsed.value.sourceQuery, hits)
    return NextResponse.json({
      ok: true,
      company: parsed.value.company,
      source_query: parsed.value.sourceQuery,
      dry_run: parsed.value.dryRun,
      count: hits.length,
      saved: parsed.value.dryRun ? 0 : saved,
      results: hits,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not store the candidates.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
