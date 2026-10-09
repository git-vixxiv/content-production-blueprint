import { useState } from 'react'
import { Save, Mic, Loader2, ArrowRight, Info } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Card } from '../../lib/shadcn/card'
import { Textarea } from '../../lib/shadcn/textarea'
import { Label } from '../../lib/shadcn/label'
import { Alert, AlertDescription, AlertTitle } from '../../lib/shadcn/alert'
import type { VideoBlueprint } from '../../types'

interface Props {
  blueprint: VideoBlueprint
  onSave: (fields: { raw_interview_text: string; competitor_urls: string[] }) => Promise<void>
  onRunResearch: () => void
  saving: boolean
  researching: boolean
}

export function IntakeTab({ blueprint, onSave, onRunResearch, saving, researching }: Props) {
  const [notes, setNotes] = useState(blueprint.raw_interview_text ?? '')
  const [urls, setUrls] = useState((blueprint.competitor_urls ?? []).join('\n'))

  async function save() {
    await onSave({
      raw_interview_text: notes,
      competitor_urls: urls.split('\n').map((u) => u.trim()).filter(Boolean),
    })
  }

  return (
    <div className="space-y-5">
      <Alert>
        <Mic className="h-4 w-4" />
        <AlertTitle>Voice intake</AlertTitle>
        <AlertDescription>
          <div className="flex items-start gap-2 text-sm">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Sub-300ms ElevenLabs conversational voice intake runs in a sandboxed custom component and needs
              an ElevenLabs resource connected. It is not wired in this workspace, so use the text intake below.
              The interview agent&apos;s job is to aggressively probe for specific technical evidence (exact
              commands, failure modes, benchmark numbers).
            </span>
          </div>
        </AlertDescription>
      </Alert>

      <Card className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label>Raw interview transcript / brain dump</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            placeholder="What specific terminal command or system failure occurred? Why does standard industry advice fail here? What proof do you have?"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Competitor video URLs (one per line)</Label>
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            rows={3}
            placeholder="https://youtube.com/watch?v=..."
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save intake
          </Button>
          <Button
            onClick={async () => {
              await save()
              onRunResearch()
            }}
            disabled={researching || saving || notes.trim().length === 0}
            className="ml-auto"
          >
            {researching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Run competitor research
          </Button>
        </div>
      </Card>
    </div>
  )
}
