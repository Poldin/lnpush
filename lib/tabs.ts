export type AppTab = 'elenco' | 'utilizzo' | 'slack'

export function parseTab(value: string | null | undefined): AppTab {
  if (value === 'utilizzo' || value === 'activity') return 'utilizzo'
  if (value === 'slack') return 'slack'
  return 'elenco'
}

export function tabQuery(tab: AppTab): 'list' | 'activity' | 'slack' {
  if (tab === 'utilizzo') return 'activity'
  if (tab === 'slack') return 'slack'
  return 'list'
}

export function parseCompanies(...values: Array<string | string[] | undefined>): string[] {
  const raw = values.flatMap((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

export function withTab(path: string, tab: string | null | undefined): string {
  if (tab !== 'elenco' && tab !== 'utilizzo' && tab !== 'list' && tab !== 'activity' && tab !== 'slack') return path
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  const queryTab = tab === 'slack' ? 'slack' : tab === 'utilizzo' || tab === 'activity' ? 'activity' : 'list'
  params.set('tab', queryTab)
  const next = params.toString()
  return next ? `${base}?${next}` : base
}
