export type AppTab = 'elenco' | 'utilizzo'

export function parseTab(value: string | null | undefined): AppTab {
  return value === 'utilizzo' ? 'utilizzo' : 'elenco'
}

export function withTab(path: string, tab: string | null | undefined): string {
  if (tab !== 'elenco' && tab !== 'utilizzo') return path
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.set('tab', tab)
  const next = params.toString()
  return next ? `${base}?${next}` : base
}
