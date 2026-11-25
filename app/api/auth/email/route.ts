import { NextResponse } from 'next/server'

import { createServerSupabase } from '../../../../lib/supabase/server'
import { emailIsOnTeam } from '../../../../lib/supabase/team'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let email = ''
  try {
    const body = (await request.json()) as { email?: unknown }
    email = typeof body.email === 'string' ? body.email.trim() : ''
  } catch {
    email = ''
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
  }

  try {
    const supabase = await createServerSupabase()
    const allowed = await emailIsOnTeam(supabase, email)
    if (!allowed) {
      return NextResponse.json({ error: 'This email is not on the team.' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invio non riuscito.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
