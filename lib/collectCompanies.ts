import type { SupabaseClient } from '@supabase/supabase-js'

import { explainDbError } from './collectDb'
import {
  contactDraftsFromPaste,
  countsByCompanyName,
  profileCountForCompany,
  savedProfile,
  type SavedProfile,
} from './collectContacts'
import { cleanText, normalizeCollectorUrl } from './collector'
import {
  parseCompanyLines,
  type CompanyStatus,
  type QueueCompany,
  type QueueProgress,
} from './collectQueue'
import { parseGoogleLinkedInPaste } from './googlePaste'

const PAGE = 1000

type CompanyRow = {
  id: string
  name: string | null
  status: string | null
  created_at: string | null
  completed_at: string | null
}

export type QueueResult =
  | { ok: true; companies: QueueCompany[]; progress: QueueProgress; added?: number; skipped?: number }
  | { ok: false; error: string; status: number }

export type PasteResult =
  | { ok: true; added: number; skipped: number; empty: boolean; profiles: SavedProfile[] }
  | { ok: false; error: string; status: number }

export type DeleteContactResult = { ok: true } | { ok: false; error: string; status: number }

async function pageAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await load(from, from + PAGE - 1)
    if (error) throw new Error(explainDbError(error))
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

function progressOf(companies: QueueCompany[]): QueueProgress {
  return {
    pending: companies.filter((company) => company.status === 'pending').length,
    done: companies.filter((company) => company.status === 'done').length,
  }
}

function sortCompanies(companies: QueueCompany[]): QueueCompany[] {
  return [...companies].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'pending' ? -1 : 1
    if (left.status === 'done') {
      return (right.completedAt ?? '').localeCompare(left.completedAt ?? '') || left.name.localeCompare(right.name, 'en')
    }
    return left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name, 'en')
  })
}

async function profileCounts(supabase: SupabaseClient): Promise<Map<string, number>> {
  const rows = await pageAll<{ company: string | null }>(async (from, to) =>
    supabase.from('contacts').select('company').eq('active', true).range(from, to),
  )
  return countsByCompanyName(rows)
}

