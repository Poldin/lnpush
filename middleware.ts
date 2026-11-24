import { NextResponse, type NextRequest } from 'next/server'

import { COOKIE_NAME, authToken, configuredPassword, safeEqual } from './lib/auth'

export async function middleware(request: NextRequest) {
  const password = configuredPassword()
  if (!password) return NextResponse.next()

  const { pathname } = request.nextUrl
  if (pathname === '/login' || pathname.startsWith('/api/login') || pathname.startsWith('/api/logout')) {
    return NextResponse.next()
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value ?? ''
  const expected = await authToken(password)
  if (cookie && safeEqual(cookie, expected)) return NextResponse.next()

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|icon.svg).*)'],
}
