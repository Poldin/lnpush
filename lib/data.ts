import { readFileSync } from 'node:fs'
import path from 'node:path'

import { planAssignments } from './assignment'
import { assertPattern } from './classify'
import { contactsFromCsv } from './contacts'
import { isIsoDate, splitItalianDate, todayIso } from './dates'
import type { Dataset, Plan, PlanConfig, TeamMember } from './types'

const DEFAULTS = {
  cardsPerDay: 5,
  cooldownDays: 12,
  maxMembersPerContact: 3,
  startDate: '2026-11-24',
  timezone: 'Europe/Rome',
  affinityEnabled: true,
  technicalGroupPattern: 'tecnic',
  followGroupPattern: '^decisore',
}

export function loadDataset(): Dataset {
  const directory = path.join(process.cwd(), 'data')
  const config = loadConfig(readJson(path.join(directory, 'config.json')))
  const team = teamFromJson(readJson(path.join(directory, 'team.json')))
  const contacts = contactsFromCsv(readText(path.join(directory, 'contacts.csv')), config.technicalGroupPattern)
  return { contacts, team, config }
}

export function buildTodayPlan(dataset: Dataset, isoDate = todayIso(dataset.config.timezone)): Plan {
  const { contacts, team, config } = dataset
  const dateParts = splitItalianDate(isoDate)
  const beforeStart = isoDate < config.startDate
  const todays = beforeStart
    ? []
    : planAssignments(contacts, team, config, isoDate).filter((item) => item.date === isoDate)
  const byId = new Map(contacts.map((contact) => [contact.id, contact]))
  const cardsByMember: Plan['cardsByMember'] = {}

  for (const member of team) cardsByMember[member.id] = []

  for (const item of todays) {
    const contact = byId.get(item.contactId)
    const bucket = cardsByMember[item.memberId]
    if (!contact || !bucket) continue
    bucket.push({
      id: contact.id,
      name: contact.name,
      role: contact.role,
      company: contact.company,
      linkedinUrl: contact.linkedinUrl,
    })
  }

  for (const cards of Object.values(cardsByMember)) {
    cards.sort((left, right) => left.company.localeCompare(right.company, 'it') || left.name.localeCompare(right.name, 'it'))
  }

  return {
    isoDate,
    timezone: config.timezone,
    weekday: dateParts.weekday,
    day: dateParts.day,
    monthYear: dateParts.monthYear,
    beforeStart,
    startLabel: splitItalianDate(config.startDate).full,
    cooldownDays: config.cooldownDays,
    maxMembersPerContact: config.maxMembersPerContact,
    members: team.map((member) => ({ id: member.id, name: member.name })),
    cardsByMember,
  }
}

export function loadPlan(): Plan {
  return buildTodayPlan(loadDataset())
}

function loadConfig(raw: unknown): PlanConfig {
  const record = asRecord(raw, 'config.json deve essere un oggetto.')
  const config: PlanConfig = {
    cardsPerDay: integer(record.cardsPerDay, 'cardsPerDay', 1, 30, DEFAULTS.cardsPerDay),
    cooldownDays: integer(record.cooldownDays, 'cooldownDays', 0, 365, DEFAULTS.cooldownDays),
    maxMembersPerContact: integer(record.maxMembersPerContact, 'maxMembersPerContact', 1, 20, DEFAULTS.maxMembersPerContact),
    startDate: typeof record.startDate === 'string' ? record.startDate : DEFAULTS.startDate,
    timezone: typeof record.timezone === 'string' && record.timezone.trim() ? record.timezone.trim() : DEFAULTS.timezone,
    affinityEnabled: boolean(record.affinityEnabled, 'affinityEnabled', DEFAULTS.affinityEnabled),
    technicalGroupPattern:
      typeof record.technicalGroupPattern === 'string' ? record.technicalGroupPattern : DEFAULTS.technicalGroupPattern,
    followGroupPattern:
      typeof record.followGroupPattern === 'string' ? record.followGroupPattern : DEFAULTS.followGroupPattern,
  }
  if (!isIsoDate(config.startDate)) {
    throw new Error('startDate non è valida. Usa il formato YYYY-MM-DD.')
  }
  assertPattern(config.technicalGroupPattern, 'technicalGroupPattern')
  assertPattern(config.followGroupPattern, 'followGroupPattern')
  todayIso(config.timezone)
  return config
}

export function teamFromJson(raw: unknown): TeamMember[] {
  const list = Array.isArray(raw)
    ? raw
    : asRecord(raw, 'team.json deve contenere "members", un elenco di persone.').members
  if (!Array.isArray(list)) {
    throw new Error('team.json deve contenere "members", un elenco di persone.')
  }

  const seen = new Set<string>()
  return list.map((entry) => {
    const member = asRecord(entry, 'Ogni persona del team ha bisogno di id e name.')
    const id = typeof member.id === 'string' ? member.id.trim() : ''
    const name = typeof member.name === 'string' ? member.name.trim() : ''
    if (!id || !name) throw new Error('Ogni persona del team ha bisogno di id e name.')
    if (seen.has(id)) throw new Error(`Id duplicato nel team: ${id}.`)
    seen.add(id)
    if (member.technical !== undefined && typeof member.technical !== 'boolean') {
      throw new Error(`technical di ${name} deve essere true o false.`)
    }
    return { id, name, technical: member.technical === true }
  })
}

function integer(value: unknown, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} deve essere un intero tra ${min} e ${max}.`)
  }
  return value
}

function boolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${label} deve essere true o false.`)
  return value
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readText(file))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('File mancante')) throw error
    throw new Error(`Impossibile leggere data/${path.basename(file)}. Controlla che sia JSON valido.`)
  }
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    throw new Error(`File mancante: data/${path.basename(file)}.`)
  }
}
