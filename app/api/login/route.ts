import { NextResponse } from 'next/server'

import {
  COOKIE_MAX_AGE,
  COOKIE_NAME,
  authCookie,
  authToken,
  configuredPassword,
  passwordMatches,
  requestIsSecure,
} from '../../../lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const expected = configuredPassword()
  if (!expected) return NextResponse.json({ ok: true })

  let password = ''
  try {
    const body = (await request.json()) as { password?: unknown }
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    password = ''
  }

  if (!(await passwordMatches(password, expected))) {
    return NextResponse.json({ error: 'Password non corretta.' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, await authToken(expected), authCookie(COOKIE_MAX_AGE, requestIsSecure(request)))
  return response
}
