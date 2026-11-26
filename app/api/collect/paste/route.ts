import { NextResponse } from 'next/server'

import { savePastedProfiles } from '../../../../lib/collectCompanies'
import { requireTeamMember } from '../member'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const member = await requireTeamMember()
  if ('response' in member) return member.response

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
  if (typeof record.companyId !== 'string' || !UUID.test(record.companyId)) {
    return NextResponse.json({ error: 'companyId must be a uuid.' }, { status: 400 })
  }
  if (record.html !== undefined && typeof record.html !== 'string') {
    return NextResponse.json({ error: 'html must be a string.' }, { status: 400 })
  }
  if (record.text !== undefined && typeof record.text !== 'string') {
    return NextResponse.json({ error: 'text must be a string.' }, { status: 400 })
  }
  if (record.sourceQuery !== undefined && typeof record.sourceQuery !== 'string') {
    return NextResponse.json({ error: 'sourceQuery must be a string.' }, { status: 400 })
  }
  const html = typeof record.html === 'string' ? record.html : ''
  const text = typeof record.text === 'string' ? record.text : ''
  const sourceQuery = typeof record.sourceQuery === 'string' ? record.sourceQuery : ''
  if (html.length > 1_500_000 || text.length > 500_000 || sourceQuery.length > 2_000) {
    return NextResponse.json({ error: 'Paste is too large.' }, { status: 400 })
  }

  const saved = await savePastedProfiles(member.supabase, record.companyId, html, text)
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status })
  return NextResponse.json({
    ok: true,
    added: saved.added,
    skipped: saved.skipped,
    empty: saved.empty,
    profiles: saved.profiles,
  })
}
