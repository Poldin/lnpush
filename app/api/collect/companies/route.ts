import { NextResponse } from 'next/server'

import { addCompany, deleteCompany, importCompanies, loadCollectorQueue, markCompanyDone, reopenCompany } from '../../../../lib/collectCompanies'
import { requireTeamMember } from '../member'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const member = await requireTeamMember()
  if ('response' in member) return member.response
  const loaded = await loadCollectorQueue(member.supabase)
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  return NextResponse.json({ companies: loaded.companies, progress: loaded.progress })
}

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
  const action = record.action
  if (action !== 'import' && action !== 'add' && action !== 'delete' && action !== 'reopen' && action !== 'done') {
    return NextResponse.json({ error: 'action must be import, add, delete, reopen, or done.' }, { status: 400 })
  }

  const result =
    action === 'import'
      ? await importFromBody(member.supabase, record)
      : action === 'add'
        ? await addFromBody(member.supabase, record)
        : await idAction(member.supabase, action, record)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    added: result.added ?? 0,
    skipped: result.skipped ?? 0,
    companies: result.companies,
    progress: result.progress,
  })
}

async function importFromBody(supabase: Parameters<typeof importCompanies>[0], record: Record<string, unknown>) {
  if (typeof record.text !== 'string') return { ok: false as const, error: 'text must be a string.', status: 400 }
  if (record.text.length > 100_000) return { ok: false as const, error: 'Company list is too long.', status: 400 }
  return importCompanies(supabase, record.text)
}

async function addFromBody(supabase: Parameters<typeof addCompany>[0], record: Record<string, unknown>) {
  if (typeof record.name !== 'string') return { ok: false as const, error: 'name must be a string.', status: 400 }
  return addCompany(supabase, record.name)
}

async function idAction(
  supabase: Parameters<typeof deleteCompany>[0],
  action: 'delete' | 'reopen' | 'done',
  record: Record<string, unknown>,
) {
  if (typeof record.id !== 'string' || !UUID.test(record.id)) {
    return { ok: false as const, error: 'id must be a uuid.', status: 400 }
  }
  if (action === 'delete') return deleteCompany(supabase, record.id)
  if (action === 'reopen') return reopenCompany(supabase, record.id)
  return markCompanyDone(supabase, record.id)
}
