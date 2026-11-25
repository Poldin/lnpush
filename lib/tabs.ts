export type AppTab = 'elenco' | 'utilizzo'

export function parseTab(value: string | null | undefined): AppTab {
  if (value === 'utilizzo' || value === 'activity') return 'utilizzo'
  return 'elenco'
}

export function tabQuery(tab: AppTab): 'list' | 'activity' {
  return tab === 'utilizzo' ? 'activity' : 'list'
}

export function parseCompanies(...values: Array<string | string[] | undefined>): string[] {
  const raw = values.flatMap((value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]))
  return [...new Set(raw.map((item) => item.trim()).filter(Boolean))]
}

export function withTab(path: string, tab: string | null | undefined): string {
  if (tab !== 'elenco' && tab !== 'utilizzo' && tab !== 'list' && tab !== 'activity') return path
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('tab', tab === 'utilizzo' || tab === 'activity' ? 'activity' : 'list')
  const next = params.toString()
  return next ? `${base}?${next}` : base
}
