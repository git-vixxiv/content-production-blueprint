import { requireEmail, type User } from '../lib/auth'

type Slot = 'logo' | 'alt_logo'

interface Params {
  slot: Slot
  fileName: string
  /** base64-encoded file contents (no data: prefix) */
  data: string
  mimeType?: string
}

/**
 * Uploads a brand logo to Retool Storage (public) and stores its URL + file id
 * on the current user's brand_settings row. Deletes any previous file for the slot.
 */
export default async function uploadBrandAsset(req: {
  params: Params
  user: User
}): Promise<{ url: string; fileId: string }> {
  const email = requireEmail(req.user)
  const { slot, fileName, data, mimeType } = req.params
  if (slot !== 'logo' && slot !== 'alt_logo') {
    throw new Error(`Invalid slot "${slot}". Expected "logo" or "alt_logo".`)
  }

  const urlCol = slot === 'logo' ? 'logo_url' : 'alt_logo_url'
  const idCol = slot === 'logo' ? 'logo_file_id' : 'alt_logo_file_id'

  // Ensure a row exists for this user, then read the previous file id for this slot.
  await retoolDb.query(
    `INSERT INTO brand_settings (owner_email) VALUES ($1) ON CONFLICT (owner_email) DO NOTHING`,
    [email],
  )
  const existing = await retoolDb.query<{ file_id: string | null }>(
    `SELECT ${idCol} AS file_id FROM brand_settings WHERE owner_email = $1`,
    [email],
  )
  const prevId = existing.data[0]?.file_id
  if (prevId) {
    try {
      await retoolStorage.delete({ fileId: prevId })
    } catch {
      // Ignore if already gone.
    }
  }

  const uploaded = await retoolStorage.upload({
    fileName,
    data,
    mimeType: mimeType ?? 'image/png',
    isPublic: true,
    shouldOverwriteOnNameCollision: true,
  })

  const { url, id } = uploaded.data

  await retoolDb.query(
    `UPDATE brand_settings SET ${urlCol} = $1, ${idCol} = $2, updated_at = now() WHERE owner_email = $3`,
    [url, id, email],
  )

  return { url, fileId: id }
}
