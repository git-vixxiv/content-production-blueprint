import { requireAdmin, type User } from '../lib/auth'

interface Params {
  id: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Deletes an org-wide heuristic rule. Admin only.
 */
export default async function deleteHeuristic(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  requireAdmin(req.user)
  const { id } = req.params
  if (!id || !UUID_RE.test(id)) {
    throw new Error(`Invalid heuristic id "${id}". Expected a UUID.`)
  }
  await retoolDb.deleteBy({
    tableName: 'heuristic_rules',
    filterBy: [{ key: 'id', operation: '=', value: id }],
  })
  return { ok: true }
}
