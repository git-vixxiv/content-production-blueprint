import type { HeuristicRule } from '../lib/types'

/**
 * Returns all heuristic rules ordered by weight (highest first).
 */
export default async function listHeuristics(): Promise<HeuristicRule[]> {
  const result = await retoolDb.query<HeuristicRule>(
    `SELECT * FROM heuristic_rules ORDER BY weight DESC, created_at ASC`,
  )
  return result.data
}
