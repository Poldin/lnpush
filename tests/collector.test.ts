import { describe, expect, it } from 'vitest'

import { isCollectorAdmin } from '../lib/admin'
import {
  COLLECTOR_PAGE_OFFSETS,
  COLLECTOR_RESULT_TARGET,
  appendProfileHits,
  braveSearchUrl,
  contactName,
  explicitQueue,
  freshHits,
  normalizeCollectorUrl,
  parseIngestBody,
  parseLinkedInTitle,
  parseRunBody,
  planIngest,
  presentCompanyResults,
  runQueue,
  uncollectedCompanies,
  type CompanyRunResult,
} from '../lib/collector'
import { secretMatches } from '../lib/secret'
import { cleanGoogleUrl, googleSearchUrl, isGoogleBlock } from '../scripts/collect-local.mjs'

describe('LinkedIn title parsing', () => {
  it('splits name and headline and drops the LinkedIn suffix', () => {
    expect(parseLinkedInTitle('Ada Lovelace - Mathematician | LinkedIn')).toEqual({
      fullName: 'Ada Lovelace',
      headline: 'Mathematician',
    })
    expect(parseLinkedInTitle('Ada Lovelace | LinkedIn')).toEqual({ fullName: 'Ada Lovelace', headline: '' })
    expect(parseLinkedInTitle('Ada Lovelace – First programmer - LinkedIn')).toEqual({
      fullName: 'Ada Lovelace',
      headline: 'First programmer',
    })
    expect(parseLinkedInTitle('Ada Lovelace — Engineer | LinkedIn')).toEqual({
      fullName: 'Ada Lovelace',
      headline: 'Engineer',
    })
    expect(parseLinkedInTitle('  Ada   Lovelace  -  CEO at Acme  | LinkedIn  ')).toEqual({
      fullName: 'Ada Lovelace',
      headline: 'CEO at Acme',
    })
    expect(parseLinkedInTitle('Anne-Marie Curie - Engineer | LinkedIn').fullName).toBe('Anne-Marie Curie')
    expect(parseLinkedInTitle('')).toEqual({ fullName: '', headline: '' })
  })
})

describe('collector URL normalization', () => {
  it('lowercases the slug and drops query, hash, and trailing slash', () => {
    expect(normalizeCollectorUrl('https://www.linkedin.com/in/Jane-Doe/?trk=public')).toBe(
      'https://www.linkedin.com/in/jane-doe',
    )
    expect(normalizeCollectorUrl('https://it.linkedin.com/in/Jane-Doe/')).toBe('https://www.linkedin.com/in/jane-doe')
    expect(normalizeCollectorUrl('https://linkedin.com/in/jane-doe#about')).toBe('https://www.linkedin.com/in/jane-doe')
    expect(normalizeCollectorUrl('https://www.linkedin.com/in/Jane-Doe/en')).toBe('https://www.linkedin.com/in/jane-doe')
    expect(normalizeCollectorUrl('https://it.linkedin.com/in/Miha-%C5%A0kof/?trk=1')).toBe(
      `https://www.linkedin.com/in/${encodeURIComponent('miha-škof').toLowerCase()}`,
    )
    expect(normalizeCollectorUrl('https://www.linkedin.com/company/acme')).toBeNull()
    expect(normalizeCollectorUrl('')).toBeNull()
    expect(normalizeCollectorUrl('https://example.com/in/jane')).toBeNull()
  })
})

