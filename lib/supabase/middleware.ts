import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { supabasePublicEnv } from './env'

const YEAR = 60 * 60 * 24 * 400
const PUBLIC_PATHS = new Set(['/login', '/auth/callback'])

export async function updateSession(request: NextRequest) {
  const env = supabasePublicEnv()
  if (!env) return NextResponse.next({ request })

  let response = NextResponse.next({ request })
  const supabase = createServerClient(env.url, env.key, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      maxAge: YEAR,
      secure: request.nextUrl.protocol === 'https:',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      experimental: { passkey: true },
    },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, maxAge: options.maxAge ?? YEAR })
        }
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.has(path) || path.startsWith('/api/auth/')
  if (!data.user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  if (data.user && path === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return response
}
