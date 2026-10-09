import type { VideoBlueprint } from '../types'

/** Renders a full blueprint as a Markdown document for export to Notion / Google Docs. */
export function blueprintToMarkdown(b: VideoBlueprint): string {
  const lines: string[] = []
  lines.push(`# ${b.title}`)
  lines.push('')
  lines.push(`**Creator:** ${b.creator_name ?? 'Unassigned'}  `)
  lines.push(`**Status:** ${b.status}`)
  lines.push('')

  if (b.script_json) {
    const s = b.script_json
    lines.push(`## Hook (first 45s) — anti-fluff score ${s.anti_fluff_score}`)
    lines.push(`- **Stakes:** ${s.hook_first_45s.stakes}`)
    lines.push(`- **Proof asset:** ${s.hook_first_45s.proof_asset}`)
    lines.push(`- **Open loop:** ${s.hook_first_45s.open_loop}`)
    lines.push('')
    lines.push('## Timeline')
    for (const t of s.timeline_blocks) {
      lines.push(`### ${t.timestamp} — ${t.core_concept}`)
      if (t.visual_cue) lines.push(`- Visual: ${t.visual_cue}`)
      if (t.code_snippet) {
        lines.push('```')
        lines.push(t.code_snippet)
        lines.push('```')
      }
      lines.push('')
    }
    if (s.retention_loops?.length) {
      lines.push('## Retention loops')
      for (const r of s.retention_loops) lines.push(`- ${r}`)
      lines.push('')
    }
  }

  if (b.packaging_data) {
    lines.push('## Title candidates')
    for (const t of b.packaging_data.titles) {
      lines.push(`- [${t.ctr_score}] (${t.psychological_tag}) ${t.title}`)
    }
    lines.push('')
    lines.push('## Thumbnail concepts')
    for (const th of b.packaging_data.thumbnails) {
      lines.push(`### ${th.concept}`)
      lines.push(`> ${th.image_prompt}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}
