import { useState } from 'react'
import { Trash2, Loader2 } from 'lucide-react'
import { Button } from '../lib/shadcn/button'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '../lib/shadcn/alert-dialog'

interface Props {
  title: string
  description: string
  onConfirm: () => Promise<void>
  /** Visual style of the trigger. */
  trigger?: 'icon' | 'button'
  triggerLabel?: string
  disabled?: boolean
}

/** A trash trigger that opens a confirmation dialog before running a destructive action. */
export function ConfirmDelete({
  title,
  description,
  onConfirm,
  trigger = 'icon',
  triggerLabel = 'Delete',
  disabled,
}: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handle() {
    setBusy(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger === 'icon' ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label={triggerLabel}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {triggerLabel}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              void handle()
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
