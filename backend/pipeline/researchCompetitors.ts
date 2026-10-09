import { parseJsonFromLlm } from '../lib/parseJson'
import type { CompetitorGapData } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
}

/**
 * Multimodal-style competitor research pass. Reads the blueprint's competitor
 * URLs + intake notes and produces a structured gap analysis (pacing flaws,
 * missing technical depth, recommended angle), then advances status to
 * 'researched'.
 *
 * NOTE: Direct raw-video ingestion (Gemini 3.5 Flash) is not connected in this
 * workspace, so this pass reasons over the supplied URLs and topic. Connect a
 * Gemini resource to enable true frame/audio parsing.
 */
export default async function researchCompetitors(req: { params: Params; user: User }): Promise<CompetitorGapData> {
  const email = requireEmail(req.user)
  const bp = await retoolDb.query<{
    title: string
    raw_interview_text: string | null
    competitor_urls: string[]
  }>(`SELECT title, raw_interview_text, competitor_urls FROM video_blueprints WHERE id = $1 AND owner_email = $2`, [req.params.id, email])

  const row = bp.data[0]
  if (!row) throw new Error('Blueprint not found')

  const urls = Array.isArray(row.competitor_urls) ? row.competitor_urls : []

  const instruction = `You are a competitive research analyst for technical YouTube content.
Topic / working title: "${row.title}"
Creator intake notes: ${row.raw_interview_text ?? '(none)'}
Competitor video URLs to analyze:
${urls.map((u, i) => `${i + 1}. ${u}`).join('\n') || '(none provided — infer typical competitor coverage for this topic)'}

Analyze how existing videos on this topic typically fail. For each competitor URL, identify pacing flaws, missing technical depth, and useful transcript markers. Then synthesize the gaps into a single recommended differentiating angle.

Return ONLY valid JSON matching exactly this schema, no prose:
{
  "competitors": [
    {
      "url": "string",
      "pacing_flaws": ["string"],
      "missing_technical_depth": ["string"],
      "transcript_markers": [{ "timestamp": "MM:SS", "note": "string" }],
      "opportunity": "string"
    }
  ],
  "synthesized_gaps": ["string"],
  "recommended_angle": "string"
}`

  const res = await openai.text.generate({
    instruction,
    model: 'gpt-5.5',
    systemMessage: 'You output only strict JSON. No markdown, no commentary.',
    temperature: 0.4,
  })

  const gap = parseJsonFromLlm<CompetitorGapData>(res.data.queryData.data)

  await retoolDb.updateBy({
    tableName: 'video_blueprints',
    filterBy: [
      { key: 'id', operation: '=', value: req.params.id },
      { key: 'owner_email', operation: '=', value: email },
    ],
    changeset: {
      competitor_gap_data: JSON.stringify(gap),
      status: 'researched',
      updated_at: new Date().toISOString(),
    },
  })

  return gap
}
