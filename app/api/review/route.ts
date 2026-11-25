import { NextResponse } from 'next/server'

import { isCollectorAdmin } from '../../../lib/admin'
import { cleanText, contactName } from '../../../lib/collector'
import { loadReviewQueue } from '../../../lib/reviewLoad'
import { createServerSupabase } from '../../../lib/supabase/server'
import { loadActiveTeam, memberForUser } from '../../../lib/supabase/team'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireAdmin() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  const team = await loadActiveTeam(supabase)
  const member = memberForUser(team, data.user)
  if (!member || !isCollectorAdmin(member, data.user)) {
    return { response: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  }
  return { supabase, userId: data.user.id }
}

export async function GET() {
  const admin = await requireAdmin()
  if ('response' in admin) return admin.response
  const loaded = await loadReviewQueue(admin.supabase)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 })
  return NextResponse.json({ pending: loaded.pending, progress: loaded.progress })
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if ('response' in admin) return admin.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected a JSON object.' }, { status: 400 })
  }
  const record = body as Record<string, unknown>
  if (record.action !== 'approve' && record.action !== 'reject') {
    return NextResponse.json({ error: 'action must be approve or reject.' }, { status: 400 })
  }
  const hasIds = record.ids !== undefined
  const hasCompany = record.company !== undefined
  if (hasIds === hasCompany) return NextResponse.json({ error: 'Send ids or company, not both.' }, { status: 400 })

  let query = admin.supabase
    .from('profile_candidates')
    .select('id, company, full_name, headline, linkedin_url')
    .eq('status', 'pending')
  if (hasIds) {
    if (!Array.isArray(record.ids) || record.ids.length === 0 || record.ids.length > 500) {
      return NextResponse.json({ error: 'ids must be an array of 1 to 500 ids.' }, { status: 400 })
    }
    if (!record.ids.every((id) => typeof id === 'string' && UUID.test(id))) {
      return NextResponse.json({ error: 'ids must be uuids.' }, { status: 400 })
    }
    query = query.in('id', record.ids)
  } else {
    const company = typeof record.company === 'string' ? cleanText(record.company) : ''
    if (!company) return NextResponse.json({ error: 'company must be a non-empty string.' }, { status: 400 })
    query = query.eq('company', company)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Could not read the candidates.' }, { status: 500 })

  const updated: string[] = []
  for (const row of data ?? []) {
    if (!row.id || !row.linkedin_url) continue
    if (record.action === 'approve') {
      const { error: insertError } = await admin.supabase.from('contacts').insert({
        company: cleanText(row.company ?? ''),
        full_name: contactName(row.full_name, row.linkedin_url),
        role: cleanText(row.headline ?? '') || null,
        linkedin_url: row.linkedin_url,
        active: true,
      })
      if (insertError && insertError.code !== '23505') {
        return NextResponse.json({ error: 'Could not add the contact.', ids: updated }, { status: 500 })
      }
    }
    const { data: marked, error: updateError } = await admin.supabase
      .from('profile_candidates')
      .update({
        status: record.action === 'approve' ? 'approved' : 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: admin.userId,
      })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
    if (updateError) return NextResponse.json({ error: 'Could not update the candidate.', ids: updated }, { status: 500 })
    if ((marked ?? []).length > 0) updated.push(row.id)
  }
  return NextResponse.json({ ok: true, ids: updated })
}
