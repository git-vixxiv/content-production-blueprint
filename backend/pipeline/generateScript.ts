import { parseJsonFromLlm } from '../lib/parseJson'
import type { ScriptJson, HeuristicRule } from '../lib/types'
import { requireEmail, type User } from '../lib/auth'

interface Params {
  id: string
}

function buildInstruction(args: {
  title: string
  niche: string | null
  depth: number | null
  intake: string | null
  rules: HeuristicRule[]
  gaps: unknown
  brandVoice?: string | null
  brandColors?: string[]
  revisionNote?: string
}): string {
  const rulesText = args.rules
    .map((r) => `- [${r.rule_category}] (weight ${r.weight}) ${r.description}`)
    .join('\n')

  const brandSection = args.brandVoice?.trim()
    ? `\nBRAND VOICE (must be honored):\n${args.brandVoice.trim()}`
    : ''
  const colorSection = args.brandColors && args.brandColors.length > 0
    ? `\nBRAND COLORS (reference in visual_cue where relevant): ${args.brandColors.join(', ')}`
    : ''

  return `You are a deterministic scriptwriting engine for a technical creator. You produce recording-ready blueprints with ZERO conversational AI fluff.

CREATOR PROFILE
- Niche: ${args.niche ?? 'unknown'}
- Technical depth level (1-5): ${args.depth ?? 3}

WORKING TITLE: "${args.title}"

RAW INTAKE NOTES (source of truth for facts, stakes, proof):
${args.intake ?? '(none)'}

COMPETITOR GAP DATA (differentiate against these):
${args.gaps ? JSON.stringify(args.gaps) : '(none)'}

NON-NEGOTIABLE HEURISTIC RULES (must all be satisfied):
${rulesText}${brandSection}${colorSection}
${args.revisionNote ? `\nAUTO-REVISION REQUIRED: ${args.revisionNote}` : ''}

Produce a structured script. hook_first_45s.proof_asset MUST be a concrete, specific proof pulled from the intake notes (a benchmark number, terminal command, screenshot, code diff) — never empty, never generic. Every timeline block should carry a visual_cue and, where relevant, an exact code_snippet or command. anti_fluff_score is 0-100 self-assessment of how free the script is of filler.

Return ONLY valid JSON matching exactly this schema, no prose, no markdown:
{
  "hook_first_45s": { "stakes": "string", "proof_asset": "string", "open_loop": "string" },
  "timeline_blocks": [
    { "timestamp": "MM:SS", "core_concept": "string", "visual_cue": "string", "code_snippet": "string" }
  ],
  "retention_loops": ["string"],
  "anti_fluff_score": 95
}`
}

/**
 * Multi-pass deterministic scripting engine (Claude Sonnet 5). Assembles creator
 * profile + active heuristics + intake + competitor gaps, enforces a strict JSON
 * schema, runs a validation gate (empty proof_asset triggers an auto-revision
 * pass), then writes script_json and advances status to 'scripted'.
 */
export default async function generateScript(req: { params: Params; user: User }): Promise<ScriptJson> {
  const email = requireEmail(req.user)
  const bpRes = await retoolDb.query<{
    title: string
    raw_interview_text: string | null
    competitor_gap_data: unknown
    creator_id: string | null
  }>(
    `SELECT title, raw_interview_text, competitor_gap_data, creator_id FROM video_blueprints WHERE id = $1 AND owner_email = $2`,
    [req.params.id, email],
  )
  const bp = bpRes.data[0]
  if (!bp) throw new Error('Blueprint not found')

  let niche: string | null = null
  let depth: number | null = null
  if (bp.creator_id) {
    const c = await retoolDb.query<{ niche: string | null; technical_depth_level: number | null }>(
      `SELECT niche, technical_depth_level FROM creators WHERE id = $1`,
      [bp.creator_id],
    )
    niche = c.data[0]?.niche ?? null
    depth = c.data[0]?.technical_depth_level ?? null
  }

  const rulesRes = await retoolDb.query<HeuristicRule>(
    `SELECT * FROM heuristic_rules WHERE is_active = true ORDER BY weight DESC`,
  )

  const brandRes = await retoolDb.query<{ brand_voice: string | null; brand_colors: string[] }>(
    `SELECT brand_voice, brand_colors FROM brand_settings WHERE owner_email = $1`,
    [email],
  )
  const brandVoice = brandRes.data[0]?.brand_voice ?? null
  const brandColors = brandRes.data[0]?.brand_colors ?? []

  async function runPass(revisionNote?: string): Promise<ScriptJson> {
    const instruction = buildInstruction({
      title: bp!.title,
      niche,
      depth,
      intake: bp!.raw_interview_text,
      rules: rulesRes.data,
      gaps: bp!.competitor_gap_data,
      brandVoice,
      brandColors,
      revisionNote,
    })
    const res = await anthropic.text.generate({
      instruction,
      model: 'claude-sonnet-5',
      systemMessage: 'You output only strict JSON. No markdown fences, no commentary.',
      temperature: revisionNote ? 0.2 : 0.5,
    })
    return parseJsonFromLlm<ScriptJson>(res.data.queryData.data)
  }

  let script = await runPass()

  // Validation gate: proof_asset must not be empty.
  const proof = script.hook_first_45s?.proof_asset?.trim() ?? ''
  if (proof.length === 0) {
    script = await runPass(
      'The previous pass left hook_first_45s.proof_asset empty. Extract a concrete proof asset (benchmark, command, or code diff) from the intake notes and fill it.',
    )
    script.revision_note = 'Auto-revised: proof_asset was empty on first pass.'
  }

  await retoolDb.updateBy({
    tableName: 'video_blueprints',
    filterBy: [
      { key: 'id', operation: '=', value: req.params.id },
      { key: 'owner_email', operation: '=', value: email },
    ],
    changeset: {
      script_json: JSON.stringify(script),
      status: 'scripted',
      updated_at: new Date().toISOString(),
    },
  })

  return script
}
