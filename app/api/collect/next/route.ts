import { NextResponse } from 'next/server'

import { loadCompanyNames, loadRuns } from '../../../../lib/collectDb'
import { uncollectedCompanies } from '../../../../lib/collector'
import { authorizeCollector } from '../../../../lib/cronAuth'
import { createServiceSupabase } from '../../../../lib/supabase/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const auth = await authorizeCollector(request, false)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createServiceSupabase()
  if (!supabase) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 503 })

  const url = new URL(request.url)
  const all = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true'
  const rawCount = url.searchParams.get('n')
  let count = 10
  if (!all && rawCount !== null) {
    if (!/^\d+$/.test(rawCount) || Number(rawCount) < 1 || Number(rawCount) > 1000) {
      return NextResponse.json({ error: 'n must be an integer from 1 to 1000.' }, { status: 400 })
    }
    count = Number(rawCount)
  }

  try {
    const [companies, runs] = await Promise.all([loadCompanyNames(supabase), loadRuns(supabase)])
    const pending = uncollectedCompanies(companies, runs)
    return NextResponse.json({
      companies: all ? pending : pending.slice(0, count),
      total: companies.length,
      remaining: pending.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the companies.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
