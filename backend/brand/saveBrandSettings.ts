import { requireEmail, type User } from '../lib/auth'

const HEX_RE = /^#?[0-9a-f]{6}$/i

interface Params {
  brand_colors?: string[]
  brand_voice?: string
}

/**
 * Upserts the current user's brand colors (up to 4 hex codes) and brand voice.
 */
export default async function saveBrandSettings(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  const email = requireEmail(req.user)
  const { brand_colors, brand_voice } = req.params

  let colors: string[] | null = null
  if (brand_colors !== undefined) {
    colors = brand_colors
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => (c.startsWith('#') ? c : `#${c}`))
      .slice(0, 4)
    for (const c of colors) {
      if (!HEX_RE.test(c)) throw new Error(`Invalid hex color "${c}". Use 6-digit hex like #1A2B3C.`)
    }
  }

  await retoolDb.query(
    `INSERT INTO brand_settings (owner_email, brand_colors, brand_voice, updated_at)
     VALUES ($1, COALESCE($2::jsonb, '[]'::jsonb), $3, now())
     ON CONFLICT (owner_email) DO UPDATE SET
       brand_colors = COALESCE($4::jsonb, brand_settings.brand_colors),
       brand_voice  = COALESCE($5, brand_settings.brand_voice),
       updated_at   = now()`,
    [
      email,
      colors !== null ? JSON.stringify(colors) : null,
      brand_voice ?? null,
      colors !== null ? JSON.stringify(colors) : null,
      brand_voice ?? null,
    ],
  )
  return { ok: true }
}
