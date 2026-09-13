/**
 * Authenticated user info populated by the backend from the session.
 * Available on `req.user` in every server function.
 */
type User = {
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