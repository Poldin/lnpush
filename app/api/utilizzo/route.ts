import { NextResponse } from 'next/server'

import { loadConfigFile } from '../../../lib/data'
import { createServerSupabase } from '../../../lib/supabase/server'
import { loadActiveTeam, loadUsage, memberForUser } from '../../../lib/supabase/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: 'Accesso richiesto.' }, { status: 401 })

    const config = loadConfigFile()
    const teamRows = await loadActiveTeam(supabase)
    const member = memberForUser(teamRows, data.user)
    if (!member) return NextResponse.json({ error: 'Email non nel team.' }, { status: 403 })

    return NextResponse.json(await loadUsage(supabase, member.id, config.timezone))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Utilizzo non disponibile.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
