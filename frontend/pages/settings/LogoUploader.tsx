import { useRef, useState } from 'react'
import { Upload, Trash2, Loader2, ImageIcon } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Card } from '../../lib/shadcn/card'
import { useUploadBrandAsset, useRemoveBrandAsset } from '../../hooks/backend/brand'
import { fileToBase64 } from '../../utils/fileToBase64'
import { toast } from '../../lib/shadcn/sonner'

interface Props {
  slot: 'logo' | 'alt_logo'
  label: string
  hint: string
  url: string | null
  onChanged: () => void
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'
const MAX_BYTES = 5 * 1024 * 1024

export function LogoUploader({ slot, label, hint, url, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { trigger: upload } = useUploadBrandAsset()
  const { trigger: remove } = useRemoveBrandAsset()
  const [busy, setBusy] = useState(false)

  async function onSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_BYTES) {
      toast.error('Image must be under 5 MB')
      return
    }
    setBusy(true)
    try {
      const data = await fileToBase64(file)
      await upload({ slot, fileName: file.name, data, mimeType: file.type || 'image/png' }).result
      toast.success(`${label} uploaded`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function onRemove() {
    setBusy(true)
    try {
      await remove({ slot }).result
      toast.success(`${label} removed`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Card className="p-4 flex items-center gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 overflow-hidden">
          {url ? (
            <img src={url} alt={label} className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={inputRef} type="file" accept={ACCEPT} onChange={onSelect} className="hidden" />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {url ? 'Replace' : 'Upload'}
          </Button>
          {url && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRemove}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}
