import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { supabasePublicEnv } from './env'
import { withTab } from '../tabs'

function redirectTarget(path: string, request: NextRequest) {
  const tab = request.nextUrl.searchParams.get('tab')
  const destination = new URL(withTab(path, tab), request.url)
  destination.searchParams.delete('aziende')
  destination.searchParams.delete('companies')
  const companies = [
    ...request.nextUrl.searchParams.getAll('aziende'),
    ...request.nextUrl.searchParams.getAll('companies'),
  ]
  for (const company of companies) {
    if (company.trim()) destination.searchParams.append('companies', company.trim())
  }
  return destination
}

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
    return NextResponse.redirect(redirectTarget('/login', request))
  }
  if (data.user && path === '/login') {
    return NextResponse.redirect(redirectTarget('/', request))
  }
  return response
}
