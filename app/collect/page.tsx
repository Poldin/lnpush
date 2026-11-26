import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CollectApp } from '../../components/CollectApp'
import { loadCollectorQueue } from '../../lib/collectCompanies'
import { createServerSupabase } from '../../lib/supabase/server'
import { linkMember, loadActiveTeam, memberForUser } from '../../lib/supabase/team'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Collect · Newtwen',
  robots: { index: false, follow: false },
}

export default async function CollectPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const team = await loadActiveTeam(supabase)
  const member = memberForUser(team, data.user)
  if (!member) {
    return (
      <main className="wrap">
        <h1 className="plain-title">Email is not on the team</h1>
        <p className="lede">This sign-in does not match an active team member.</p>
        <form action="/api/logout" method="post">
          <button className="primary center" type="submit">
            Sign out
          </button>
        </form>
      </main>
    )
  }

  await linkMember(supabase, member, data.user)
  const loaded = await loadCollectorQueue(supabase)
  if (!loaded.ok) {
    return (
      <main className="collect-screen">
        <div className="collect-wrap">
          <a className="collect-back" href="/">
            List
          </a>
          <p className="kicker">Collect</p>
          <h1 className="plain-title">Google profiles</h1>
          <p className="lede">{loaded.error}</p>
        </div>
      </main>
    )
  }

  return <CollectApp companies={loaded.companies} progress={loaded.progress} />
}
