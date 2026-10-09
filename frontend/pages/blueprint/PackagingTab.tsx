import { useState } from 'react'
import { Loader2, Package, Copy, Check, Image as ImageIcon, ArrowRight } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Card } from '../../lib/shadcn/card'
import { Badge } from '../../lib/shadcn/badge'
import { cn } from '../../lib/shadcn/utils'
import type { VideoBlueprint } from '../../types'

interface Props {
  blueprint: VideoBlueprint
  onRun: () => void
  onFinalize: () => void
  running: boolean
  finalizing: boolean
}

const TAG_STYLES: Record<string, string> = {
  Contrarian: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  Urgency: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  'Architectural Deep-Dive': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy prompt'}
    </Button>
  )
}

export function PackagingTab({ blueprint, onRun, onFinalize, running, finalizing }: Props) {
  const pkg = blueprint.packaging_data

  if (!pkg) {
    return (
      <Card className="p-10 text-center space-y-3">
        <Package className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Nothing packaged yet</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The CTR engine (OpenAI) produces 15 scored title variants grouped by psychological tag plus thumbnail
          concepts with image-generation prompts.
        </p>
        <Button onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          Generate packaging
        </Button>
      </Card>
    )
  }

  const tags = Array.from(new Set(pkg.titles.map((t) => t.psychological_tag)))

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-3">Title variations ({pkg.titles.length})</h3>
        <div className="space-y-4">
          {tags.map((tag) => (
            <div key={tag}>
              <Badge className={cn('border-0 mb-2', TAG_STYLES[tag] ?? 'bg-muted text-foreground')}>{tag}</Badge>
              <div className="space-y-2">
                {pkg.titles
                  .filter((t) => t.psychological_tag === tag)
                  .map((t, i) => (
                    <Card key={i} className="p-3 flex items-start gap-3">
                      <div className="flex flex-col items-center justify-center w-11 shrink-0">
                        <span className={cn('text-lg font-bold', t.ctr_score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground')}>
                          {t.ctr_score}
                        </span>
                        <span className="text-[10px] text-muted-foreground">CTR</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm leading-snug">{t.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.rationale}</p>
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Thumbnail concepts
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {pkg.thumbnails.map((th, i) => (
            <Card key={i} className="p-4 space-y-2">
              <p className="font-medium text-sm">{th.concept}</p>
              <p className="text-xs text-muted-foreground bg-muted rounded-md p-2 leading-relaxed">
                {th.image_prompt}
              </p>
              <CopyButton text={th.image_prompt} />
            </Card>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          Regenerate
        </Button>
        {blueprint.status !== 'ready' && (
          <Button onClick={onFinalize} disabled={finalizing} className="ml-auto">
            {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Mark ready to film
          </Button>
        )}
      </div>
    </div>
  )
}
