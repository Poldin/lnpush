export type UsageClick = {
  memberId: string
  contactId: string
  contactName: string
  company: string
  clickedAt: string
}

export type OwnOpening = {
  contactId: string
  contactName: string
  company: string
  whenLabel: string
  clickedAt: string
}

const RECENT_LIMIT = 40

export function ownOpenings(clicks: UsageClick[], memberId: string, timeZone: string): OwnOpening[] {
  return clicks
    .filter((click) => click.memberId === memberId && click.contactId)
    .sort((left, right) => right.clickedAt.localeCompare(left.clickedAt))
    .slice(0, RECENT_LIMIT)
    .map((click) => toOpening(click, timeZone))
}

export function mergeOpening(current: OwnOpening[], next: OwnOpening): OwnOpening[] {
  const nextTime = Date.parse(next.clickedAt)
  const withoutNearDuplicate = current.filter((item) => {
    if (item.contactId !== next.contactId) return true
    const gap = Math.abs(Date.parse(item.clickedAt) - nextTime)
    return Number.isNaN(gap) || gap > 20000
  })
  return [next, ...withoutNearDuplicate].sort((left, right) => right.clickedAt.localeCompare(left.clickedAt)).slice(0, RECENT_LIMIT)
}

export function toOpening(click: Pick<UsageClick, 'contactId' | 'contactName' | 'company' | 'clickedAt'>, timeZone: string): OwnOpening {
  return {
    contactId: click.contactId,
    contactName: click.contactName || 'Profilo',
    company: click.company,
    clickedAt: click.clickedAt,
    whenLabel: formatRomeDateTime(click.clickedAt, timeZone),
  }
}

export function formatRomeDateTime(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('it-IT', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
