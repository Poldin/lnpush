import { cleanText, contactName, normalizeCollectorUrl } from './collector'
import type { PasteParse, ParsedProfile } from './googlePaste'

export const PASTE_CONTACT_LIMIT = 100

export type ContactDraft = {
  company: string
  full_name: string
  role: string | null
  linkedin_url: string
  active: true
}

export type SavedProfile = {
  id: string
  full_name: string
  headline: string | null
  linkedin_url: string
}

export function contactDraftsFromPaste(
  company: string,
  parsed: PasteParse,
  existingUrls: ReadonlySet<string>,
): { drafts: ContactDraft[]; skipped: number } {
  const companyName = cleanText(company)
  let skipped = parsed.duplicates
  const drafts: ContactDraft[] = []
  const seen = new Set<string>()
  for (const profile of parsed.profiles) {
    const linkedinUrl = normalizeCollectorUrl(profile.linkedin_url)
    if (!linkedinUrl || existingUrls.has(linkedinUrl) || seen.has(linkedinUrl)) {
      skipped += 1
      continue
    }
    if (drafts.length >= PASTE_CONTACT_LIMIT) continue
    seen.add(linkedinUrl)
    drafts.push(contactDraft(companyName, profile, linkedinUrl))
  }
  return { drafts, skipped }
}

function contactDraft(company: string, profile: ParsedProfile, linkedinUrl: string): ContactDraft {
  return {
    company,
    full_name: contactName(profile.full_name, linkedinUrl),
    role: cleanText(profile.headline ?? '') || null,
    linkedin_url: linkedinUrl,
    active: true,
  }
}

export function savedProfile(id: string, draft: ContactDraft): SavedProfile {
  return {
    id,
    full_name: draft.full_name,
    headline: draft.role,
    linkedin_url: draft.linkedin_url,
  }
}

export function countsByCompanyName(rows: { company: string | null }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const company = cleanText(row.company ?? '').toLocaleLowerCase('en')
    if (!company) continue
    counts.set(company, (counts.get(company) ?? 0) + 1)
  }
  return counts
}

export function profileCountForCompany(name: string, counts: ReadonlyMap<string, number>): number {
  return counts.get(cleanText(name).toLocaleLowerCase('en')) ?? 0
}
