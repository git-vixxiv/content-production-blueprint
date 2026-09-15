import { useState } from 'react'
import { Loader2, Wand2, ArrowRight, Code2, Eye, Save, GitCompare } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Card } from '../../lib/shadcn/card'
import { Badge } from '../../lib/shadcn/badge'
import { Textarea } from '../../lib/shadcn/textarea'
import { cn } from '../../lib/shadcn/utils'
import type { VideoBlueprint, ScriptJson } from '../../types'

interface Props {
  blueprint: VideoBlueprint
  onRun: () => void
  onRunPackaging: () => void
  onSaveScript: (script: ScriptJson) => Promise<void>
  running: boolean
  packaging: boolean
  saving: boolean
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 65) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function ScriptTab({ blueprint, onRun, onRunPackaging, onSaveScript, running, packaging, saving }: Props) {
  const script = blueprint.script_json
  const [showDiff, setShowDiff] = useState(false)
  const [showJson, setShowJson] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  if (!script) {
    return (
      <Card className="p-10 text-center space-y-3">
        <Wand2 className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">No script generated yet</p>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The deterministic engine (Claude Sonnet 5) assembles your profile, active heuristics, intake notes,
          and competitor gaps into a strict-JSON blueprint, with an auto-revision gate on empty proof assets.
        </p>
        <Button onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Generate script
        </Button>
      </Card>
    )
  }

  function openJson() {
    setJsonDraft(JSON.stringify(script, null, 2))
    setJsonError(null)
    setShowJson(true)
  }

  async function saveJson() {
    try {
      const parsed = JSON.parse(jsonDraft) as ScriptJson
      setJsonError(null)
      await onSaveScript(parsed)
      setShowJson(false)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Card className="px-4 py-2 flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Anti-fluff score</span>
          <span className={cn('text-2xl font-bold', scoreColor(script.anti_fluff_score))}>
            {script.anti_fluff_score}
          </span>
        </Card>
        {script.revision_note && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-0">
            {script.revision_note}
          </Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)}>
            <GitCompare className="h-4 w-4" />
            {showDiff ? 'Hide diff' : 'Diff intake'}
          </Button>
          <Button variant="outline" size="sm" onClick={showJson ? () => setShowJson(false) : openJson}>
            <Eye className="h-4 w-4" />
            JSON inspector
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-4', showDiff && 'lg:grid-cols-[1fr_1.6fr]')}>
        {showDiff && (
          <Card className="p-4 h-fit">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Raw intake (source)</div>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {blueprint.raw_interview_text ?? '(no intake notes)'}
            </p>
          </Card>
        )}

        <div className="space-y-4">
          <Card className="p-5 border-primary/40 bg-primary/5">
            <div className="text-xs font-semibold text-primary mb-3">HOOK · FIRST 45 SECONDS</div>
            <div className="space-y-2 text-sm">
              <Field label="Stakes" value={script.hook_first_45s.stakes} />
              <Field label="Proof asset" value={script.hook_first_45s.proof_asset} />
              <Field label="Open loop" value={script.hook_first_45s.open_loop} />
            </div>
          </Card>

          <div className="space-y-3">
            {script.timeline_blocks.map((block, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="font-mono bg-foreground text-background hover:bg-foreground">
                    {block.timestamp}
                  </Badge>
                  <span className="font-medium text-sm">{block.core_concept}</span>
                </div>
                {block.visual_cue && (
                  <p className="text-sm text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">Visual: </span>
                    {block.visual_cue}
                  </p>
                )}
                {block.code_snippet && (
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto flex items-start gap-2">
                    <Code2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <code className="whitespace-pre-wrap">{block.code_snippet}</code>
                  </pre>
                )}
              </Card>
            ))}
          </div>

          {script.retention_loops?.length > 0 && (
            <Card className="p-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2">Retention loops</div>
              <ul className="text-sm list-disc pl-4 space-y-1">
                {script.retention_loops.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {showJson && (
        <Card className="p-4 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">JSON inspector — manual edits</div>
          <Textarea
            value={jsonDraft}
            onChange={(e) => setJsonDraft(e.target.value)}
            rows={16}
            className="font-mono text-xs"
          />
          {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveJson} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save edits
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowJson(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onRun} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Regenerate
        </Button>
        <Button onClick={onRunPackaging} disabled={packaging} className="ml-auto">
          {packaging ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Generate packaging
        </Button>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-semibold text-muted-foreground">{label}: </span>
      <span>{value}</span>
    </div>
  )
}
