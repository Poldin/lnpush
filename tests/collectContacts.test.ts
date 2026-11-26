import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { deleteCollectedContact, loadCollectorQueue, savePastedProfiles } from '../lib/collectCompanies'
import {
  PASTE_CONTACT_LIMIT,
  contactDraftsFromPaste,
  countsByCompanyName,
  profileCountForCompany,
  savedProfile,
  type ContactDraft,
} from '../lib/collectContacts'
import { explainDbError } from '../lib/collectDb'
import type { ParsedProfile } from '../lib/googlePaste'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const CONTACT_ID = '22222222-2222-4222-8222-222222222222'

const pasteHtml = `
<a href="https://it.linkedin.com/in/Ada-Lovelace/?trk=1"><h3>Ada Lovelace - Engineer | LinkedIn</h3></a>
<a href="https://www.linkedin.com/in/ada-lovelace"><h3>Ada Lovelace - Engineer | LinkedIn</h3></a>
<a href="https://www.linkedin.com/in/Grace-Hopper"><h3>Grace Hopper | LinkedIn</h3></a>
<a href="https://www.linkedin.com/in/no-headline"><h3>Alan Turing</h3></a>
`

type Call = { table: string; op: string; payload?: unknown }
type Filter = { table: string; column: string; value: unknown }

