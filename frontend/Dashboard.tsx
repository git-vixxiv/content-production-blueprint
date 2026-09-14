import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Clock, Film, Sparkles, Loader2 } from 'lucide-react'
import { useListBlueprints, useCreateBlueprint, useDeleteBlueprint } from '../hooks/backend/blueprints'
import { useListCreators } from '../hooks/backend/creators'
import { Layout } from '../components/Layout'
import { StatusBadge } from '../components/StatusBadge'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { toast } from '../lib/shadcn/sonner'
import { Button } from '../lib/shadcn/button'
import { Card } from '../lib/shadcn/card'
import { Input } from '../lib/shadcn/input'
import { Textarea } from '../lib/shadcn/textarea'
import { Label } from '../lib/shadcn/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '../lib/shadcn/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import type { VideoBlueprint, Creator, BlueprintStatus } from '../types'
import { STATUS_ORDER } from '../types'

export default function Dashboard() {
  const navigate = useNavigate()
  const { data, loading, trigger } = useListBlueprints()
  const { data: creators, trigger: loadCreators } = useListCreators()
  const { trigger: create, loading: creating } = useCreateBlueprint()
  const { trigger: remove } = useDeleteBlueprint()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [creatorId, setCreatorId] = useState('')
  const [urls, setUrls] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    trigger()
    loadCreators()
  }, [])

  const blueprints = (data ?? []) as VideoBlueprint[]
  const creatorList = (creators ?? []) as Creator[]

  async function onDelete(id: string, title: string) {
    await remove({ id }).result
    toast.success(`Deleted “${title}”`)
    trigger({}, { skipCache: true })
  }

  const counts = STATUS_ORDER.reduce<Record<string, number>>((acc, s) => {
    acc[s] = blueprints.filter((b) => b.status === s).length
    return acc
  }, {})

  async function handleCreate() {
    if (!title.trim() || !creatorId) return
    const res = await create({
      title: title.trim(),
      creator_id: creatorId,
      raw_interview_text: notes.trim() || undefined,
      competitor_urls: urls
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean),
    }).result
    setOpen(false)
    setTitle('')
    setUrls('')
    setNotes('')
    const newId = (res as { id?: string } | undefined)?.id
    if (newId) navigate(`/blueprint/${newId}`)
    else trigger()
  }

  return (
    <Layout>
      <div className="border-b border-border bg-card/50 px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Video Blueprints</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Intake to recording-ready cue sheets, governed by your heuristics.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New Blueprint
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Video Blueprint</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Working title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Why your Postgres pool is killing throughput"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Creator</Label>
                  <Select value={creatorId} onValueChange={setCreatorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a creator" />
                    </SelectTrigger>
                    <SelectContent>
                      {creatorList.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Competitor URLs (one per line)</Label>
                  <Textarea
                    value={urls}
                    onChange={(e) => setUrls(e.target.value)}
                    rows={2}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Raw intake notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Unorganized thoughts, the failure that happened, the proof you have..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={!title.trim() || !creatorId || creating}>
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
          <StatCard icon={Film} label="Total" value={blueprints.length} />
          {STATUS_ORDER.map((s) => (
            <StatCard key={s} label={labelFor(s)} value={counts[s] ?? 0} />
          ))}
        </div>
      </div>

      <div className="p-8">
        {loading && blueprints.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading blueprints...
          </div>
        ) : blueprints.length === 0 ? (
          <Card className="p-12 text-center">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No blueprints yet</p>
            <p className="text-sm text-muted-foreground">Create your first blueprint to start the pipeline.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {blueprints.map((b) => (
              <Card
                key={b.id}
                onClick={() => navigate(`/blueprint/${b.id}`)}
                className="p-5 cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium leading-snug line-clamp-2">{b.title}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <StatusBadge status={b.status} />
                    <span onClick={(e) => e.stopPropagation()}>
                      <ConfirmDelete
                        title="Delete this blueprint?"
                        description={`“${b.title}” and all of its research, script, and packaging will be permanently removed.`}
                        onConfirm={() => onDelete(b.id, b.title)}
                      />
                    </span>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{b.creator_name ?? 'Unassigned'}</span>
                  {b.script_json && (
                    <span className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      Fluff {b.script_json.anti_fluff_score}
                    </span>
                  )}
                  <span className="flex items-center gap-1 ml-auto">
                    <Clock className="h-3 w-3" />
                    {new Date(b.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </Card>
  )
}

function labelFor(s: BlueprintStatus): string {
  return { intake: 'Intake', researched: 'Researched', scripted: 'Scripted', packaged: 'Packaged', ready: 'Ready' }[s]
}
