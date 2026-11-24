import { redirect, unstable_rethrow } from 'next/navigation'

import { LoginScreen } from './LoginScreen'
import { createServerSupabase } from '../../lib/supabase/server'
import { supabasePublicEnv } from '../../lib/supabase/env'
import { parseTab, withTab } from '../../lib/tabs'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string; inviato?: string; tab?: string }>
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
      <h1 className="screen-title">Entra</h1>
      <p className="lede">Il link arriva solo se l’email è nel team. Poi puoi registrare questo telefono.</p>
      <LoginScreen sent={params.inviato === '1'} errorCode={params.errore ?? ''} tab={tab} />
    </main>
  )
}
