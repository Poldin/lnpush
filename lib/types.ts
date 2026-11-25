export type Contact = {
  id: string
  name: string
  role: string
  company: string
  group: string
  linkedinUrl: string
  technical: boolean
}

export type TeamMember = {
  id: string
  name: string
  technical: boolean
}

export type PlanConfig = {
  cardsPerDay: number
  cooldownDays: number
  maxMembersPerContact: number
  startDate: string
  timezone: string
  affinityEnabled: boolean
  technicalGroupPattern: string
  followGroupPattern: string
}

export type Assignment = {
  date: string
  contactId: string
  memberId: string
}

export type CardView = {
  id: string
  name: string
  role: string
  company: string
  linkedinUrl: string
}

export type MemberView = {
  id: string
  name: string
}

export type Plan = {
  isoDate: string
  timezone: string
  weekday: string
  day: string
  monthYear: string
  beforeStart: boolean
  startLabel: string
  cooldownDays: number
  maxMembersPerContact: number
  members: MemberView[]
  cardsByMember: Record<string, CardView[]>
}

export type Dataset = {
  contacts: Contact[]
  team: TeamMember[]
  config: PlanConfig
  clicks?: { memberId: string; contactId: string }[]
}

export type ClickIndex = {
  byMember: Set<string>
  any: Set<string>
}

export type UsageRecentView = {
  contactId: string
  contactName: string
  role: string
  company: string
  linkedinUrl: string
  whenLabel: string
  clickedAt: string
}

export type UsageCounts = {
  today: number
  week: number
  month: number
  total: number
}

export type UsageView = {
  unavailable: boolean
  counts: UsageCounts
  recent: UsageRecentView[]
}

export type ContactLabel = {
  name: string
  role: string
  company: string
  linkedinUrl?: string
}

export type HomeView = {
  isoDate: string
  timezone: string
  memberId: string
  memberName: string
  cards: CardView[]
  companies: string[]
  openedContactIds: string[]
  contactLabels: Record<string, ContactLabel>
  beforeStart: boolean
  startLabel: string
  cooldownDays: number
  maxMembersPerContact: number
}
