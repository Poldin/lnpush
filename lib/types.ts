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

export type UsageMemberView = {
  name: string
  today: number
  week: number
  total: number
}

export type UsageRecentView = {
  memberName: string
  contactName: string
  company: string
  whenLabel: string
}

export type UsageView = {
  unavailable: boolean
  members: UsageMemberView[]
  recent: UsageRecentView[]
}

export type HomeView = {
  isoDate: string
  timezone: string
  memberName: string
  cards: CardView[]
  beforeStart: boolean
  startLabel: string
  cooldownDays: number
  maxMembersPerContact: number
}
