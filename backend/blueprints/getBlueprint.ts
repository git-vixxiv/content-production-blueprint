import type { VideoBlueprint } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
}

/**
 * Returns a single blueprint by id, scoped to the current user (owners only).
 */
export default async function getBlueprint(req: {
  params: Params
  user: User
}): Promise<VideoBlueprint | null> {
  const email = requireEmail(req.user)
  const result = await retoolDb.query<VideoBlueprint>(
    `
    SELECT b.id, b.creator_id, b.title, b.status, b.raw_interview_text,
           b.competitor_urls, b.competitor_gap_data, b.script_json, b.packaging_data,
           b.created_at, b.updated_at, c.name AS creator_name
    FROM video_blueprints b
    LEFT JOIN creators c ON c.id = b.creator_id
    WHERE b.id = $1 AND b.owner_email = $2
  `,
    [req.params.id, email],
  )
  return result.data[0] ?? null
}
