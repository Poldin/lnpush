import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { ReviewApp } from '../../components/ReviewApp'
import { isCollectorAdmin } from '../../lib/admin'
import { loadReviewQueue } from '../../lib/reviewLoad'
import { createServerSupabase } from '../../lib/supabase/server'
import { loadActiveTeam, memberForUser } from '../../lib/supabase/team'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Review · Newtwen',
  robots: { index: false, follow: false },
}

export default async function ReviewPage() {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const team = await loadActiveTeam(supabase)
  const member = memberForUser(team, data.user)
  if (!member || !isCollectorAdmin(member, data.user)) notFound()

  const loaded = await loadReviewQueue(supabase)
  const providerEnabled = Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim())
  if (!loaded.ok) {
    return (
      <main className="review-screen">
        <div className="review-wrap">
          <p className="kicker">Review</p>
          <h1 className="plain-title">Candidates</h1>
          <p className="lede">{loaded.error}</p>
          <a className="review-back" href="/">
            Back to the list
          </a>
        </div>
      </main>
    )
  }

  return <ReviewApp pending={loaded.pending} progress={loaded.progress} providerEnabled={providerEnabled} />
}