describe('ingest planning', () => {
  it('keeps profile urls, ignores the rest, and dedupes', () => {
    const hits = planIngest(
      [
        { title: 'Ada Lovelace - Engineer | LinkedIn', url: 'https://www.linkedin.com/in/Ada-Lovelace/?trk=1', snippet: 'Engineer at Acme', rank: 2 },
        { title: 'Company page | LinkedIn', url: 'https://www.linkedin.com/company/acme', snippet: 'no', rank: 1 },
        { title: 'Ada again | LinkedIn', url: 'https://it.linkedin.com/in/ada-lovelace/', snippet: 'dup', rank: 3 },
        { title: 'Grace Hopper - Admiral | LinkedIn', url: 'https://www.linkedin.com/in/grace', snippet: 'Known', rank: 4 },
      ],
      new Set(['https://www.linkedin.com/in/grace']),
      new Set(['https://www.linkedin.com/in/ada-lovelace']),
    )
    expect(hits.map((hit) => hit.linkedin_url)).toEqual([
      'https://www.linkedin.com/in/ada-lovelace',
      'https://www.linkedin.com/in/grace',
    ])
    expect(hits[0]).toMatchObject({ full_name: 'Ada Lovelace', headline: 'Engineer', already_candidate: true, rank: 2 })
    expect(hits[1]?.already_in_contacts).toBe(true)
    expect(freshHits(hits)).toEqual([])
  })

  it('parses an ingest body and rejects a mix of run modes', () => {
    const parsed = parseIngestBody({
      company: '  Acme  ',
      source_query: 'site:linkedin.com/in "Acme"',
      results: [{ title: 'A', url: 'https://www.linkedin.com/in/a', snippet: 's', rank: 1 }],
    })
    expect(parsed.ok && parsed.value.dryRun).toBe(false)
    expect(parsed.ok && parsed.value.company).toBe('Acme')
    expect(parseRunBody({ company: 'Acme', next: 2 }).ok).toBe(false)
    const run = parseRunBody({ next: 3, save: true, limit: 60 })
    expect(run.ok && run.value).toMatchObject({ mode: { type: 'next', count: 3 }, save: true, force: false, limit: 60 })
  })
})

describe('company queue', () => {
  const runs = [
    { company: 'Old', lastRunAt: '2026-01-01T00:00:00.000Z' },
    { company: 'New', lastRunAt: '2026-11-01T00:00:00.000Z' },
  ]

  it('returns only companies that have not been collected', () => {
    expect(uncollectedCompanies(['New', 'Beta', 'Alfa', 'Old'], runs)).toEqual(['Alfa', 'Beta'])
    expect(uncollectedCompanies(['Beta', 'Alfa'], runs).slice(0, 1)).toEqual(['Alfa'])
  })

  it('skips a collected company unless force is set', () => {
    const map = new Map(runs.map((run) => [run.company, run.lastRunAt]))
    expect(explicitQueue(['Old', 'Beta', 'Old'], map, false)).toEqual({ queue: ['Beta'], skipped: ['Old'] })
    expect(explicitQueue(['Old'], map, true).queue).toEqual(['Old'])
  })
})

