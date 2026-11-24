import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { requireSupabaseEnv } from './env'

const YEAR = 60 * 60 * 24 * 400

export async function createServerSupabase() {
  const { url, key } = requireSupabaseEnv()
  const cookieStore = await cookies()
  return createServerClient(url, key, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      maxAge: YEAR,
      secure: process.env.NODE_ENV === 'production',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      experimental: { passkey: true },
    },
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, maxAge: options.maxAge ?? YEAR })
          }
        } catch {
          // Server Components cannot set cookies. The middleware refresh still persists the session.
        }
      },
    },
  })
}
