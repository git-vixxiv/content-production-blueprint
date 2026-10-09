import { Plus, X } from 'lucide-react'
import { Button } from '../../lib/shadcn/button'
import { Input } from '../../lib/shadcn/input'

interface Props {
  colors: string[]
  onChange: (colors: string[]) => void
}

const HEX_RE = /^#[0-9a-f]{6}$/i

function normalize(v: string): string {
  const t = v.trim()
  if (!t) return ''
  return t.startsWith('#') ? t : `#${t}`
}

export function BrandColors({ colors, onChange }: Props) {
  function update(index: number, value: string) {
    const next = [...colors]
    next[index] = value
    onChange(next)
  }

  function remove(index: number) {
    onChange(colors.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {colors.map((c, i) => {
          const hex = normalize(c)
          const valid = HEX_RE.test(hex)
          return (
            <div key={i} className="flex items-center gap-2">
              <label className="relative h-10 w-10 shrink-0 rounded-md border border-border overflow-hidden">
                <span
                  className="block h-full w-full"
                  style={{ backgroundColor: valid ? hex : 'transparent' }}
                />
                <input
                  type="color"
                  value={valid ? hex : '#000000'}
                  onChange={(e) => update(i, e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label={`Color ${i + 1} picker`}
                />
              </label>
              <Input
                value={c}
                onChange={(e) => update(i, e.target.value)}
                placeholder="#1A2B3C"
                className={`font-mono max-w-[160px] ${c && !valid ? 'border-destructive' : ''}`}
              />
              {c && !valid && <span className="text-xs text-destructive">6-digit hex</span>}
              <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove color">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
      </div>
      {colors.length < 4 && (
        <Button variant="outline" size="sm" onClick={() => onChange([...colors, ''])}>
          <Plus className="h-4 w-4" />
          Add color
        </Button>
      )}
      <p className="text-xs text-muted-foreground">Up to 4 brand colors.</p>
    </div>
  )
}
