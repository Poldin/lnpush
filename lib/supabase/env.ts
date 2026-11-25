export function supabasePublicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  return { url, key }
}

export function requireSupabaseEnv(): { url: string; key: string } {
  const env = supabasePublicEnv()
  if (!env) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.')
  }
  return env
}
