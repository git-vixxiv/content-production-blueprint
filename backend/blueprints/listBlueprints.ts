import type { VideoBlueprint } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

/**
 * Returns the current user's video blueprints with creator names, newest first.
 */
export default async function listBlueprints(req: { user: User }): Promise<VideoBlueprint[]> {
  const email = requireEmail(req.user)
  const result = await retoolDb.query<VideoBlueprint>(
    `
    SELECT b.id, b.creator_id, b.title, b.status, b.raw_interview_text,
           b.competitor_urls, b.competitor_gap_data, b.script_json, b.packaging_data,
           b.created_at, b.updated_at, c.name AS creator_name
    FROM video_blueprints b
    LEFT JOIN creators c ON c.id = b.creator_id
    WHERE b.owner_email = $1
    ORDER BY b.updated_at DESC
  `,
    [email],
  )
  return result.data
}
