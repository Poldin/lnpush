import { redirect, unstable_rethrow } from 'next/navigation'

import { LoginScreen } from './LoginScreen'
import { createServerSupabase } from '../../lib/supabase/server'
import { supabasePublicEnv } from '../../lib/supabase/env'
import { parseTab, withTab } from '../../lib/tabs'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; error?: string; inviato?: string; sent?: string; tab?: string }>
}) {
  const params = await searchParams
  const tab = parseTab(params.tab)
  if (supabasePublicEnv()) {
    try {
      const supabase = await createServerSupabase()
      const { data } = await supabase.auth.getUser()
      if (data.user) redirect(withTab('/', params.tab))
    } catch (error) {
      unstable_rethrow(error)
    }
  }

  return (
    <main className="wrap">
      <h1 className="screen-title">Sign in</h1>
      <p className="lede">The link is sent only if the email is on the team. You can then save this phone.</p>
      <LoginScreen sent={params.sent === '1' || params.inviato === '1'} errorCode={params.error ?? params.errore ?? ''} tab={tab} />
    </main>
  )
}
