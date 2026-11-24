import { redirect } from 'next/navigation'

import { TodayApp } from '../components/TodayApp'
import { buildTodayPlan, homeForMember, loadConfigFile } from '../lib/data'
import { createServerSupabase } from '../lib/supabase/server'
import { linkMember, loadRoster, loadUsage, memberForUser } from '../lib/supabase/team'
import { todayIso } from '../lib/dates'

export const dynamic = 'force-dynamic'

export default async function Page() {
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (!data.user) redirect('/login')

    const config = loadConfigFile()
    const roster = await loadRoster(supabase, config.technicalGroupPattern)
    const member = memberForUser(roster.teamRows, data.user)
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
    const plan = buildTodayPlan(
      { contacts: roster.contacts, team: roster.team, config, clicks: roster.clicks },
      todayIso(config.timezone),
    )
    const usage = await loadUsage(supabase, roster.team, config.timezone)
    return (
      <TodayApp
        view={homeForMember(plan, member.id)}
        usage={{ unavailable: usage.unavailable, members: usage.summary.members, recent: usage.summary.recent }}
      />
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Controlla la configurazione.'
    return (
      <main className="wrap">
        <h1 className="plain-title">Controlla i dati</h1>
        <p className="tip">{message}</p>
      </main>
    )
  }
}
