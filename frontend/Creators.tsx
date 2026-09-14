import { useEffect, useState } from 'react'
import { Plus, Loader2, Users } from 'lucide-react'
import { useListCreators, useCreateCreator, useDeleteCreator } from '../hooks/backend/creators'
import { Layout } from '../components/Layout'
import { ConfirmDelete } from '../components/ConfirmDelete'
import { toast } from '../lib/shadcn/sonner'
import { Button } from '../lib/shadcn/button'
import { Card } from '../lib/shadcn/card'
import { Badge } from '../lib/shadcn/badge'
import { Input } from '../lib/shadcn/input'
import { Label } from '../lib/shadcn/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '../lib/shadcn/dialog'
import type { Creator } from '../types'

export default function Creators() {
  const { data, loading, trigger } = useListCreators()
  const { trigger: create, loading: creating } = useCreateCreator()
  const { trigger: remove } = useDeleteCreator()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [niche, setNiche] = useState('')
  const [rpm, setRpm] = useState('')
  const [depth, setDepth] = useState('3')

  useEffect(() => {
    trigger()
  }, [])

  const creators = (data ?? []) as Creator[]

  async function onCreate() {
    if (!name.trim()) return
    await create({
      name: name.trim(),
      niche: niche.trim() || undefined,
      target_rpm: rpm ? Number(rpm) : undefined,
      technical_depth_level: Number(depth) || 3,
    }).result
    setOpen(false)
    setName('')
    setNiche('')
    setRpm('')
    setDepth('3')
    trigger({}, { skipCache: true })
  }

  async function onDelete(id: string, name: string) {
    await remove({ id }).result
    toast.success(`Deleted ${name}`)
    trigger({}, { skipCache: true })
  }

  return (
    <Layout>
      <div className="border-b border-border bg-card/50 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Creators
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Channel profiles that steer scripting heuristics.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              New Creator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Creator Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Rivera" />
              </div>
              <div className="space-y-1.5">
                <Label>Niche</Label>
                <Input
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="Backend Systems & DevOps"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Target RPM ($)</Label>
                  <Input type="number" value={rpm} onChange={(e) => setRpm(e.target.value)} placeholder="22.5" />
                </div>
                <div className="space-y-1.5">
                  <Label>Technical depth (1–5)</Label>
                  <Input type="number" min={1} max={5} value={depth} onChange={(e) => setDepth(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={onCreate} disabled={creating || !name.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Add creator
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="p-8">
        {loading && creators.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading creators...
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {creators.map((c) => (
              <Card key={c.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">{c.niche ?? 'No niche set'}</p>
                  </div>
                  <ConfirmDelete
                    title={`Delete ${c.name}?`}
                    description="This removes the creator profile. Existing blueprints are kept but will no longer show this creator."
                    onConfirm={() => onDelete(c.id, c.name)}
                  />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {c.target_rpm && <Badge variant="secondary">RPM ${c.target_rpm}</Badge>}
                  <Badge variant="outline">Depth {c.technical_depth_level ?? 3}/5</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
