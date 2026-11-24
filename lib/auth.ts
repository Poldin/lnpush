export const COOKIE_NAME = 'team_auth'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180

const TOKEN_MESSAGE = 'newtwen-oggi-v1'

export function configuredPassword(): string | undefined {
  const value = process.env.TEAM_PASSWORD
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value
}

export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  if (!input || input.length > 200) return false
  const [got, want] = await Promise.all([sha256(input), sha256(expected)])
  return safeEqual(got, want)
}

export async function authToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(TOKEN_MESSAGE))
  return hex(signature)
}

export function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let diff = leftBytes.length === rightBytes.length ? 0 : 1
  for (let index = 0; index < length; index += 1) {
    diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return diff === 0
}

export function requestIsSecure(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-proto')
  if (forwarded) return forwarded.split(',')[0]?.trim() === 'https'
  return new URL(request.url).protocol === 'https:'
}

export function authCookie(maxAge: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge,
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return hex(digest)
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
