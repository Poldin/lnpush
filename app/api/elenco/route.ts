import { NextResponse } from 'next/server'

import { buildTodayPlan, homeForMember, loadConfigFile, queueCards } from '../../../lib/data'
import { todayIso } from '../../../lib/dates'
import { createServerSupabase } from '../../../lib/supabase/server'
import { loadRoster, memberForUser } from '../../../lib/supabase/team'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: 'Sign-in required.' }, { status: 401 })

    const config = loadConfigFile()
    const roster = await loadRoster(supabase, config.technicalGroupPattern)
    const member = memberForUser(roster.teamRows, data.user)
    if (!member) return NextResponse.json({ error: 'This email is not on the team.' }, { status: 403 })

    const plan = buildTodayPlan(
      { contacts: roster.contacts, team: roster.team, config, clicks: roster.clicks },
      todayIso(config.timezone),
    )
    const openedContactIds = [...new Set(roster.clicks.map((click) => click.contactId))]
    const contactLabels = Object.fromEntries(
      roster.contacts.map((contact) => [
        contact.id,
        { name: contact.name, role: contact.role, company: contact.company, linkedinUrl: contact.linkedinUrl },
      ]),
    )
    const view = homeForMember(plan, member.id, openedContactIds, contactLabels)
    const companies = [...new Set(roster.contacts.map((contact) => contact.company).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, 'it'),
    )
    return NextResponse.json({
      ...view,
      cards: queueCards(
        { contacts: roster.contacts, team: roster.team, config, clicks: roster.clicks },
        member.id,
        plan.isoDate,
      ),
      companies,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The list is unavailable.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
