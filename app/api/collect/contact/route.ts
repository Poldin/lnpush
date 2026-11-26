import { NextResponse } from 'next/server'

import { deleteCollectedContact } from '../../../../lib/collectCompanies'
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
  if (record.action !== 'delete') {
    return NextResponse.json({ error: 'action must be delete.' }, { status: 400 })
  }
  if (typeof record.id !== 'string' || !UUID.test(record.id)) {
    return NextResponse.json({ error: 'id must be a uuid.' }, { status: 400 })
  }

  const deleted = await deleteCollectedContact(member.supabase, record.id)
  if (!deleted.ok) return NextResponse.json({ error: deleted.error }, { status: deleted.status })
  return NextResponse.json({ ok: true, id: record.id })
}
