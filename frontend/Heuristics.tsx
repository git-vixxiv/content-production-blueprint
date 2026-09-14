import { useEffect, useState } from 'react'
import { Plus, Loader2, ScrollText, Lock } from 'lucide-react'
import { useListHeuristics, useToggleHeuristic, useCreateHeuristic, useDeleteHeuristic } from '../hooks/backend/heuristics'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { Layout } from '../components/Layout'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { toast } from '../lib/shadcn/sonner'
import { Button } from '../lib/shadcn/button'
import { Card } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Switch } from '../lib/shadcn/switch'
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
import type { HeuristicRule } from '../types'

export default function Heuristics() {
  const { data, loading, trigger } = useListHeuristics()
  const { trigger: toggle } = useToggleHeuristic()
  const { trigger: create, loading: creating } = useCreateHeuristic()
  const { trigger: remove } = useDeleteHeuristic()
  const { isAdmin } = useIsAdmin()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [weight, setWeight] = useState('3')

  useEffect(() => {
    trigger()
  }, [])

  const rules = (data ?? []) as HeuristicRule[]

  async function onToggle(rule: HeuristicRule, active: boolean) {
    await toggle({ id: rule.id, is_active: active }).result
    trigger({}, { skipCache: true })
  }

  async function onDelete(rule: HeuristicRule) {
    await remove({ id: rule.id }).result
    toast.success('Rule deleted')
    trigger({}, { skipCache: true })
  }

  async function onCreate() {
    if (!category.trim() || !description.trim()) return
    await create({
      rule_category: category.trim(),
      description: description.trim(),
      weight: Number(weight) || 3,
    }).result
    setOpen(false)
    setCategory('')
    setDescription('')
    setWeight('3')
    trigger({}, { skipCache: true })
  }

  return (
    <Layout>
      <div className="border-b border-border bg-card/50 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="h-6 w-6" />
            Rules Engine
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your proprietary non-negotiables, shared org-wide. Active rules are enforced on every script pass.
          </p>
        </div>
        {isAdmin ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New Rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Heuristic Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="hook_timing, anti_fluff, b2b_callout..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rule</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Technical proof point within the first 45 seconds."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Weight (1–5)</Label>
                <Input type="number" min={1} max={5} value={weight} onChange={(e) => setWeight(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onCreate} disabled={creating || !category.trim() || !description.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Add rule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Read-only · admin access required to edit
          </span>
        )}
      </div>

      <div className="p-8">
        {loading && rules.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rules...
          </div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {rules.map((r) => (
              <Card key={r.id} className="p-4 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="font-mono text-xs">
                      {r.rule_category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">weight {String(r.weight)}</span>
                  </div>
                  <p className={`text-sm ${r.is_active ? '' : 'text-muted-foreground line-through'}`}>
                    {r.description}
                  </p>
                </div>
                <Switch checked={r.is_active} disabled={!isAdmin} onCheckedChange={(v) => onToggle(r, v)} />
                {isAdmin && (
                  <ConfirmDelete
                    title="Delete this rule?"
                    description={`"${r.description}" will be permanently removed from your org-wide heuristics.`}
                    onConfirm={() => onDelete(r)}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
