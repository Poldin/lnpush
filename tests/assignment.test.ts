import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { planAssignments } from '../lib/assignment'
import { suggestAction } from '../lib/classify'
import { contactsFromCsv } from '../lib/contacts'
import { parseCsv } from '../lib/csv'
import { loadDataset, buildTodayPlan } from '../lib/data'
import { addDays, daysBetween, todayIso } from '../lib/dates'
import { requestIsSecure } from '../lib/auth'
import { hash32 } from '../lib/hash'
import { normalizeLinkedInUrl } from '../lib/linkedin'
import type { Contact, PlanConfig, TeamMember } from '../lib/types'

function member(id: string, technical = false): TeamMember {
  return { id, name: id, technical }
}

function contact(id: string, technical = false): Contact {
  return {
    id,
    name: id,
    role: 'Ruolo',
    company: 'Azienda',
    group: technical ? 'Valutatore tecnico' : 'Utente',
    linkedinUrl: `https://www.linkedin.com/in/${id}`,
    technical,
  }
}

function config(overrides: Partial<PlanConfig> = {}): PlanConfig {
  return {
    cardsPerDay: 5,
    cooldownDays: 12,
    maxMembersPerContact: 3,
    startDate: '2026-01-01',
    timezone: 'Europe/Rome',
    affinityEnabled: false,
    technicalGroupPattern: 'tecnic',
    followGroupPattern: '^decisore',
    ...overrides,
  }
}

function expectRules(assignments: { date: string; contactId: string; memberId: string }[], rules: PlanConfig) {
  const perDayContact = new Set<string>()
  const perDayMember = new Map<string, number>()
  const perContact = new Map<string, { dates: string[]; members: Set<string> }>()

  for (const item of assignments) {
    const dayContact = `${item.date}\0${item.contactId}`
    expect(perDayContact.has(dayContact), `stesso giorno duplicato: ${item.contactId} ${item.date}`).toBe(false)
    perDayContact.add(dayContact)
    const dayMember = `${item.date}\0${item.memberId}`
    perDayMember.set(dayMember, (perDayMember.get(dayMember) ?? 0) + 1)

    const bucket = perContact.get(item.contactId) ?? { dates: [], members: new Set<string>() }
    bucket.dates.push(item.date)
    bucket.members.add(item.memberId)
    perContact.set(item.contactId, bucket)
  }

  for (const count of perDayMember.values()) {
    expect(count).toBeLessThanOrEqual(rules.cardsPerDay)
  }

  for (const [contactId, bucket] of perContact) {
    expect(bucket.members.size, contactId).toBeLessThanOrEqual(rules.maxMembersPerContact)
    expect(bucket.members.size, `profilo ripetuto alla stessa persona: ${contactId}`).toBe(bucket.dates.length)
    const dates = [...bucket.dates].sort()
    for (let index = 1; index < dates.length; index += 1) {
      expect(daysBetween(dates[index - 1] ?? '', dates[index] ?? '')).toBeGreaterThanOrEqual(rules.cooldownDays)
    }
  }
}

