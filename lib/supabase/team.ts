import type { SupabaseClient, User } from '@supabase/supabase-js'

import { contactIsTechnical } from '../classify'
import { normalizeLinkedInUrl } from '../linkedin'
import { ownCounts, ownOpenings, type UsageClick } from '../usage'
import type { Contact, TeamMember, UsageView } from '../types'

export type TeamRow = {
  id: string
  name: string
  email: string | null
  auth_user_id: string | null
  active: boolean | null
}

export async function emailIsOnTeam(supabase: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_team_email', { candidate: email })
  if (!error && typeof data === 'boolean') return data

  const { data: rows, error: selectError } = await supabase
    .from('team_members')
    .select('id')
    .ilike('email', email)
    .eq('active', true)
    .limit(1)
  if (selectError) return false
  return (rows?.length ?? 0) > 0
}

export async function loadActiveTeam(supabase: SupabaseClient): Promise<TeamRow[]> {
  const { data, error } = await supabase.from('team_members').select('id, name, email, auth_user_id, active').eq('active', true)
  if (error) throw new Error('Could not read the team.')
  return (data ?? []) as TeamRow[]
}

export async function loadRoster(supabase: SupabaseClient, technicalPattern: string) {
  const [contactsResult, teamResult, clicksResult] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, company, full_name, role, contact_group, linkedin_url')
      .eq('active', true)
      .not('linkedin_url', 'is', null),
    supabase.from('team_members').select('id, name, email, auth_user_id, active').eq('active', true),
    supabase.from('clicks').select('team_member_id, contact_id'),
  ])

  if (contactsResult.error) throw new Error('Could not read the contacts.')
  if (teamResult.error) throw new Error('Could not read the team.')

  const contacts: Contact[] = []
  for (const row of contactsResult.data ?? []) {
    const linkedinUrl = normalizeLinkedInUrl(row.linkedin_url ?? '')
    const name = (row.full_name ?? '').replace(/\s+/g, ' ').trim()
    if (!linkedinUrl || !name || !row.id) continue
    const group = (row.contact_group ?? '').replace(/\s+/g, ' ').trim()
    contacts.push({
      id: row.id,
      name,
      role: (row.role ?? '').replace(/\s+/g, ' ').trim(),
      company: (row.company ?? '').replace(/\s+/g, ' ').trim(),
      group,
      linkedinUrl,
      technical: contactIsTechnical(group, '', technicalPattern),
    })
  }

  const team: TeamMember[] = (teamResult.data ?? [])
    .filter((row) => row.id && row.name)
    .map((row) => ({ id: row.id, name: row.name.trim(), technical: false }))

  const clicks = clicksResult.error
    ? []
    : (clicksResult.data ?? []).flatMap((row) =>
        row.team_member_id && row.contact_id ? [{ memberId: row.team_member_id, contactId: row.contact_id }] : [],
      )

  return { contacts, team, clicks, teamRows: (teamResult.data ?? []) as TeamRow[] }
}

export function memberForUser(rows: TeamRow[], user: User): TeamRow | null {
  const email = user.email?.toLowerCase() ?? ''
  return (
    rows.find((row) => row.auth_user_id === user.id) ??
    rows.find((row) => row.email?.toLowerCase() === email && email.length > 0) ??
    null
  )
}

export async function loadUsage(supabase: SupabaseClient, memberId: string, timeZone: string): Promise<UsageView> {
  const { data, error } = await supabase
    .from('clicks')
    .select('clicked_at, contact_id, contacts!clicks_contact_id_fkey(full_name, role, company, linkedin_url)')
    .eq('team_member_id', memberId)
    .order('clicked_at', { ascending: false })

  if (error) return { unavailable: true, counts: { today: 0, week: 0, total: 0 }, recent: [] }

  const clicks: UsageClick[] = []
  for (const row of data ?? []) {
    const contact = one(row.contacts)
    if (!row.contact_id || !row.clicked_at) continue
    clicks.push({
      memberId,
      contactId: row.contact_id,
      contactName: (contact?.full_name ?? '').replace(/\s+/g, ' ').trim(),
      role: (contact?.role ?? '').replace(/\s+/g, ' ').trim(),
      company: (contact?.company ?? '').replace(/\s+/g, ' ').trim(),
      linkedinUrl: normalizeLinkedInUrl(contact?.linkedin_url ?? '') ?? '',
      clickedAt: row.clicked_at,
    })
  }
  return {
    unavailable: false,
    counts: ownCounts(clicks, memberId, timeZone),
    recent: ownOpenings(clicks, memberId, timeZone),
  }
}

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export async function linkMember(supabase: SupabaseClient, member: TeamRow, user: User) {
  if (member.auth_user_id === user.id) return
  await supabase.from('team_members').update({ auth_user_id: user.id }).eq('id', member.id).is('auth_user_id', null)
}
