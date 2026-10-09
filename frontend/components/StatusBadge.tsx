import { cn } from '../lib/shadcn/utils'
import { Badge } from '../lib/shadcn/badge'
import type { BlueprintStatus } from '../types'
import { STATUS_LABEL } from '../types'

const STYLES: Record<BlueprintStatus, string> = {
  intake: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  researched: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  scripted: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  packaged: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
}

export function StatusBadge({ status, className }: { status: BlueprintStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('border-0 font-medium', STYLES[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}
