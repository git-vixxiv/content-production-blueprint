import { requireEmail, type User } from '../lib/auth'

interface Params {
  title: string
  creator_id: string
  raw_interview_text?: string
  competitor_urls?: string[]
}

/**
 * Creates a new video blueprint in the intake stage, owned by the current user.
 */
export default async function createBlueprint(req: {
  params: Params
  user: User
}): Promise<{ id: string }> {
  const email = requireEmail(req.user)
  const { title, creator_id, raw_interview_text, competitor_urls } = req.params
  const changeset: Record<string, unknown> = {
    title: title || 'Untitled Video',
    creator_id,
    status: 'intake',
    raw_interview_text: raw_interview_text ?? null,
    competitor_urls: JSON.stringify(competitor_urls ?? []),
    owner_email: email,
  }
  const res = await retoolDb.insert<{ id: string }>({ tableName: 'video_blueprints', changeset })
  const rows = (res as { result?: { id: string }[] }).result ?? (res as { data?: { id: string }[] }).data ?? []
  return { id: rows[0]?.id ?? '' }
}
