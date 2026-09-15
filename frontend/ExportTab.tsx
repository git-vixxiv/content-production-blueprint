import { useState } from 'react'
import { Download, Copy, Check, FileText, Info } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Card } from '../../lib/shadcn/card'
import { Alert, AlertDescription, AlertTitle } from '../../lib/shadcn/alert'
import { blueprintToMarkdown } from '../../utils/exportBlueprint'
import type { VideoBlueprint } from '../../types'

export function ExportTab({ blueprint }: { blueprint: VideoBlueprint }) {
  const [copied, setCopied] = useState(false)
  const markdown = blueprintToMarkdown(blueprint)

  function download() {
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${blueprint.title.slice(0, 60).replace(/[^a-z0-9]+/gi, '-')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button
          onClick={() => {
            void navigator.clipboard.writeText(markdown)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy Markdown'}
        </Button>
        <Button variant="outline" onClick={download}>
          <Download className="h-4 w-4" />
          Download .md
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Notion / Google Docs export</AlertTitle>
        <AlertDescription className="text-sm">
          One-click push to Notion or Google Docs runs through Retool REST resources. Connect those resources
          and I&apos;ll wire the webhook exporter — until then, copy or download the Markdown bundle below.
        </AlertDescription>
      </Alert>

      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
          <FileText className="h-3.5 w-3.5" />
          Blueprint export preview
        </div>
        <pre className="text-xs whitespace-pre-wrap leading-relaxed max-h-[480px] overflow-auto">{markdown}</pre>
      </Card>
    </div>
  )
}
