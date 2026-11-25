import { isCollectorAdmin } from './admin'
import { cronSecret, readBearer, secretMatches } from './secret'
import { createServerSupabase } from './supabase/server'
import { loadActiveTeam, memberForUser } from './supabase/team'

export type AuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string }

export async function authorizeCollector(request: Request, allowAdmin: boolean): Promise<AuthResult> {
  const secret = cronSecret()
  const token = readBearer(request.headers.get('authorization'))
  if (token) {
    if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured.' }
    if (!secretMatches(token, secret)) return { ok: false, status: 401, error: 'Unauthorized.' }
    return { ok: true }
  }
  if (!allowAdmin) {
    if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured.' }
    return { ok: false, status: 401, error: 'Unauthorized.' }
  }
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return { ok: false, status: 401, error: 'Unauthorized.' }
    const team = await loadActiveTeam(supabase)
    const member = memberForUser(team, data.user)
    if (!member || !isCollectorAdmin(member, data.user)) return { ok: false, status: 401, error: 'Unauthorized.' }
    return { ok: true }
  } catch {
    return { ok: false, status: 401, error: 'Unauthorized.' }
  }
}
