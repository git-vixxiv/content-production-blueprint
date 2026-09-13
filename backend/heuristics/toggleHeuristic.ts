import { requireAdmin, type User } from '../lib/auth'

interface Params {
  id: string
  is_active: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Toggles an org-wide heuristic rule active/inactive. Admin only.
 */
export default async function toggleHeuristic(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  requireAdmin(req.user)
  const { id, is_active } = req.params

  if (!id || !UUID_RE.test(id)) {
    throw new Error(`Invalid heuristic id "${id}". Expected a UUID (e.g. from listHeuristics).`)
  }

  await retoolDb.updateBy({
    tableName: 'heuristic_rules',
    filterBy: [{ key: 'id', operation: '=', value: id }],
    changeset: { is_active },
  })
  return { ok: true }
}
