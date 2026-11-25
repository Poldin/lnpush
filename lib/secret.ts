import { timingSafeEqual } from 'node:crypto'

export function readBearer(header: string | null): string | null {
  const match = (header ?? '').match(/^Bearer\s+(\S+)\s*$/i)
  return match?.[1] ?? null
}

export function secretMatches(token: string, secret: string): boolean {
  const left = Buffer.from(token)
  const right = Buffer.from(secret)
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

export function cronSecret(): string | null {
  const secret = process.env.CRON_SECRET?.trim()
  return secret || null
}
