import { NextResponse } from 'next/server'

import { COOKIE_NAME, authCookie, requestIsSecure } from '../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '', authCookie(0, requestIsSecure(request)))
  return response
}
