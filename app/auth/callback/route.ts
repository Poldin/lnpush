import { NextResponse } from 'next/server'

import { createServerSupabase } from '../../../lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const supabase = await createServerSupabase()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(new URL('/login?errore=link', url.origin))
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'email' })
    if (error) return NextResponse.redirect(new URL('/login?errore=link', url.origin))
  } else {
    return NextResponse.redirect(new URL('/login?errore=link', url.origin))
  }

  return NextResponse.redirect(new URL('/', url.origin))
}