describe('date helpers', () => {
  it('counts calendar days in UTC, including across a DST weekend', () => {
    expect(daysBetween('2026-01-01', '2026-01-13')).toBe(12)
    expect(daysBetween('2026-01-31', '2026-02-12')).toBe(12)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-11-24', 12)).toBe('2026-12-06')
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('uses the Rome calendar day', () => {
    expect(todayIso('Europe/Rome', new Date('2026-11-24T22:30:00Z'))).toBe('2026-11-24')
    expect(todayIso('Europe/Rome', new Date('2026-11-24T23:30:00Z'))).toBe('2026-11-25')
  })

  it('hashes a known FNV-1a vector', () => {
    expect(hash32('a')).toBe(0xe40c292c)
  })

  it('marks the auth cookie secure only on https', () => {
    expect(requestIsSecure(new Request('http://localhost/api/login'))).toBe(false)
    expect(requestIsSecure(new Request('https://oggi.example/api/login'))).toBe(true)
    expect(
      requestIsSecure(new Request('http://internal/api/login', { headers: { 'x-forwarded-proto': 'https' } })),
    ).toBe(true)
  })
})

describe('contacts file', () => {
  it('parses quoted commas and keeps only personal LinkedIn URLs', () => {
    const csv = [
      'Azienda,Nome,Ruolo,Gruppo,LinkedIn,Fonte,Affidabilita,Ruolo verificato,Note',
      'AVL List,Lukas Walter,"CEO, Management Board",Decisore,,https://example.com,alta,sì,niente profilo',
      'AVL List,Patrick Schatz,"Head, e-axle",Decisore tecnico,https://linkedin.com/in/patrick,https://linkedin.com/in/patrick,alta,sì,',
      'Elaphe,Miha Škof,"CAE, termico",Valutatore tecnico,https://linkedin.com/in/miha-%C5%A1kof-1,fonte,alta,sì,',
      'CISSOID,Nessuno,Ruolo,Utente,https://www.linkedin.com/company/cissoid,fonte,alta,sì,',
    ].join('\n')
    const contacts = contactsFromCsv(csv, 'tecnic')
    expect(contacts.map((item) => item.name)).toEqual(['Patrick Schatz', 'Miha Škof'])
    expect(contacts[0]).toMatchObject({
      role: 'Head, e-axle',
      technical: true,
      linkedinUrl: 'https://www.linkedin.com/in/patrick',
    })
    expect(contacts[1]?.linkedinUrl).toBe('https://www.linkedin.com/in/miha-%C5%A1kof-1')
    expect(parseCsv('Nome,Nota\n"Rossi, Anna","ha detto ""ciao"""\n')).toEqual([
      { Nome: 'Rossi, Anna', Nota: 'ha detto "ciao"' },
    ])
  })

  it('normalizes profile links and drops other URLs', () => {
    expect(normalizeLinkedInUrl('https://linkedin.com/in/patrick-schatz-aaa32b157')).toBe(
      'https://www.linkedin.com/in/patrick-schatz-aaa32b157',
    )
    expect(normalizeLinkedInUrl('https://linkedin.com/in/miha-%C5%A1kof-198b42b1')).toBe(
      'https://www.linkedin.com/in/miha-%C5%A1kof-198b42b1',
    )
    expect(normalizeLinkedInUrl('')).toBeNull()
    expect(normalizeLinkedInUrl('https://www.linkedin.com/company/cissoid')).toBeNull()
    expect(normalizeLinkedInUrl('https://example.com/in/someone')).toBeNull()
  })

  it('suggests Segui for decision-makers and Collegati otherwise', () => {
    expect(suggestAction('Decisore', '^decisore')).toBe('Segui')
    expect(suggestAction('Decisore tecnico', '^decisore')).toBe('Segui')
    expect(suggestAction('Valutatore tecnico', '^decisore')).toBe('Collegati')
    expect(suggestAction('Champion', '^decisore')).toBe('Collegati')
  })
})

describe('assignment rules', () => {
  it('gives a contact to one person per day, waits out the cooldown, and stops at 3 people', () => {
    const rules = config({ cardsPerDay: 5, cooldownDays: 12, maxMembersPerContact: 3 })
    const plan = planAssignments(
      [contact('only')],
      [member('m1'), member('m2'), member('m3'), member('m4')],
      rules,
      '2026-03-15',
    )
    expect(plan.map((item) => item.date)).toEqual(['2026-01-01', '2026-01-13', '2026-01-25'])
    expect(new Set(plan.map((item) => item.memberId)).size).toBe(3)
    expectRules(plan, rules)
  })

  it('never repeats a contact on the same day, even with cooldown 0 and spare capacity', () => {
    const rules = config({ cardsPerDay: 5, cooldownDays: 0, maxMembersPerContact: 3, startDate: '2026-05-01' })
    const oneDay = planAssignments([contact('only')], [member('m1'), member('m2'), member('m3')], rules, '2026-05-01')
    expect(oneDay).toHaveLength(1)

    const twoDays = planAssignments([contact('only')], [member('m1'), member('m2'), member('m3')], rules, '2026-05-02')
    expect(twoDays.map((item) => item.date)).toEqual(['2026-05-01', '2026-05-02'])
    expect(twoDays[0]?.memberId).not.toBe(twoDays[1]?.memberId)
    expectRules(twoDays, rules)
  })

  it('caps each person at cardsPerDay and keeps the day disjoint', () => {
    const rules = config({ cardsPerDay: 5, startDate: '2026-04-01' })
    const roster = Array.from({ length: 20 }, (_, index) => contact(`c${index}`))
    const plan = planAssignments(roster, [member('a'), member('b')], rules, '2026-04-01')
    expect(plan.filter((item) => item.memberId === 'a')).toHaveLength(5)
    expect(plan.filter((item) => item.memberId === 'b')).toHaveLength(5)
    expect(new Set(plan.map((item) => item.contactId)).size).toBe(10)
    expectRules(plan, rules)
  })

  it('prefers a technical contact for a technical teammate', () => {
    const rules = config({ cardsPerDay: 1, affinityEnabled: true, startDate: '2026-06-01' })
    const plan = planAssignments(
      [contact('t1', true), contact('n1'), contact('n2'), contact('n3')],
      [member('tech', true)],
      rules,
      '2026-06-01',
    )
    expect(plan.map((item) => item.contactId)).toEqual(['t1'])
  })

  it('keeps non-technical contacts for non-technical teammates while both pools have people', () => {
    const rules = config({ cardsPerDay: 2, affinityEnabled: true, startDate: '2026-06-02' })
    const plan = planAssignments(
      [contact('t1', true), contact('t2', true), contact('n1'), contact('n2'), contact('n3')],
      [member('sales', false)],
      rules,
      '2026-06-02',
    )
    expect(plan.map((item) => item.contactId).every((id) => id.startsWith('n'))).toBe(true)
    expect(plan).toHaveLength(2)
  })

  it('fills from the other pool when the preferred one is empty', () => {
    const rules = config({ cardsPerDay: 2, affinityEnabled: true, startDate: '2026-06-03' })
    const plan = planAssignments(
      [contact('n1'), contact('n2')],
      [member('tech', true)],
      rules,
      '2026-06-03',
    )
    expect(plan).toHaveLength(2)
  })

  it('ignores contacts without a LinkedIn URL', () => {
    const rules = config({ startDate: '2026-07-01' })
    const plan = planAssignments([{ ...contact('ghost'), linkedinUrl: '' }], [member('a')], rules, '2026-07-01')
    expect(plan).toEqual([])
  })

  it('is deterministic', () => {
    const rules = config()
    const roster = [contact('a', true), contact('b'), contact('c', true)]
    const team = [member('paolo', true), member('andrea')]
    expect(planAssignments(roster, team, rules, '2026-02-01')).toEqual(planAssignments(roster, team, rules, '2026-02-01'))
  })

  it('holds on the shipped contacts, team and config', () => {
    const dataset = loadDataset()
    expect(dataset.contacts.length).toBeGreaterThan(0)
    expect(dataset.contacts.every((item) => item.linkedinUrl.startsWith('https://www.linkedin.com/in/'))).toBe(true)

    const horizon = addDays(dataset.config.startDate, 180)
    const plan = planAssignments(dataset.contacts, dataset.team, dataset.config, horizon)
    expectRules(plan, dataset.config)

    if (dataset.config.cooldownDays > 0) {
      const firstDay = new Set(
        planAssignments(dataset.contacts, dataset.team, dataset.config, dataset.config.startDate).map((item) => item.contactId),
      )
      const next = addDays(dataset.config.startDate, 1)
      const second = plan.filter((item) => item.date === next)
      for (const item of second) expect(firstDay.has(item.contactId)).toBe(false)
    }

    const opening = buildTodayPlan(dataset, dataset.config.startDate)
    const flat = Object.values(opening.cardsByMember).flat()
    expect(new Set(flat.map((card) => card.id)).size).toBe(flat.length)
    for (const member of dataset.team) {
      expect(opening.cardsByMember[member.id]?.length ?? 0).toBeLessThanOrEqual(dataset.config.cardsPerDay)
    }

    const csv = readFileSync(path.join(process.cwd(), 'data/contacts.csv'), 'utf8')
    expect(csv).toContain('Patrick Schatz')
    expect(contactsFromCsv(csv, dataset.config.technicalGroupPattern)).toHaveLength(dataset.contacts.length)
  })
})
