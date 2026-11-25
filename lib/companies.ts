export const NO_COMPANIES = '__nessuna__'

export type CompanyFilterMode = 'all' | 'none' | 'pick'

export type CompanyFilter = {
  mode: CompanyFilterMode
  picked: string[]
}

export function readCompanyFilter(values: string[]): CompanyFilter {
  const picked = values.filter((company) => company !== NO_COMPANIES)
  if (values.includes(NO_COMPANIES) && picked.length === 0) return { mode: 'none', picked: [] }
  if (picked.length === 0) return { mode: 'all', picked: [] }
  return { mode: 'pick', picked }
}

export function companyFilterParams(filter: CompanyFilter): string[] {
  if (filter.mode === 'all') return []
  if (filter.mode === 'none') return [NO_COMPANIES]
  return filter.picked
}

export function withHotCompanyFirst(companies: string[], hot: string | null | undefined): string[] {
  if (!hot) return companies
  const index = companies.indexOf(hot)
  if (index <= 0) return companies
  return [hot, ...companies.slice(0, index), ...companies.slice(index + 1)]
}

export function companyFilterLabel(filter: CompanyFilter): string {
  if (filter.mode === 'all') return 'All companies'
  if (filter.mode === 'none' || filter.picked.length === 0) return 'No companies'
  if (filter.picked.length === 1) return filter.picked[0] ?? 'No companies'
  return `${filter.picked.length} companies`
}

export function companyIsSelected(filter: CompanyFilter, company: string, all: string[]): boolean {
  if (filter.mode === 'all') return all.length === 0 || all.includes(company)
  if (filter.mode === 'none') return false
  return filter.picked.includes(company)
}

export function selectAllState(filter: CompanyFilter, visible: string[], all: string[]): CompanyFilterMode {
  if (visible.length === 0) return 'none'
  let on = 0
  for (const company of visible) {
    if (companyIsSelected(filter, company, all)) on += 1
  }
  if (on === 0) return 'none'
  if (on === visible.length) return 'all'
  return 'pick'
}

export function toggleCompanyInFilter(filter: CompanyFilter, company: string, all: string[]): CompanyFilter {
  const selected = selectedSet(filter, all)
  if (selected.has(company)) selected.delete(company)
  else selected.add(company)
  return normalizeSelection([...selected], all)
}

export function toggleVisibleInFilter(filter: CompanyFilter, visible: string[], all: string[]): CompanyFilter {
  if (visible.length === 0) return filter
  const selected = selectedSet(filter, all)
  const allVisibleOn = visible.every((company) => selected.has(company))
  if (allVisibleOn) {
    for (const company of visible) selected.delete(company)
  } else {
    for (const company of visible) selected.add(company)
  }
  return normalizeSelection([...selected], all)
}

function selectedSet(filter: CompanyFilter, all: string[]): Set<string> {
  if (filter.mode === 'all') return new Set(all)
  if (filter.mode === 'none') return new Set()
  return new Set(filter.picked)
}

function normalizeSelection(next: string[], all: string[]): CompanyFilter {
  const unique = [...new Set(next)]
  if (unique.length === 0) return { mode: 'none', picked: [] }
  if (all.length > 0 && all.every((company) => unique.includes(company))) return { mode: 'all', picked: [] }
  return { mode: 'pick', picked: unique }
}
