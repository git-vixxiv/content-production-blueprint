import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Loader2, Save, Palette, Image as ImageIcon, MessageSquareQuote } from 'lucide-react'
import { useGetBrandSettings, useSaveBrandSettings } from '../hooks/backend/brand'
import { Layout } from '../components/Layout'
import { Button } from '../lib/shadcn/button'
import { Card } from '../lib/shadcn/card'
import { Textarea } from '../lib/shadcn/textarea'
import { LogoUploader } from './settings/LogoUploader'
import { BrandColors } from './settings/BrandColors'
import { toast } from '../lib/shadcn/sonner'
import type { BrandSettings } from '../types'

const VOICE_PLACEHOLDER = `How should scripts sound and feel? For example:
- Direct and technical; assume a senior-engineer audience.
- First-person, opinionated, no hedging.
- Always cite a concrete failure mode or benchmark.
- Avoid marketing language and hype words.`

export default function Settings() {
  const { data, loading, trigger } = useGetBrandSettings()
  const { trigger: save, loading: saving } = useSaveBrandSettings()

  const [colors, setColors] = useState<string[]>([])
  const [voice, setVoice] = useState('')

  const settings = data as BrandSettings | undefined

  useEffect(() => {
    trigger()
  }, [])

  useEffect(() => {
    if (settings) {
      setColors(settings.brand_colors ?? [])
      setVoice(settings.brand_voice ?? '')
    }
  }, [settings?.updated_at])

  async function onSave() {
    try {
      await save({
        brand_colors: colors.map((c) => c.trim()).filter(Boolean),
        brand_voice: voice,
      }).result
      toast.success('Brand settings saved')
      trigger({}, { skipCache: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    }
  }

  function refresh() {
    trigger({}, { skipCache: true })
  }

  return (
    <Layout>
      <div className="border-b border-border bg-card/50 px-8 py-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Brand assets, colors, and voice guidelines used across the pipeline.
        </p>
      </div>

      <div className="p-8 max-w-3xl space-y-6">
        {loading && !settings ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading settings...
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Brand assets
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <LogoUploader
                  slot="logo"
                  label="Primary logo"
                  hint="PNG, JPG, WEBP, or SVG · up to 5 MB"
                  url={settings?.logo_url ?? null}
                  onChanged={refresh}
                />
                <LogoUploader
                  slot="alt_logo"
                  label="Alternate logo"
                  hint="Light/dark or icon-only variant"
                  url={settings?.alt_logo_url ?? null}
                  onChanged={refresh}
                />
              </div>
            </section>

            <Card className="p-5 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Brand colors
              </h2>
              <BrandColors colors={colors} onChange={setColors} />
            </Card>

            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <MessageSquareQuote className="h-4 w-4" />
                Brand voice
              </h2>
              <p className="text-xs text-muted-foreground">
                Guidelines for how videos should be written. This steers scripting alongside your heuristics.
              </p>
              <Textarea
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                rows={8}
                placeholder={VOICE_PLACEHOLDER}
              />
            </Card>

            <div className="flex justify-end">
              <Button onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
