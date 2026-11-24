import { redirect, unstable_rethrow } from 'next/navigation'

import { TodayApp } from '../components/TodayApp'
import { loadConfigFile } from '../lib/data'
import { createServerSupabase } from '../lib/supabase/server'
import { linkMember, loadActiveTeam, memberForUser } from '../lib/supabase/team'
import { todayIso } from '../lib/dates'
import { parseCompanies, parseTab, withTab } from '../lib/tabs'

export const dynamic = 'force-dynamic'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; aziende?: string | string[] }>
}) {
  const params = await searchParams
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (!data.user) redirect(withTab('/login', params.tab))

    const config = loadConfigFile()
    const teamRows = await loadActiveTeam(supabase)
    const member = memberForUser(teamRows, data.user)
    if (!member) {
      return (
        <main className="wrap">
          <h1 className="plain-title">Email non nel team</h1>
          <p className="lede">Questo accesso non corrisponde a una persona attiva del team.</p>
          <form action="/api/logout" method="post">
            <button className="primary center" type="submit">
              Esci
            </button>
          </form>
        </main>
      )
    }

    await linkMember(supabase, member, data.user)
    return (
      <TodayApp
        memberId={member.id}
        memberName={member.name}
        timezone={config.timezone}
        isoDate={todayIso(config.timezone)}
        initialTab={parseTab(params.tab)}
        initialCompanies={parseCompanies(params.aziende)}
      />
    )
  } catch (error) {
    unstable_rethrow(error)
    const message = error instanceof Error ? error.message : 'Controlla la configurazione.'
    return (
      <main className="wrap">
        <h1 className="plain-title">Controlla i dati</h1>
        <p className="tip">{message}</p>
      </main>
    )
  }
}
