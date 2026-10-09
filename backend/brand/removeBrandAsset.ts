import { requireEmail, type User } from '../lib/auth'

type Slot = 'logo' | 'alt_logo'

interface Params {
  slot: Slot
}

/**
 * Removes one of the current user's brand logos: deletes the file and clears its columns.
 */
export default async function removeBrandAsset(req: {
  params: Params
  user: User
}): Promise<{ ok: boolean }> {
  const email = requireEmail(req.user)
  const { slot } = req.params
  if (slot !== 'logo' && slot !== 'alt_logo') {
    throw new Error(`Invalid slot "${slot}". Expected "logo" or "alt_logo".`)
  }

  const urlCol = slot === 'logo' ? 'logo_url' : 'alt_logo_url'
  const idCol = slot === 'logo' ? 'logo_file_id' : 'alt_logo_file_id'

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

  await retoolDb.query(
    `UPDATE brand_settings SET ${urlCol} = NULL, ${idCol} = NULL, updated_at = now() WHERE owner_email = $1`,
    [email],
  )
  return { ok: true }
}
