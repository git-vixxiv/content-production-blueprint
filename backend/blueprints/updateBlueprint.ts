import type { BlueprintStatus, ScriptJson, CompetitorGapData, PackagingData } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
  title?: string
  status?: BlueprintStatus
  raw_interview_text?: string
  competitor_urls?: string[]
  competitor_gap_data?: CompetitorGapData
  script_json?: ScriptJson
  packaging_data?: PackagingData
}

/**
 * Updates editable fields on a blueprint. Only provided fields are written.
 */
export default async function updateBlueprint(req: { params: Params; user: User }): Promise<{ ok: boolean }> {
  const email = requireEmail(req.user)
  const { id, ...rest } = req.params
  const changeset: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (rest.title !== undefined) changeset['title'] = rest.title
  if (rest.status !== undefined) changeset['status'] = rest.status
  if (rest.raw_interview_text !== undefined) changeset['raw_interview_text'] = rest.raw_interview_text
  if (rest.competitor_urls !== undefined) changeset['competitor_urls'] = JSON.stringify(rest.competitor_urls)
  if (rest.competitor_gap_data !== undefined) changeset['competitor_gap_data'] = JSON.stringify(rest.competitor_gap_data)
  if (rest.script_json !== undefined) changeset['script_json'] = JSON.stringify(rest.script_json)
  if (rest.packaging_data !== undefined) changeset['packaging_data'] = JSON.stringify(rest.packaging_data)

  await retoolDb.updateBy({
    tableName: 'video_blueprints',
    filterBy: [
      { key: 'id', operation: '=', value: id },
      { key: 'owner_email', operation: '=', value: email },
    ],
    changeset,
  })
  return { ok: true }
}
