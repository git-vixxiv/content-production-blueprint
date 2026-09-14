export type BlueprintStatus = 'intake' | 'researched' | 'scripted' | 'packaged' | 'ready'

export const STATUS_ORDER: BlueprintStatus[] = ['intake', 'researched', 'scripted', 'packaged', 'ready']

export const STATUS_LABEL: Record<BlueprintStatus, string> = {
  intake: 'Intake',
  researched: 'Researched',
  scripted: 'Scripted',
  packaged: 'Packaged',
  ready: 'Ready to Film',
}

export interface TimelineBlock {
  timestamp: string
  core_concept: string
  visual_cue: string
  code_snippet: string
}

export interface ScriptJson {
  hook_first_45s: {
    stakes: string
    proof_asset: string
    open_loop: string
  }
  timeline_blocks: TimelineBlock[]
  retention_loops: string[]
  anti_fluff_score: number
  revision_note?: string
}

export interface CompetitorGap {
  url: string
  pacing_flaws: string[]
  missing_technical_depth: string[]
  transcript_markers: { timestamp: string; note: string }[]
  opportunity: string
}

export interface CompetitorGapData {
  competitors: CompetitorGap[]
  synthesized_gaps: string[]
  recommended_angle: string
}

export interface TitleVariant {
  title: string
  psychological_tag: string
  ctr_score: number
  rationale: string
}

export interface ThumbnailConcept {
  concept: string
  image_prompt: string
}

export interface PackagingData {
  titles: TitleVariant[]
  thumbnails: ThumbnailConcept[]
}

export interface VideoBlueprint {
  id: string
  creator_id: string | null
  title: string
  status: BlueprintStatus
  raw_interview_text: string | null
  competitor_urls: string[]
  competitor_gap_data: CompetitorGapData | null
  script_json: ScriptJson | null
  packaging_data: PackagingData | null
  created_at: string
  updated_at: string
  creator_name?: string | null
}

export interface Creator {
  id: string
  user_id: string | null
  name: string
  niche: string | null
  target_rpm: string | null
  technical_depth_level: number | null
  voice_sample_id: string | null
  created_at: string
}

export interface BrandSettings {
  owner_email: string
  logo_url: string | null
  logo_file_id: string | null
  alt_logo_url: string | null
  alt_logo_file_id: string | null
  brand_colors: string[]
  brand_voice: string | null
  updated_at: string
}

export interface HeuristicRule {
  id: string
  rule_category: string
  description: string
  rule_logic: Record<string, unknown>
  weight: string | number
  is_active: boolean
  created_at: string
}
