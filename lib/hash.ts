/** FNV-1a 32-bit over UTF-16 code units. Stable across machines, not a cryptographic hash. */
export function hash32(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function assignmentRank(date: string, memberId: string, contactId: string): number {
  return hash32(`lnpush-v1\n${date}\n${memberId}\n${contactId}`)
}

export function memberOrderRank(date: string, memberId: string): number {
  return hash32(`lnpush-v1\n${date}\norder\n${memberId}`)
}
