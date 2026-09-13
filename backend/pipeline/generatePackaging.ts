import { parseJsonFromLlm } from '../lib/parseJson'
import type { PackagingData } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
}

/**
 * CTR packaging engine (OpenAI). Generates 15 scored title variants grouped by
 * psychological tag plus thumbnail concepts with image-generation prompts, then
 * advances status to 'packaged'.
 */
export default async function generatePackaging(req: { params: Params; user: User }): Promise<PackagingData> {
  const email = requireEmail(req.user)
  const bpRes = await retoolDb.query<{
    title: string
    script_json: unknown
    competitor_gap_data: unknown
  }>(`SELECT title, script_json, competitor_gap_data FROM video_blueprints WHERE id = $1 AND owner_email = $2`, [
    req.params.id,
    email,
  ])
  const bp = bpRes.data[0]
  if (!bp) throw new Error('Blueprint not found')

  const instruction = `You are a CTR packaging engine for a technical YouTube channel. No clickbait lies — every title must be defensible by the script.

WORKING TITLE: "${bp.title}"
SCRIPT: ${bp.script_json ? JSON.stringify(bp.script_json) : '(none)'}
COMPETITOR GAPS: ${bp.competitor_gap_data ? JSON.stringify(bp.competitor_gap_data) : '(none)'}

Produce exactly 15 title variations. Distribute them across the psychological tags: "Contrarian", "Urgency", "Architectural Deep-Dive" (roughly 5 each). Score each 0-100 for predicted CTR with a one-line rationale. Then produce 4 thumbnail concepts, each with a detailed image-generation prompt (composition, text overlay, focal object, color mood).

Return ONLY valid JSON matching exactly this schema, no prose, no markdown:
{
  "titles": [
    { "title": "string", "psychological_tag": "Contrarian", "ctr_score": 87, "rationale": "string" }
  ],
  "thumbnails": [
    { "concept": "string", "image_prompt": "string" }
  ]
}`

  const res = await openai.text.generate({
    instruction,
    model: 'gpt-5.5',
    systemMessage: 'You output only strict JSON. No markdown, no commentary.',
    temperature: 0.7,
  })

  const packaging = parseJsonFromLlm<PackagingData>(res.data.queryData.data)
  packaging.titles = (packaging.titles ?? []).sort((a, b) => (b.ctr_score ?? 0) - (a.ctr_score ?? 0))

  await retoolDb.updateBy({
    tableName: 'video_blueprints',
    filterBy: [
      { key: 'id', operation: '=', value: req.params.id },
      { key: 'owner_email', operation: '=', value: email },
    ],
    changeset: {
      packaging_data: JSON.stringify(packaging),
      status: 'packaged',
      updated_at: new Date().toISOString(),
    },
  })

  return packaging
}
