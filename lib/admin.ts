export const COLLECTOR_ADMIN_EMAIL = 'oloapiccoli@gmail.com'

export function isCollectorAdmin(
  member: { name: string; email: string | null },
  user?: { email?: string | null },
): boolean {
  const emails = [member.email, user?.email]
  if (emails.some((email) => email?.trim().toLowerCase() === COLLECTOR_ADMIN_EMAIL)) return true
  return member.name.trim().toLowerCase() === 'paolo'
}
