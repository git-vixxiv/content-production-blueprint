import { requireAdmin, type User } from '../lib/auth'

interface Params {
  rule_category: string
  description: string
  weight?: number
}

/**
 * Adds a new org-wide heuristic rule. Admin only.
 */
export default async function createHeuristic(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  requireAdmin(req.user)
  await retoolDb.insert({
    tableName: 'heuristic_rules',
    changeset: {
      rule_category: req.params.rule_category,
      description: req.params.description,
      weight: req.params.weight ?? 3,
      is_active: true,
      rule_logic: JSON.stringify({}),
    },
  })
  return { ok: true }
}
