import { createBrowserClient } from '@supabase/ssr'

import { requireSupabaseEnv } from './env'

const YEAR = 60 * 60 * 24 * 400

export function createBrowserSupabase() {
  const { url, key } = requireSupabaseEnv()
  return createBrowserClient(url, key, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      maxAge: YEAR,
      secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
    },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      experimental: { passkey: true },
    },
  })
}
