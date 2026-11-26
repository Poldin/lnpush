import { NextResponse } from 'next/server'

import { createServerSupabase } from '../../../lib/supabase/server'
import { loadActiveTeam, memberForUser, type TeamRow } from '../../../lib/supabase/team'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function requireTeamMember(): Promise<
  { supabase: SupabaseClient; member: TeamRow; userId: string } | { response: NextResponse }
> {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 }) }
  const team = await loadActiveTeam(supabase)
  const member = memberForUser(team, data.user)
  if (!member) return { response: NextResponse.json({ error: 'Not found.' }, { status: 404 }) }
  return { supabase, member, userId: data.user.id }
}
