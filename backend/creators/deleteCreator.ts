import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
}

/**
 * Deletes one of the current user's creator profiles. Blueprints that reference
 * it keep their row (creator_id is set to NULL by the foreign key).
 */
export default async function deleteCreator(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  const email = requireEmail(req.user)
  await retoolDb.deleteBy({
    tableName: 'creators',
    filterBy: [
      { key: 'id', operation: '=', value: req.params.id },
      { key: 'owner_email', operation: '=', value: email },
    ],
  })
  return { ok: true }
}
