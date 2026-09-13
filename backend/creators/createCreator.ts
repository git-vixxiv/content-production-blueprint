import { requireEmail, type User } from '../lib/auth'

interface Params {
  name: string
  niche?: string
  target_rpm?: number
  technical_depth_level?: number
}

/**
 * Creates a new creator profile owned by the current user.
 */
export default async function createCreator(req: { params: Params; user: User }): Promise<{ ok: boolean }> {
  const email = requireEmail(req.user)
  await retoolDb.insert({
    tableName: 'creators',
    changeset: {
      name: req.params.name,
      niche: req.params.niche ?? null,
      target_rpm: req.params.target_rpm ?? null,
      technical_depth_level: req.params.technical_depth_level ?? 3,
      owner_email: email,
    },
  })
  return { ok: true }
}
