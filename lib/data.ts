import { readFileSync } from 'node:fs'
import path from 'node:path'

import { clickIndex, planAssignments, queueForMember } from './assignment'
import { assertPattern } from './classify'
import { isIsoDate, splitDate, todayIso } from './dates'
import type { CardView, ContactLabel, Dataset, HomeView, Plan, PlanConfig } from './types'

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

export function loadConfigFile(): PlanConfig {
  return loadConfig(readJson(path.join(process.cwd(), 'data', 'config.json')))
}

export function buildTodayPlan(dataset: Dataset, isoDate = todayIso(dataset.config.timezone)): Plan {
  const { contacts, team, config } = dataset
  const dateParts = splitDate(isoDate)
  const beforeStart = isoDate < config.startDate
  const todays = beforeStart
    ? []
    : planAssignments(contacts, team, config, isoDate, clickIndex(dataset.clicks ?? [])).filter((item) => item.date === isoDate)
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
    startLabel: splitDate(config.startDate).full,
    cooldownDays: config.cooldownDays,
    maxMembersPerContact: config.maxMembersPerContact,
    members: team.map((member) => ({ id: member.id, name: member.name })),
    cardsByMember,
  }
}

export function queueCards(dataset: Dataset, memberId: string, isoDate: string): CardView[] {
  const clicks = clickIndex(dataset.clicks ?? [])
  return queueForMember(dataset.contacts, dataset.team, dataset.config, isoDate, memberId, clicks).map((contact) => ({
    id: contact.id,
    name: contact.name,
    role: contact.role,
    company: contact.company,
    linkedinUrl: contact.linkedinUrl,
  }))
}

export function homeForMember(
  plan: Plan,
  memberId: string,
  openedContactIds: string[] = [],
  contactLabels: Record<string, ContactLabel> = {},
): HomeView {
  const member = plan.members.find((item) => item.id === memberId)
  const opened = new Set(openedContactIds)
  return {
    isoDate: plan.isoDate,
    timezone: plan.timezone,
    memberId,
    memberName: member?.name ?? '',
    cards: (plan.cardsByMember[memberId] ?? []).filter((card) => !opened.has(card.id)),
    companies: [...new Set((plan.cardsByMember[memberId] ?? []).map((card) => card.company).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, 'it'),
    ),
    openedContactIds,
    contactLabels,
    beforeStart: plan.beforeStart,
    startLabel: plan.startLabel,
    cooldownDays: plan.cooldownDays,
    maxMembersPerContact: plan.maxMembersPerContact,
  }
}

function loadConfig(raw: unknown): PlanConfig {
  const record = asRecord(raw, 'config.json must be an object.')
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
    throw new Error('startDate is invalid. Use YYYY-MM-DD.')
  }
  assertPattern(config.technicalGroupPattern, 'technicalGroupPattern')
  assertPattern(config.followGroupPattern, 'followGroupPattern')
  todayIso(config.timezone)
  return config
}

function integer(value: unknown, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`)
  }
  return value
}

function boolean(value: unknown, label: string, fallback: boolean): boolean {
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`)
  return value
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function readJson(file: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('File mancante')) throw error
    throw new Error(`Could not read data/${path.basename(file)}. Check that it is valid JSON.`)
  }
}
