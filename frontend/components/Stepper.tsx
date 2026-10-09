import { Check } from 'lucide-react'
import { cn } from '../lib/shadcn/utils'
import type { BlueprintStatus } from '../types'
import { STATUS_ORDER, STATUS_LABEL } from '../types'

export function Stepper({ status }: { status: BlueprintStatus }) {
  const currentIndex = STATUS_ORDER.indexOf(status)
  return (
    <div className="flex items-center w-full">
      {STATUS_ORDER.map((s, i) => {
        const done = i < currentIndex
        const current = i === currentIndex
        return (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  current && 'border-primary text-primary',
                  !done && !current && 'border-border text-muted-foreground',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-[11px] whitespace-nowrap',
                  current ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {STATUS_LABEL[s]}
              </span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <div className={cn('h-0.5 flex-1 mx-2 mb-5', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}
