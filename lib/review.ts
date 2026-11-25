export type ReviewCandidate = {
  id: string
  company: string
  fullName: string
  headline: string
  linkedinUrl: string
  snippet: string
  rank: number | null
}

export type ReviewProgress = {
  done: number
  total: number
  candidates: number
}

export function groupCandidates(rows: ReviewCandidate[]): { company: string; rows: ReviewCandidate[] }[] {
  const map = new Map<string, ReviewCandidate[]>()
  for (const row of rows) {
    const list = map.get(row.company) ?? []
    list.push(row)
    map.set(row.company, list)
  }
  return [...map.entries()]
    .sort((left, right) => left[0].localeCompare(right[0], 'en'))
    .map(([company, items]) => ({
      company,
      rows: [...items].sort(
        (left, right) => (left.rank ?? 9999) - (right.rank ?? 9999) || left.fullName.localeCompare(right.fullName, 'en'),
      ),
    }))
}
