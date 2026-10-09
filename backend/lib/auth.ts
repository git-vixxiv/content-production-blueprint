/** Server-side authenticated user, injected by Retool from the session. */
export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  fullName: string
  profilePhotoUrl: string | null
  groups: Array<{ id: number; name: string }>
  metadata: Record<string, unknown>
  sid: string
  externalIdentifier: string | null
  locale: string
}

/** True if the user belongs to the org "admin" group. */
export function isAdmin(user: User | undefined): boolean {
  return user?.groups?.some((g) => g.name.toLowerCase() === 'admin') ?? false
}

/** Throws unless the user is an admin. Use to gate org-wide mutations. */
export function requireAdmin(user: User | undefined): void {
  if (!isAdmin(user)) {
    throw new Error('Admin access required to modify org-wide settings.')
  }
}

/** Returns the caller's email or throws if the session is missing one. */
export function requireEmail(user: User | undefined): string {
  const email = user?.email
  if (!email) throw new Error('No authenticated user on request.')
  return email
}