function collectorMock(options: {
  company?: { id: string; name: string } | null
  companies?: { id: string; name: string; status: string; created_at: string; completed_at: string | null }[]
  contactUrls?: (string | null)[]
  contactCompanies?: { company: string | null }[]
  insertIds?: string[]
  failInsertUrls?: Set<string>
  insertError?: { message: string; code?: string }
  contactRow?: { id: string } | null
  deleteError?: { message: string; code?: string } | null
}) {
  const calls: Call[] = []
  const filters: Filter[] = []
  let insertIndex = 0
  const supabase = {
    from(table: string) {
      const state: { op: string; payload?: unknown } = { op: 'select' }
      const chain: {
        select: () => typeof chain
        eq: (column: string, value: unknown) => typeof chain
        not: () => typeof chain
        order: () => typeof chain
        insert: (payload: unknown) => typeof chain
        delete: () => typeof chain
        range: () => Promise<{ data: unknown[] | null; error: { message: string; code?: string } | null }>
        maybeSingle: () => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
        then: (
          onFulfilled: (value: { data: null; error: { message: string; code?: string } | null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise<unknown>
      } = {
        select: () => chain,
        eq: (column, value) => {
          filters.push({ table, column, value })
          return chain
        },
        not: () => chain,
        order: () => chain,
        insert: (payload) => {
          state.op = 'insert'
          state.payload = payload
          return chain
        },
        delete: () => {
          state.op = 'delete'
          return chain
        },
        range: () => {
          calls.push({ table, op: 'select' })
          if (table === 'collector_companies') return Promise.resolve({ data: options.companies ?? [], error: null })
          if (table === 'contacts' && options.contactCompanies) {
            return Promise.resolve({ data: options.contactCompanies, error: null })
          }
          if (table === 'contacts') {
            return Promise.resolve({
              data: (options.contactUrls ?? []).map((linkedin_url) => ({ linkedin_url })),
              error: null,
            })
          }
          return Promise.resolve({ data: [], error: null })
        },
        maybeSingle: () => {
          calls.push({ table, op: state.op, payload: state.payload })
          if (table === 'collector_companies') return Promise.resolve({ data: options.company ?? null, error: null })
          if (table === 'contacts' && state.op === 'insert') {
            const url = (state.payload as { linkedin_url?: string }).linkedin_url ?? ''
            if (options.failInsertUrls?.has(url)) {
              return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
            }
            if (options.insertError) return Promise.resolve({ data: null, error: options.insertError })
            const id = options.insertIds?.[insertIndex] ?? CONTACT_ID
            insertIndex += 1
            return Promise.resolve({ data: { id }, error: null })
          }
          if (table === 'contacts') return Promise.resolve({ data: options.contactRow ?? null, error: null })
          return Promise.resolve({ data: null, error: { message: `unexpected ${table}` } })
        },
        then: (onFulfilled, onRejected) => {
          calls.push({ table, op: state.op, payload: state.payload })
          return Promise.resolve({ data: null, error: state.op === 'delete' ? (options.deleteError ?? null) : null }).then(
            onFulfilled,
            onRejected,
          )
        },
      }
      return chain
    },
  }
  return { supabase: supabase as unknown as SupabaseClient, calls, filters }
}

function profile(index: number, headline: string | null = null): ParsedProfile {
  return {
    full_name: index === 5 ? null : `Person ${index}`,
    headline,
    linkedin_url: `https://it.linkedin.com/in/Person-${index}/`,
    snippet: 'not stored',
  }
}

describe('direct contact drafts', () => {
  it('maps a paste onto contacts and skips linkedin urls already stored there', () => {
    const parsed = {
      duplicates: 2,
      profiles: [
        profile(0, 'Engineer'),
        profile(1, '   '),
        {
          full_name: null,
          headline: null,
          linkedin_url: 'https://uk.linkedin.com/in/No-Name/',
          snippet: 'not stored',
        },
      ],
    }
    const existing = new Set(['https://www.linkedin.com/in/person-0'])
    const { drafts, skipped } = contactDraftsFromPaste('  Acme  ', parsed, existing)

    expect(skipped).toBe(3)
    expect(drafts.map((draft) => draft.linkedin_url)).toEqual([
      'https://www.linkedin.com/in/person-1',
      'https://www.linkedin.com/in/no-name',
    ])
    expect(drafts[0]).toEqual({
      company: 'Acme',
      full_name: 'Person 1',
      role: null,
      linkedin_url: 'https://www.linkedin.com/in/person-1',
      active: true,
    })
    expect(drafts[1]).toMatchObject({ full_name: 'No Name', role: null, active: true })
    expect(Object.keys(drafts[0] as ContactDraft).sort()).toEqual(['active', 'company', 'full_name', 'linkedin_url', 'role'])
    expect(savedProfile(CONTACT_ID, { ...drafts[0], role: 'Engineer' })).toEqual({
      id: CONTACT_ID,
      full_name: 'Person 1',
      headline: 'Engineer',
      linkedin_url: 'https://www.linkedin.com/in/person-1',
    })
  })

  it('keeps the first 100 new profiles and does not count the overflow as skipped', () => {
    const profiles = Array.from({ length: PASTE_CONTACT_LIMIT + 3 }, (_, index) => profile(index, index === 1 ? '  Engineer  ' : null))
    const { drafts, skipped } = contactDraftsFromPaste('Acme', { profiles, duplicates: 4 }, new Set(['https://www.linkedin.com/in/person-0']))

    expect(drafts).toHaveLength(PASTE_CONTACT_LIMIT)
    expect(skipped).toBe(5)
    expect(drafts[0]).toMatchObject({
      company: 'Acme',
      full_name: 'Person 1',
      role: 'Engineer',
      linkedin_url: 'https://www.linkedin.com/in/person-1',
      active: true,
    })
    expect(drafts.at(-1)?.linkedin_url).toBe(`https://www.linkedin.com/in/person-${PASTE_CONTACT_LIMIT}`)
    expect(drafts.some((draft) => draft.linkedin_url.endsWith('/person-0'))).toBe(false)
  })
})

describe('contact counts for the collect queue', () => {
  it('counts active contacts by company name', () => {
    const counts = countsByCompanyName([
      { company: 'Acme' },
      { company: ' acme ' },
      { company: 'Beta' },
      { company: '   ' },
      { company: null },
    ])
    expect(counts).toEqual(new Map([['acme', 2], ['beta', 1]]))
    expect(profileCountForCompany('ACME', counts)).toBe(2)
    expect(profileCountForCompany('Missing', counts)).toBe(0)
  })

  it('reads the queue counts from contacts', async () => {
    const { supabase, calls, filters } = collectorMock({
      companies: [
        {
          id: COMPANY_ID,
          name: 'Acme',
          status: 'pending',
          created_at: '2026-01-01T00:00:00.000Z',
          completed_at: null,
        },
      ],
      contactCompanies: [{ company: 'Acme' }, { company: 'acme' }, { company: 'Beta' }],
    })
    const loaded = await loadCollectorQueue(supabase)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.companies[0]?.profiles).toBe(2)
    expect(calls.map((call) => call.table).sort()).toEqual(['collector_companies', 'contacts'])
    expect(filters).toContainEqual({ table: 'contacts', column: 'active', value: true })
    expect(calls.some((call) => call.table === 'profile_candidates')).toBe(false)
  })
})

describe('save pasted profiles into contacts', () => {
  it('inserts normalized contacts and skips urls already in contacts', async () => {
    const { supabase, calls } = collectorMock({
      company: { id: COMPANY_ID, name: 'Acme' },
      contactUrls: ['https://www.linkedin.com/in/Grace-Hopper'],
      insertIds: [CONTACT_ID, '33333333-3333-4333-8333-333333333333'],
    })
    const saved = await savePastedProfiles(supabase, COMPANY_ID, pasteHtml, '')
    expect(saved).toMatchObject({
      ok: true,
      added: 2,
      skipped: 2,
      empty: false,
    })
    if (!saved.ok) return
    expect(saved.profiles).toEqual([
      {
        id: CONTACT_ID,
        full_name: 'Ada Lovelace',
        headline: 'Engineer',
        linkedin_url: 'https://www.linkedin.com/in/ada-lovelace',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        full_name: 'Alan Turing',
        headline: null,
        linkedin_url: 'https://www.linkedin.com/in/no-headline',
      },
    ])
    const inserts = calls.filter((call) => call.op === 'insert')
    expect(inserts.map((call) => call.table)).toEqual(['contacts', 'contacts'])
    expect(inserts[0]?.payload).toEqual({
      company: 'Acme',
      full_name: 'Ada Lovelace',
      role: 'Engineer',
      linkedin_url: 'https://www.linkedin.com/in/ada-lovelace',
      active: true,
    })
    expect(inserts[1]?.payload).toMatchObject({ role: null, active: true, full_name: 'Alan Turing' })
    expect(calls.some((call) => call.table === 'profile_candidates')).toBe(false)
  })

  it('counts a unique violation as a duplicate and does not write candidates', async () => {
    const { supabase, calls } = collectorMock({
      company: { id: COMPANY_ID, name: 'Acme' },
      contactUrls: ['https://www.linkedin.com/in/grace-hopper'],
      failInsertUrls: new Set(['https://www.linkedin.com/in/ada-lovelace']),
      insertIds: [CONTACT_ID],
    })
    const saved = await savePastedProfiles(supabase, COMPANY_ID, pasteHtml, '')
    expect(saved.ok && saved.added).toBe(1)
    expect(saved.ok && saved.skipped).toBe(3)
    expect(saved.ok && saved.profiles.map((profile) => profile.full_name)).toEqual(['Alan Turing'])
    expect(calls.some((call) => call.table === 'profile_candidates')).toBe(false)
  })

  it('reports an empty paste without inserting', async () => {
    const { supabase, calls } = collectorMock({ company: { id: COMPANY_ID, name: 'Acme' } })
    const saved = await savePastedProfiles(supabase, COMPANY_ID, '', '')
    expect(saved).toEqual({ ok: true, added: 0, skipped: 0, empty: true, profiles: [] })
    expect(calls.some((call) => call.op === 'insert' || call.table === 'contacts')).toBe(false)
  })

  it('does not insert when the company is missing', async () => {
    const { supabase, calls } = collectorMock({ company: null })
    const saved = await savePastedProfiles(supabase, COMPANY_ID, pasteHtml, '')
    expect(saved).toMatchObject({ ok: false, status: 404 })
    expect(calls.some((call) => call.op === 'insert')).toBe(false)
  })

  it('points a contacts permission error at the migration', async () => {
    const { supabase } = collectorMock({
      company: { id: COMPANY_ID, name: 'Acme' },
      insertError: { code: '42501', message: 'new row violates row-level security policy for table "contacts"' },
    })
    const saved = await savePastedProfiles(supabase, COMPANY_ID, pasteHtml, '')
    expect(saved).toMatchObject({
      ok: false,
      status: 500,
      error: 'Apply supabase/collect_direct_to_contacts.sql in the Supabase SQL editor.',
    })
    expect(explainDbError({ code: '42501', message: 'permission denied for table contacts' })).toBe(
      'Apply supabase/collect_direct_to_contacts.sql in the Supabase SQL editor.',
    )
  })
})

describe('remove a collected contact', () => {
  it('deletes the contact row', async () => {
    const { supabase, calls } = collectorMock({ contactRow: { id: CONTACT_ID } })
    const deleted = await deleteCollectedContact(supabase, CONTACT_ID)
    expect(deleted).toEqual({ ok: true })
    expect(calls.filter((call) => call.table === 'contacts').map((call) => call.op)).toEqual(['select', 'delete'])
    expect(calls.some((call) => call.table === 'profile_candidates')).toBe(false)
  })

  it('returns not found when the contact is already gone', async () => {
    const { supabase, calls } = collectorMock({ contactRow: null })
    const deleted = await deleteCollectedContact(supabase, CONTACT_ID)
    expect(deleted).toEqual({ ok: false, error: 'Contact not found.', status: 404 })
    expect(calls.some((call) => call.op === 'delete')).toBe(false)
  })

  it('refuses to delete a contact that already has clicks', async () => {
    const { supabase } = collectorMock({
      contactRow: { id: CONTACT_ID },
      deleteError: { code: '23503', message: 'contacts is still referenced from clicks' },
    })
    const deleted = await deleteCollectedContact(supabase, CONTACT_ID)
    expect(deleted).toEqual({ ok: false, error: 'This contact is already in use.', status: 409 })
  })
})
