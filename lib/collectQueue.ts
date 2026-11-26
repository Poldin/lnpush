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

export const GOOGLE_RESULTS_PER_PAGE = 10
export const MIN_GOOGLE_PAGES = 1
export const MAX_GOOGLE_PAGES = 10
export const DEFAULT_GOOGLE_PAGES = 5
export const GOOGLE_PAGE_PRESETS = [1, 3, 5] as const
export const GOOGLE_PAGES_STORAGE_KEY = 'lnpush.collect.pages.v1'

/**
 * Size and position, plus `noopener,noreferrer`.
 * Chrome and Firefox return null from `window.open` when `noopener` or
 * `noreferrer` is set, even if the window opened, so the live opener uses
 * {@link googleWindowSizeFeatures} and then sets `opener` to null.
 */
export const GOOGLE_WINDOW_FEATURES = 'width=1200,height=900,left=80,top=60,noopener,noreferrer'

export const PASTE_KEYBOARD_HINT =
  'Ctrl+A → Ctrl+C → Ctrl+W on each Google window, then Ctrl+V here. Ctrl+Enter or ⌘+Enter for Done → Next company.'

export function clampGooglePages(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return DEFAULT_GOOGLE_PAGES
  return Math.min(MAX_GOOGLE_PAGES, Math.max(MIN_GOOGLE_PAGES, Math.round(parsed)))
}

export function readStoredGooglePages(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_GOOGLE_PAGES
  return clampGooglePages(raw)
}

export function googleResultStart(page: number): number {
  const index = Number.isFinite(page) ? Math.floor(page) : 1
  return (Math.max(1, index) - 1) * GOOGLE_RESULTS_PER_PAGE
}

export function googleSearchHref(query: string, page = 1): string {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('q', query)
  url.searchParams.set('start', String(googleResultStart(page)))
  url.searchParams.set('hl', 'en')
  return url.toString()
}

/** Highest page first, so page 1 is opened last and sits on top of the stack. */
export function googleSearchWindowHrefs(query: string, pages: number): string[] {
  const count = clampGooglePages(pages)
  const hrefs: string[] = []
  for (let page = count; page >= 1; page -= 1) hrefs.push(googleSearchHref(query, page))
  return hrefs
}

export function googleWindowSizeFeatures(): string {
  return GOOGLE_WINDOW_FEATURES.split(',')
    .filter((part) => part !== 'noopener' && part !== 'noreferrer')
    .join(',')
}

export function googlePagesCaption(pages: number): string {
  const count = clampGooglePages(pages)
  if (count === 1) return 'Opens 1 window.'
  return `Opens ${count} windows, highest page first so page 1 stays on top.`
}

export function popupBlockedMessage(): string {
  return 'Your browser blocked the extra Google windows. Allow pop-ups for this site once in the address bar so they all open together next time.'
}

export type PopupHandle = {
  opener: unknown
}

export type PopupOpener = (url: string, target: string, features: string) => PopupHandle | null

/**
 * Opens each URL in its own window, highest page first.
 * `window.open(url, '_blank', GOOGLE_WINDOW_FEATURES)` is what we want, but
 * Chrome and Firefox return null whenever `noopener` or `noreferrer` is in
 * the feature string — even when the window opened — so a null check could
 * not tell a popup block from a success. This passes the same width, height,
 * left, and top, then sets `opener` to null (noopener). A null return after
 * the first window is a real popup block.
 */
export function openGoogleWindows(urls: readonly string[], open: PopupOpener): { opened: number; blocked: boolean } {
  let opened = 0
  let blocked = false
  const features = googleWindowSizeFeatures()
  urls.forEach((url, index) => {
    const handle = open(url, '_blank', features)
    if (!handle) {
      if (index > 0) blocked = true
      return
    }
    try {
      handle.opener = null
    } catch {
      // A sealed window is already isolated from this page.
    }
    opened += 1
  })
  return { opened, blocked }
}

export function shouldRefocusPaste(
  target: { tagName?: string; isContentEditable?: boolean } | null,
  isPasteZone = false,
): boolean {
  if (!target || isPasteZone) return true
  if (target.isContentEditable) return false
  const tag = (target.tagName ?? '').toUpperCase()
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT'
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