describe('Brave run chunking', () => {
  it('asks Brave for 20 results on offsets 0, 1 and 2', () => {
    expect(COLLECTOR_RESULT_TARGET).toBe(60)
    expect(COLLECTOR_PAGE_OFFSETS).toEqual([0, 1, 2])
    const url = new URL(braveSearchUrl('site:linkedin.com/in "Acme"', 1))
    expect(url.searchParams.get('count')).toBe('20')
    expect(url.searchParams.get('offset')).toBe('1')
  })

  it('stops at the unique profile limit and flags known urls', () => {
    const page = Array.from({ length: 5 }, (_, index) => ({
      title: `Person ${index} - Role | LinkedIn`,
      url: index === 1 ? 'https://www.linkedin.com/in/Person-0/?trk=1' : `https://linkedin.com/in/person-${index}`,
      description: 'snippet',
    }))
    page.push({ title: 'Co | LinkedIn', url: 'https://www.linkedin.com/company/acme', description: 'no' })
    const hits = appendProfileHits([], page, 3, new Set(['https://www.linkedin.com/in/person-2']), new Set())
    expect(hits).toHaveLength(3)
    expect(hits.map((hit) => hit.linkedin_url)).toEqual([
      'https://www.linkedin.com/in/person-0',
      'https://www.linkedin.com/in/person-2',
      'https://www.linkedin.com/in/person-3',
    ])
    expect(hits[1]?.already_in_contacts).toBe(true)
  })

  it('returns the companies that do not fit in the time budget', async () => {
    let now = 0
    const persisted: string[] = []
    const chunk = await runQueue({
      queue: ['A', 'B', 'C', 'D'],
      startedAt: 0,
      now: () => now,
      budgetMs: 250_000,
      reserveMs: 40_000,
      save: true,
      search: async (company) => {
        now += 120_000
        return { queries_used: 3, hits: [], query: company }
      },
      persist: async (company) => {
        persisted.push(company)
        return 4
      },
    })
    expect(chunk.results.map((row) => row.company)).toEqual(['A', 'B'])
    expect(chunk.results[0]?.saved).toBe(4)
    expect(chunk.remaining).toEqual(['C', 'D'])
    expect(persisted).toEqual(['A', 'B'])
  })

  it('does not save a dry run and keeps the failed company in remaining', async () => {
    const persisted: string[] = []
    const dry = await runQueue({
      queue: ['A'],
      startedAt: 0,
      now: () => 0,
      budgetMs: 250_000,
      reserveMs: 40_000,
      save: false,
      search: async () => ({ queries_used: 1, hits: [], query: 'q' }),
      persist: async (company) => {
        persisted.push(company)
        return 1
      },
    })
    expect(dry.results[0]?.saved).toBe(0)
    expect(persisted).toEqual([])

    const failed = await runQueue({
      queue: ['A', 'B', 'C'],
      startedAt: 0,
      now: () => 0,
      budgetMs: 250_000,
      reserveMs: 40_000,
      save: false,
      search: async (company) => {
        if (company === 'B') throw new Error('Brave Search returned 429.')
        return { queries_used: 1, hits: [], query: company }
      },
    })
    expect(failed.ok).toBe(false)
    expect(failed.results.map((row) => row.company)).toEqual(['A'])
    expect(failed.remaining).toEqual(['B', 'C'])
  })

  it('omits profile arrays when more than five companies are returned', () => {
    const rows: CompanyRunResult[] = Array.from({ length: 6 }, (_, index) => ({
      company: `C${index}`,
      queries_used: 1,
      count: 1,
      saved: 1,
      results: [],
    }))
    expect(presentCompanyResults(rows, false).every((row) => !('results' in row))).toBe(true)
    expect(presentCompanyResults(rows, true)[0]?.results).toEqual([])
    expect(presentCompanyResults(rows.slice(0, 5), false)[0]?.results).toEqual([])
  })
})

describe('local Google script helpers', () => {
  it('builds six pages of ten results and detects a block page', () => {
    const second = new URL(googleSearchUrl('Acme "Quoted"', 2))
    expect(second.searchParams.get('start')).toBe('10')
    expect(second.searchParams.get('num')).toBe('10')
    expect(second.searchParams.get('q')).toBe('site:linkedin.com/in "Acme Quoted"')
    expect(new URL(googleSearchUrl('Acme', 6)).searchParams.get('start')).toBe('50')
    expect(cleanGoogleUrl('https://www.google.com/url?q=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fjane-doe%2F%3Ftrk%3D1&sa=U')).toBe(
      'https://www.linkedin.com/in/jane-doe/?trk=1',
    )
    expect(isGoogleBlock('https://www.google.com/sorry/index', '')).toBe(true)
    expect(isGoogleBlock('https://www.google.com/search', 'Our systems have detected unusual traffic from your computer network.')).toBe(true)
    expect(isGoogleBlock('https://www.google.com/search?q=site%3Alinkedin.com', 'Ada Lovelace - Engineer')).toBe(false)
  })
})

describe('admin and secret', () => {
  it('recognizes Paolo and the admin email', () => {
    expect(isCollectorAdmin({ name: 'Andrea', email: 'a@x.it' }, { email: 'a@x.it' })).toBe(false)
    expect(isCollectorAdmin({ name: 'Paolo', email: 'other@x.it' }, { email: 'other@x.it' })).toBe(true)
    expect(isCollectorAdmin({ name: 'Andrea', email: 'OloApiccoli@gmail.com' }, { email: 'someone@else.test' })).toBe(true)
  })

  it('compares the bearer token in constant time', () => {
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abc', 'abd')).toBe(false)
    expect(secretMatches('abc', 'abcd')).toBe(false)
  })

  it('builds a contact name from the slug when the title had none', () => {
    expect(contactName(null, 'https://www.linkedin.com/in/ada-lovelace')).toBe('Ada Lovelace')
  })
})
