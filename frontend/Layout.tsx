import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, ScrollText, Users, Clapperboard, Settings, Github } from 'lucide-react'
import { cn } from '../lib/shadcn/utils'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/heuristics', label: 'Rules Engine', icon: ScrollText },
  { to: '/creators', label: 'Creators', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/export', label: 'Export to GitHub', icon: Github },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Clapperboard className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Blueprint Studio</div>
            <div className="text-xs text-muted-foreground">Pre-production engine</div>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto p-4 text-xs text-muted-foreground">
          12h &rarr; 15min per video
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
    </div>
  )
}
