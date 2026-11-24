import { NextResponse } from 'next/server'

import { createServerSupabase } from '../../../lib/supabase/server'
import { loadRoster, memberForUser } from '../../../lib/supabase/team'
import { loadConfigFile } from '../../../lib/data'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let contactId = ''
  try {
    const body = JSON.parse(await request.text()) as { contactId?: unknown }
    contactId = typeof body.contactId === 'string' ? body.contactId : ''
  } catch {
    contactId = ''
  }
  if (!contactId) return NextResponse.json({ error: 'Contatto mancante.' }, { status: 400 })

  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return NextResponse.json({ error: 'Accesso richiesto.' }, { status: 401 })

  const config = loadConfigFile()
  const roster = await loadRoster(supabase, config.technicalGroupPattern)
  const member = memberForUser(roster.teamRows, data.user)
  if (!member) return NextResponse.json({ error: 'Email non nel team.' }, { status: 403 })

  const { error } = await supabase.from('clicks').insert({ team_member_id: member.id, contact_id: contactId })
  if (error) return NextResponse.json({ error: 'Registrazione non riuscita.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
