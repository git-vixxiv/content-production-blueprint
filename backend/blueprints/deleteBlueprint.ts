import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
}

/**
 * Deletes one of the current user's blueprints. Related benchmark_metrics rows
 * are removed via the foreign key's ON DELETE CASCADE.
 */
export default async function deleteBlueprint(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  const email = requireEmail(req.user)
  await retoolDb.deleteBy({
    tableName: 'video_blueprints',
    filterBy: [
      { key: 'id', operation: '=', value: req.params.id },
      { key: 'owner_email', operation: '=', value: email },
    ],
  })
  return { ok: true }
}
