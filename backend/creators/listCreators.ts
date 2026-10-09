import type { Creator } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

/**
 * Returns the current user's creator profiles, newest first.
 */
export default async function listCreators(req: { user: User }): Promise<Creator[]> {
  const email = requireEmail(req.user)
  const result = await retoolDb.query<Creator>(
    `SELECT * FROM creators WHERE owner_email = $1 ORDER BY created_at DESC`,
    [email],
  )
  return result.data
}
