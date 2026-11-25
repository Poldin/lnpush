import { NextResponse } from 'next/server'

import { loadConfigFile } from '../../../lib/data'
import { todayIso } from '../../../lib/dates'
import { buildMemberList, companyScores, hiddenContactIds, resolveHotCompany, weekStartIso } from '../../../lib/listOrder'
import { createServerSupabase } from '../../../lib/supabase/server'
import { loadHotWeeks, loadRoster, memberForUser } from '../../../lib/supabase/team'

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

    const now = new Date()
    const isoDate = todayIso(config.timezone, now)
    const forced = await loadHotWeeks(supabase)
    const hotCompany = resolveHotCompany(weekStartIso(config.timezone, now), companyScores(roster.contacts, roster.clicks), forced)
    const cards = buildMemberList(roster.contacts, roster.clicks, member.id, isoDate, now, hotCompany)
    const contactLabels = Object.fromEntries(
      roster.contacts.map((contact) => [
        contact.id,
        { name: contact.name, role: contact.role, company: contact.company, linkedinUrl: contact.linkedinUrl },
      ]),
    )
    const companies = [...new Set(roster.contacts.map((contact) => contact.company).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, 'it'),
    )
    return NextResponse.json({
      isoDate,
      timezone: config.timezone,
      memberId: member.id,
      memberName: member.name,
      cards,
      companies,
      openedContactIds: hiddenContactIds(roster.clicks, member.id, now),
      hotCompany,
      contactLabels,
      beforeStart: false,
      startLabel: '',
      cooldownDays: 0,
      maxMembersPerContact: 0,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The list is unavailable.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
