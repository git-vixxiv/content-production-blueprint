import { requireEmail, type User } from '../lib/auth'

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

/**
 * Returns the current user's brand settings, creating defaults if none exist yet.
 */
export default async function getBrandSettings(req: { user: User }): Promise<BrandSettings> {
  const email = requireEmail(req.user)
  const res = await retoolDb.query<BrandSettings>(
    `SELECT * FROM brand_settings WHERE owner_email = $1`,
    [email],
  )
  return (
    res.data[0] ?? {
      owner_email: email,
      logo_url: null,
      logo_file_id: null,
      alt_logo_url: null,
      alt_logo_file_id: null,
      brand_colors: [],
      brand_voice: null,
      updated_at: new Date().toISOString(),
    }
  )
}
