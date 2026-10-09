import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react'
import { useGetBlueprint, useUpdateBlueprint } from '../hooks/backend/blueprints'
import {
  useResearchCompetitors,
  useGenerateScript,
  useGeneratePackaging,
} from '../hooks/backend/pipeline'
import { Layout } from '../components/Layout'
import { Stepper } from '../components/Stepper'
import { StatusBadge } from '../components/StatusBadge'
import { Button } from '../lib/shadcn/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../lib/shadcn/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../lib/shadcn/select'
import { toast } from '../lib/shadcn/sonner'
import { IntakeTab } from './blueprint/IntakeTab'
import { ResearchTab } from './blueprint/ResearchTab'
import { ScriptTab } from './blueprint/ScriptTab'
import { PackagingTab } from './blueprint/PackagingTab'
import { ExportTab } from './blueprint/ExportTab'
import type { VideoBlueprint, ScriptJson, BlueprintStatus } from '../types'
import { STATUS_ORDER, STATUS_LABEL } from '../types'

export default function BlueprintDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, loading, error, trigger: load } = useGetBlueprint()
  const { trigger: update, loading: saving } = useUpdateBlueprint()
  const { trigger: research, loading: researching } = useResearchCompetitors()
  const { trigger: script, loading: scripting } = useGenerateScript()
  const { trigger: pkg, loading: packaging } = useGeneratePackaging()
  const [tab, setTab] = useState('intake')

  const bp = data as VideoBlueprint | undefined

  useEffect(() => {
    if (id) load({ id })
  }, [id])

  useEffect(() => {
    if (bp) setTab(bp.status)
  }, [bp?.status])

  async function refresh() {
    if (id) await load({ id }, { skipCache: true })
  }

  async function saveIntake(fields: { raw_interview_text: string; competitor_urls: string[] }) {
    if (!id) return
    await update({ id, ...fields }).result
    await refresh()
    toast.success('Intake saved')
  }

  async function runResearch() {
    if (!id) return
    setTab('researched')
    try {
      await research({ id }).result
      await refresh()
      toast.success('Competitor research complete')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Research failed')
    }
  }

  async function runScript() {
    if (!id) return
    setTab('scripted')
    try {
      await script({ id }).result
      await refresh()
      toast.success('Script generated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Script generation failed')
    }
  }

  async function runPackaging() {
    if (!id) return
    setTab('packaged')
    try {
      await pkg({ id }).result
      await refresh()
      toast.success('Packaging generated')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Packaging failed')
    }
  }

  async function saveScript(next: ScriptJson) {
    if (!id) return
    await update({ id, script_json: next }).result
    await refresh()
    toast.success('Script edits saved')
  }

  async function changeStatus(status: BlueprintStatus) {
    if (!id) return
    await update({ id, status }).result
    await refresh()
  }

  if (loading && !bp) {
    return (
      <Layout>
        <div className="flex items-center gap-2 p-8 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading blueprint...
        </div>
      </Layout>
    )
  }

  if (error || !bp) {
    return (
      <Layout>
        <div className="p-8">
          <div className="flex items-center gap-2 text-destructive mb-4">
            <AlertCircle className="h-4 w-4" /> {error ?? 'Blueprint not found'}
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="border-b border-border bg-card/50 px-8 py-5">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold truncate">{bp.title}</h1>
              <StatusBadge status={bp.status} />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{bp.creator_name ?? 'Unassigned'}</p>
          </div>
          <div className="shrink-0">
            <Select value={bp.status} onValueChange={(v) => changeStatus(v as BlueprintStatus)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-6 max-w-3xl">
          <Stepper status={bp.status} />
        </div>
      </div>

      <div className="p-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5">
            <TabsTrigger value="intake">Intake</TabsTrigger>
            <TabsTrigger value="researched">Research</TabsTrigger>
            <TabsTrigger value="scripted">Blueprint</TabsTrigger>
            <TabsTrigger value="packaged">Packaging</TabsTrigger>
            <TabsTrigger value="ready">Export</TabsTrigger>
          </TabsList>

          <TabsContent value="intake">
            <IntakeTab
              blueprint={bp}
              onSave={saveIntake}
              onRunResearch={runResearch}
              saving={saving}
              researching={researching}
            />
          </TabsContent>
          <TabsContent value="researched">
            <ResearchTab
              blueprint={bp}
              onRun={runResearch}
              onRunScript={runScript}
              running={researching}
              scripting={scripting}
            />
          </TabsContent>
          <TabsContent value="scripted">
            <ScriptTab
              blueprint={bp}
              onRun={runScript}
              onRunPackaging={runPackaging}
              onSaveScript={saveScript}
              running={scripting}
              packaging={packaging}
              saving={saving}
            />
          </TabsContent>
          <TabsContent value="packaged">
            <PackagingTab
              blueprint={bp}
              onRun={runPackaging}
              onFinalize={() => changeStatus('ready')}
              running={packaging}
              finalizing={saving}
            />
          </TabsContent>
          <TabsContent value="ready">
            <ExportTab blueprint={bp} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}
