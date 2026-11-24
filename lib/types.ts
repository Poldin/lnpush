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
}
