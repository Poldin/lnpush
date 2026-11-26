import { cleanText } from './collector'

export type CompanyStatus = 'pending' | 'done'

export type QueueCompany = {
  id: string
  name: string
  status: CompanyStatus
  createdAt: string
  completedAt: string | null
  profiles: number
}

export type QueueProgress = {
  pending: number
  done: number
}

export type SearchPreset = {
  id: string
  label: string
  keywords: string
}

export const SEARCH_PRESETS: SearchPreset[] = [
  { id: 'all', label: 'All profiles', keywords: '' },
  {
    id: 'engineering',
    label: 'Engineering / R&D',
    keywords: '("engineer" OR "engineering" OR "R&D" OR "research" OR "developer")',
  },
  {
    id: 'leadership',
    label: 'Leadership / VP / Director',
    keywords: '("VP" OR "vice president" OR "director" OR "head of" OR "chief" OR "CEO" OR "CTO")',
  },
  {
    id: 'procurement',
    label: 'Procurement / Operations',
    keywords: '("procurement" OR "purchasing" OR "operations" OR "supply chain" OR "buyer")',
  },
  {
    id: 'sales',
    label: 'Sales / Commercial',
    keywords: '("sales" OR "commercial" OR "business development" OR "account manager")',
  },
]

export function companyGoogleQuery(company: string, keywords?: string): string {
  const name = cleanText(company).replace(/"/g, '')
  const base = `site:linkedin.com/in "${name}"`
  const extra = cleanText(keywords ?? '')
  return extra ? `${base} ${extra}` : base
}

export function googleSearchHref(query: string): string {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('hl', 'en')
  return url.toString()
}

export function parseCompanyLines(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const name = cleanText(line)
    if (!name || name.length > 200) continue
    const key = name.toLocaleLowerCase('en')
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

export function nextPendingAfter(companies: { id: string; status: CompanyStatus }[], currentId: string): string | null {
  const pending = companies.filter((company) => company.status === 'pending')
  const index = pending.findIndex((company) => company.id === currentId)
  if (index === -1) return pending[0]?.id ?? null
  return pending[index + 1]?.id ?? pending.find((company) => company.id !== currentId)?.id ?? null
}

export function pasteFeedback(added: number, skipped: number, empty: boolean): string {
  if (empty) return 'No LinkedIn profiles found in that paste.'
  const profiles = added === 1 ? '1 new profile' : `${added} new profiles`
  if (skipped <= 0) return `Added ${profiles}`
  const duplicates = skipped === 1 ? '1 duplicate skipped' : `${skipped} duplicates skipped`
  return `Added ${profiles} · ${duplicates}`
}

export function importFeedback(added: number, skipped: number): string {
  const companies = added === 1 ? '1 company' : `${added} companies`
  if (skipped <= 0) return `Added ${companies}`
  const duplicates = skipped === 1 ? '1 duplicate skipped' : `${skipped} duplicates skipped`
  return `Added ${companies} · ${duplicates}`
}