export async function loadCollectorQueue(supabase: SupabaseClient): Promise<QueueResult> {
  try {
    const [rows, counts] = await Promise.all([
      pageAll<CompanyRow>(async (from, to) =>
        supabase
          .from('collector_companies')
          .select('id, name, status, created_at, completed_at')
          .order('created_at', { ascending: true })
          .range(from, to),
      ),
      profileCounts(supabase),
    ])
    const companies = sortCompanies(
      rows.flatMap((row) => {
        const name = cleanText(row.name ?? '')
        const status: CompanyStatus | null = row.status === 'pending' || row.status === 'done' ? row.status : null
        if (!row.id || !name || !status) return []
        return [
          {
            id: row.id,
            name,
            status,
            createdAt: row.created_at ?? '',
            completedAt: row.completed_at,
            profiles: profileCountForCompany(name, counts),
          },
        ]
      }),
    )
    return { ok: true, companies, progress: progressOf(companies) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not read the queue.', status: 500 }
  }
}

async function snapshot(supabase: SupabaseClient, added: number, skipped: number): Promise<QueueResult> {
  const loaded = await loadCollectorQueue(supabase)
  if (!loaded.ok) return loaded
  return { ...loaded, added, skipped }
}

export async function importCompanies(supabase: SupabaseClient, text: string): Promise<QueueResult> {
  const names = parseCompanyLines(text)
  if (names.length > 500) return { ok: false, error: 'Paste at most 500 companies.', status: 400 }
  try {
    const existing = await pageAll<{ name: string | null }>(async (from, to) =>
      supabase.from('collector_companies').select('name').range(from, to),
    )
    const keys = new Set(existing.map((row) => cleanText(row.name ?? '').toLocaleLowerCase('en')).filter(Boolean))
    const fresh = names.filter((name) => !keys.has(name.toLocaleLowerCase('en')))
    let added = 0
    if (fresh.length > 0) {
      const { error } = await supabase.from('collector_companies').insert(fresh.map((name) => ({ name, status: 'pending' })))
      if (error?.code === '23505') {
        for (const name of fresh) {
          const { error: oneError } = await supabase.from('collector_companies').insert({ name, status: 'pending' })
          if (oneError?.code === '23505') continue
          if (oneError) return { ok: false, error: explainDbError(oneError), status: 500 }
          added += 1
        }
      } else if (error) {
        return { ok: false, error: explainDbError(error), status: 500 }
      } else {
        added = fresh.length
      }
    }
    return snapshot(supabase, added, names.length - added)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not add companies.', status: 500 }
  }
}

export async function addCompany(supabase: SupabaseClient, name: string): Promise<QueueResult> {
  const cleaned = cleanText(name)
  if (!cleaned) return { ok: false, error: 'Company name is required.', status: 400 }
  if (cleaned.length > 200) return { ok: false, error: 'Company name is too long.', status: 400 }
  return importCompanies(supabase, cleaned)
}

async function requireCompany(supabase: SupabaseClient, id: string): Promise<{ id: string; status: CompanyStatus } | null> {
  const { data, error } = await supabase.from('collector_companies').select('id, status').eq('id', id).maybeSingle()
  if (error) throw new Error(explainDbError(error))
  if (!data?.id || (data.status !== 'pending' && data.status !== 'done')) return null
  return { id: data.id, status: data.status }
}

export async function deleteCompany(supabase: SupabaseClient, id: string): Promise<QueueResult> {
  try {
    const existing = await requireCompany(supabase, id)
    if (!existing) return { ok: false, error: 'Company not found.', status: 404 }
    const { error } = await supabase.from('collector_companies').delete().eq('id', id)
    if (error) return { ok: false, error: explainDbError(error), status: 500 }
    return snapshot(supabase, 0, 0)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not delete the company.', status: 500 }
  }
}

export async function markCompanyDone(supabase: SupabaseClient, id: string): Promise<QueueResult> {
  try {
    const existing = await requireCompany(supabase, id)
    if (!existing) return { ok: false, error: 'Company not found.', status: 404 }
    if (existing.status === 'pending') {
      const { error } = await supabase
        .from('collector_companies')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
      if (error) return { ok: false, error: explainDbError(error), status: 500 }
    }
    return snapshot(supabase, 0, 0)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not update the company.', status: 500 }
  }
}

export async function reopenCompany(supabase: SupabaseClient, id: string): Promise<QueueResult> {
  try {
    const existing = await requireCompany(supabase, id)
    if (!existing) return { ok: false, error: 'Company not found.', status: 404 }
    const { error } = await supabase
      .from('collector_companies')
      .update({ status: 'pending', completed_at: null })
      .eq('id', id)
    if (error) return { ok: false, error: explainDbError(error), status: 500 }
    return snapshot(supabase, 0, 0)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not reopen the company.', status: 500 }
  }
}

async function loadContactUrls(supabase: SupabaseClient): Promise<Set<string>> {
  const rows = await pageAll<{ linkedin_url: string | null }>(async (from, to) =>
    supabase.from('contacts').select('linkedin_url').not('linkedin_url', 'is', null).range(from, to),
  )
  const urls = new Set<string>()
  for (const row of rows) {
    const url = normalizeCollectorUrl(row.linkedin_url ?? '')
    if (url) urls.add(url)
  }
  return urls
}

export async function savePastedProfiles(
  supabase: SupabaseClient,
  companyId: string,
  html: string,
  text: string,
): Promise<PasteResult> {
  try {
    const { data, error } = await supabase.from('collector_companies').select('id, name').eq('id', companyId).maybeSingle()
    if (error) return { ok: false, error: explainDbError(error), status: 500 }
    const company = cleanText(data?.name ?? '')
    if (!data?.id || !company) return { ok: false, error: 'Company not found.', status: 404 }

    const parsed = parseGoogleLinkedInPaste({ html, text })
    if (parsed.profiles.length === 0) return { ok: true, added: 0, skipped: 0, empty: true, profiles: [] }

    const planned = contactDraftsFromPaste(company, parsed, await loadContactUrls(supabase))
    const saved: SavedProfile[] = []
    let skipped = planned.skipped
    for (const draft of planned.drafts) {
      const { data: inserted, error: insertError } = await supabase.from('contacts').insert(draft).select('id').maybeSingle()
      if (insertError?.code === '23505') {
        skipped += 1
        continue
      }
      if (insertError) return { ok: false, error: explainDbError(insertError), status: 500 }
      if (!inserted?.id || typeof inserted.id !== 'string') {
        return { ok: false, error: 'Could not save the contact.', status: 500 }
      }
      saved.push(savedProfile(inserted.id, draft))
    }
    return { ok: true, added: saved.length, skipped, empty: false, profiles: saved }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not save profiles.', status: 500 }
  }
}

export async function deleteCollectedContact(supabase: SupabaseClient, id: string): Promise<DeleteContactResult> {
  try {
    const { data, error: readError } = await supabase.from('contacts').select('id').eq('id', id).maybeSingle()
    if (readError) return { ok: false, error: explainDbError(readError), status: 500 }
    if (!data?.id) return { ok: false, error: 'Contact not found.', status: 404 }
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error?.code === '23503') return { ok: false, error: 'This contact is already in use.', status: 409 }
    if (error) return { ok: false, error: explainDbError(error), status: 500 }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not remove the contact.', status: 500 }
  }
}
