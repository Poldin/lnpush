import { NextResponse } from 'next/server'

import { braveConfigured, createBraveSearcher } from '../../../../lib/braveSearch'
import { COLLECTOR_RESULT_TARGET } from '../../../../lib/collector'
import { loadBlocked, saveHits } from '../../../../lib/collectDb'
import { authorizeCollector } from '../../../../lib/cronAuth'
import { createServiceSupabase } from '../../../../lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const auth = await authorizeCollector(request, false)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!braveConfigured()) return NextResponse.json({ error: 'BRAVE_SEARCH_API_KEY is not configured.' }, { status: 503 })

  const url = new URL(request.url)
  const company = (url.searchParams.get('company') ?? '').replace(/\s+/g, ' ').trim()
  if (!company) return NextResponse.json({ error: 'company is required.' }, { status: 400 })
  const rawLimit = url.searchParams.get('limit')
  let limit = COLLECTOR_RESULT_TARGET
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > COLLECTOR_RESULT_TARGET) {
      return NextResponse.json({ error: 'limit must be an integer from 1 to 60.' }, { status: 400 })
    }
    limit = Number(rawLimit)
  }
  const save = url.searchParams.get('save') === 'true'

  const supabase = createServiceSupabase()
  if (!supabase) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 503 })
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim() ?? ''

  try {
    const blocked = await loadBlocked(supabase)
    const searched = await createBraveSearcher(apiKey)(company, limit, blocked.contacts, blocked.candidates)
    const saved = save ? await saveHits(supabase, company, searched.query, searched.hits) : 0
    return NextResponse.json({
      company,
      queries_used: searched.queries_used,
      count: searched.hits.length,
      saved,
      results: searched.hits,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preview failed.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
