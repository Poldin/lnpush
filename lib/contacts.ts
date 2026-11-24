import { contactIsTechnical } from './classify'
import { parseCsv } from './csv'
import { normalizeLinkedInUrl } from './linkedin'
import type { Contact } from './types'

export function contactsFromCsv(text: string, technicalPattern: string): Contact[] {
  const contacts: Contact[] = []
  const seen = new Set<string>()

  for (const row of parseCsv(text)) {
    const name = clean(row.Nome ?? '')
    const linkedinUrl = normalizeLinkedInUrl(row.LinkedIn ?? '')
    if (!name || !linkedinUrl || seen.has(linkedinUrl)) continue
    seen.add(linkedinUrl)
    const group = clean(row.Gruppo ?? '')
    const tag = clean(row.Tag ?? '')
    contacts.push({
      id: linkedinUrl,
      name,
      role: clean(row.Ruolo ?? ''),
      company: clean(row.Azienda ?? ''),
      group,
      linkedinUrl,
      technical: contactIsTechnical(group, tag, technicalPattern),
    })
  }

  return contacts
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
