import { Loader2, Search, Target, AlertTriangle, ArrowRight, ExternalLink } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Card } from '../../lib/shadcn/card'
import { Badge } from '../../lib/shadcn/badge'
import type { VideoBlueprint } from '../../types'

interface Props {
  blueprint: VideoBlueprint
  onRun: () => void
  onRunScript: () => void
  running: boolean
  scripting: boolean
}

export function ResearchTab({ blueprint, onRun, onRunScript, running, scripting }: Props) {
  const gap = blueprint.competitor_gap_data

  if (!gap) {
    return (
      <Card className="p-10 text-center space-y-3">
        <Search className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">No competitor research yet</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Runs a multimodal-style pass over the competitor URLs and intake notes to surface pacing flaws and
          missing technical depth, then recommends a differentiating angle.
        </p>
        <Button onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Run competitor research
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 border-primary/40 bg-primary/5">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Target className="h-4 w-4" />
          Recommended angle
        </div>
        <p className="mt-2 text-sm">{gap.recommended_angle}</p>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Synthesized gaps
        </h3>
        <div className="flex flex-wrap gap-2">
          {gap.synthesized_gaps.map((g, i) => (
            <Badge key={i} variant="secondary" className="font-normal">
              {g}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {gap.competitors.map((c, i) => (
          <Card key={i} className="p-4 space-y-3">
            <a
              href={c.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:underline break-all"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {c.url}
            </a>
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Pacing flaws</div>
              <ul className="text-sm list-disc pl-4 space-y-0.5">
                {c.pacing_flaws.map((f, j) => (
                  <li key={j}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Missing technical depth</div>
              <ul className="text-sm list-disc pl-4 space-y-0.5">
                {c.missing_technical_depth.map((f, j) => (
                  <li key={j}>{f}</li>
                ))}
              </ul>
            </div>
            <div className="text-sm">
              <span className="text-xs font-semibold text-muted-foreground">Opportunity: </span>
              {c.opportunity}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Re-run research
        </Button>
        <Button onClick={onRunScript} disabled={scripting} className="ml-auto">
          {scripting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Generate script
        </Button>
      </div>
    </div>
  )
}
