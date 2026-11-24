import { describe, expect, it } from 'vitest'

import {
  companyFilterLabel,
  companyFilterParams,
  readCompanyFilter,
  selectAllState,
  toggleCompanyInFilter,
  toggleVisibleInFilter,
} from '../lib/companies'
import { nextTabFromSwipe } from '../lib/swipe'

const all = ['Alfa', 'Beta', 'Gamma']

describe('company filter', () => {
  it('treats an empty query as every company and a sentinel as none', () => {
    expect(readCompanyFilter([])).toEqual({ mode: 'all', picked: [] })
    expect(companyFilterParams({ mode: 'all', picked: [] })).toEqual([])
    expect(readCompanyFilter(['__nessuna__'])).toEqual({ mode: 'none', picked: [] })
    expect(companyFilterParams({ mode: 'none', picked: [] })).toEqual(['__nessuna__'])
    expect(companyFilterLabel({ mode: 'none', picked: [] })).toBe('Nessuna azienda')
  })

  it('selects or clears the companies that are visible in the search', () => {
    const partial = toggleCompanyInFilter({ mode: 'all', picked: [] }, 'Gamma', all)
    expect(partial).toEqual({ mode: 'pick', picked: ['Alfa', 'Beta'] })
    expect(selectAllState(partial, ['Alfa', 'Beta'], all)).toBe('all')
    expect(selectAllState(partial, all, all)).toBe('pick')

    const cleared = toggleVisibleInFilter(partial, ['Alfa'], all)
    expect(cleared).toEqual({ mode: 'pick', picked: ['Beta'] })
    const restored = toggleVisibleInFilter({ mode: 'none', picked: [] }, ['Alfa', 'Beta'], all)
    expect(restored).toEqual({ mode: 'pick', picked: ['Alfa', 'Beta'] })
    expect(toggleVisibleInFilter(restored, all, all)).toEqual({ mode: 'all', picked: [] })
    expect(companyFilterParams(restored)).toEqual(['Alfa', 'Beta'])
  })
})

describe('tab swipe', () => {
  it('switches only on a clearly horizontal swipe and never while the dialog is open', () => {
    expect(nextTabFromSwipe('elenco', -80, 10, false)).toBe('utilizzo')
    expect(nextTabFromSwipe('utilizzo', 90, -20, false)).toBe('elenco')
    expect(nextTabFromSwipe('elenco', 90, 0, false)).toBeNull()
    expect(nextTabFromSwipe('elenco', -40, 0, false)).toBeNull()
    expect(nextTabFromSwipe('elenco', -80, 70, false)).toBeNull()
    expect(nextTabFromSwipe('elenco', -120, 10, true)).toBeNull()
  })
})
