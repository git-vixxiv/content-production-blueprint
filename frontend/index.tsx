import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { RetoolAuthProvider } from './hooks/useRetoolAuth'
import { RetoolAuthGate } from './components/RetoolAuthGate'
import './theme.css'
import App from './App'
import { bootstrapPublishedMetrics, enqueuePublishedMetric } from './hooks/publishedMetricsClient'
import { markAppEvalCompleteEnd } from './publishedPerfBootstrap'
import './darkMode'
import './inspectorOverlay'

// Derive basename so React Router strips the serving prefix before matching routes.
// Handles two patterns:
//   /sandbox/{id}/agent-vite  — Vite dev proxy
//   /_/rr/app/{appIdentifier} — on-prem published iframe (RrPublishedAppContainer)
const viteBaseMatch = window.location.pathname.match(/^(.*\/agent-vite)/)
const rrAppMatch = window.location.pathname.match(/^(\/_\/rr\/app\/[^/]+)/)
const basename = viteBaseMatch?.[1] ?? rrAppMatch?.[1] ?? '/'
const initialSearchParams = new URLSearchParams(window.location.search)
const expectedParentOrigin = initialSearchParams.get('retool-parent-origin') ?? window.location.origin

const previewInternalSearchParamNames = ['sandboxToken', 'retool-theme', 'retool-parent-origin', 'retool-iframe-hosted-mode']
const previewInternalSearchParams = new URLSearchParams()
for (const name of previewInternalSearchParamNames) {
  for (const value of initialSearchParams.getAll(name)) {
    previewInternalSearchParams.append(name, value)
  }
}

// Derive the parent frame's origin to scope postMessage calls and validate incoming messages.
function getParentOrigin(): string | null {
  if (window.location.ancestorOrigins?.length) {
    return window.location.ancestorOrigins[0] ?? null
  }
  // ancestorOrigins is unavailable in Firefox, so document.referrer is the fallback.
  try {
    return new URL(document.referrer).origin
  } catch {
    return null
  }
}
const PARENT_ORIGIN = getParentOrigin()

/**
 * Syncs in-app navigation with the parent window when rendered inside an iframe.
 * Sends IFRAME_NAVIGATED when the iframe url path changes so the parent browser url path updates
 * Listens for BROWSER_NAVIGATED from the parent to handle browser back/forward in the iframe
 */
function NavigationSyncer() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()

  useEffect(() => {
    const inIframe = window.self !== window.top
    if (!inIframe) return
    console.debug('[NavigationSyncer] location changed', { pathname: location.pathname, navigationType, inIframe })
    // Only PUSH navigations are user-initiated forward navigations to report to the parent.
    // POP = initial load or browser back/forward (parent drives via popstate).
    // REPLACE = programmatic redirect or parent-driven ${BROWSER_NAVIGATED_MESSAGE_TYPE}.
    if (navigationType !== 'PUSH') return
    const msg = { type: 'IFRAME_NAVIGATED', pathname: location.pathname, search: location.search, hash: location.hash }
    console.debug('[NavigationSyncer] posting to parent', msg)
    if (PARENT_ORIGIN !== null) {
      window.parent.postMessage(msg, PARENT_ORIGIN)
    } else {
      console.warn('[NavigationSyncer] no parent origin found, skipping posting IFRAME_NAVIGATED message')
    }

  }, [location, navigationType])

  // listen to browser back/forward navigations from the parent browser
  useEffect(() => {
    const inIframe = window.self !== window.top
    if (!inIframe) return
    console.debug('[NavigationSyncer] setting up BROWSER_NAVIGATED listener', { inIframe })
    const handleMessage = (event: MessageEvent) => {
      if (PARENT_ORIGIN === null) return
      if (PARENT_ORIGIN !== '*' && event.origin !== PARENT_ORIGIN) return

      if (event.data?.type === 'BROWSER_NAVIGATED') {
        console.debug('[NavigationSyncer] received BROWSER_NAVIGATED', event.data)
        navigate(event.data.path, { replace: true })
        return
      }

      if (event.data?.type === 'PARENT_HASH_CHANGED') {
        console.debug('[NavigationSyncer] received PARENT_HASH_CHANGED', event.data)
        const nextHash: string = event.data.hash ?? ''
        if (window.location.hash !== nextHash) {
          // Replace (not push) so this doesn't duplicate the parent's entry in joint session history.
          const oldURL = window.location.href
          navigate({ search: window.location.search, hash: nextHash }, { replace: true })
          window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: window.location.href }))
        }
        return
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [navigate])

  return null
}

const getAppRelativeLocation = () => {
  const rawPathname = window.location.pathname
  const pathname = rawPathname.startsWith(basename) ? rawPathname.slice(basename.length) || '/' : rawPathname
  const params = new URLSearchParams(window.location.search)
  for (const name of previewInternalSearchParamNames) {
    params.delete(name)
  }
  const search = params.toString() ? '?' + params.toString() : ''

  return {
    pathname: pathname.startsWith('/') ? pathname : '/' + pathname,
    search,
    hash: window.location.hash,
  }
}

const emitLocationChange = () => {
  window.parent.postMessage(
    {
      type: 'RETOOL_PREVIEW_LOCATION_CHANGED',
      ...getAppRelativeLocation(),
    },
    expectedParentOrigin,
  )
}

const normalizePreviewPath = (path: unknown) => {
  if (typeof path !== 'string') return '/'
  const trimmed = path.trim()
  if (!trimmed) return '/'

  try {
    const url = new URL(trimmed, window.location.origin)
    return url.pathname + url.search + url.hash
  } catch {
    return trimmed.startsWith('/') ? trimmed : '/' + trimmed
  }
}

const toSandboxPath = (path: string) => {
  const normalized = normalizePreviewPath(path)
  const url = new URL(normalized, window.location.origin)
  const appPathname = basename !== '/' && url.pathname.startsWith(basename)
    ? url.pathname.slice(basename.length) || '/'
    : url.pathname
  const sandboxPathname = basename === '/' ? appPathname : basename + appPathname

  for (const name of previewInternalSearchParamNames) {
    url.searchParams.delete(name)
  }
  previewInternalSearchParams.forEach((value, name) => {
    url.searchParams.append(name, value)
  })

  return sandboxPathname + url.search + url.hash
}

const withPreviewParams = (url: string): string => {
  try {
    const u = new URL(url, window.location.href)
    for (const name of previewInternalSearchParamNames) {
      if (u.searchParams.has(name)) continue
      for (const value of previewInternalSearchParams.getAll(name)) {
        u.searchParams.append(name, value)
      }
    }
    return u.pathname + u.search + u.hash
  } catch (err) {
    console.error('withPreviewParams error', err)
    return url
  }
}

const originalPushState = window.history.pushState.bind(window.history)
window.history.pushState = (...args) => {
  // args[2] is pushState's optional url. React Router passes a param-less app route here,
  // so rewrite it to carry the preview params forward. A non-string (url omitted) leaves
  // the current URL — and the params already on it — untouched.
  if (typeof args[2] === 'string') {
    args[2] = withPreviewParams(args[2])
  }
  originalPushState(...args)
  emitLocationChange()
}

const originalReplaceState = window.history.replaceState.bind(window.history)
window.history.replaceState = (...args) => {
  // args[2] is replaceState's optional url; same param re-injection as pushState above.
  if (typeof args[2] === 'string') {
    args[2] = withPreviewParams(args[2])
  }
  originalReplaceState(...args)
  emitLocationChange()
}

window.addEventListener('popstate', (event) => {
  // Programmatic pushState already emits; only report native back/forward navigations here.
  if (event.isTrusted) {
    emitLocationChange()
  }
})
window.addEventListener('hashchange', emitLocationChange)
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.origin !== expectedParentOrigin) {
    return
  }

  if (event.data?.type === 'RETOOL_PREVIEW_NAVIGATE') {
    originalPushState({}, '', toSandboxPath(event.data.path))
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  }

  if (event.data?.type === 'RETOOL_PREVIEW_HISTORY') {
    if (event.data.direction === 'back') {
      window.history.back()
    } else if (event.data.direction === 'forward') {
      window.history.forward()
    }
  }

  if (event.data?.type === 'retool-theme-change') {
    const next = event.data.theme
    if (next === 'light' || next === 'dark' || next === 'system') {
      previewInternalSearchParams.set('retool-theme', next)
    }
  }

  if (event.data?.type === 'RETOOL_PREVIEW_RELOAD') {
    const next = event.data.theme
    if (next === 'light' || next === 'dark' || next === 'system') {
      previewInternalSearchParams.set('retool-theme', next)
    }
    const reloadUrl = new URL(window.location.href)
    for (const name of previewInternalSearchParamNames) {
      reloadUrl.searchParams.delete(name)
    }
    previewInternalSearchParams.forEach((value, name) => {
      reloadUrl.searchParams.append(name, value)
    })
    window.location.replace(reloadUrl.toString())
  }
})

// Surfaces render errors to the dev pill via a window event; DCE'd in published builds.
class RetoolRuntimeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  componentDidMount(): void {
    import.meta.hot?.on('vite:afterUpdate', this.resetOnHmr)
  }

  componentWillUnmount(): void {
    import.meta.hot?.off('vite:afterUpdate', this.resetOnHmr)
  }

  // Without this, an HMR patch lands but the children are unmounted in the error state,
  // so React Fast Refresh has nothing to re-render and the iframe stays blank until a full reload.
  resetOnHmr = (): void => {
    if (this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    window.dispatchEvent(
      new CustomEvent('retool:react-error', {
        detail: {
          message: error.message,
          componentStack: info.componentStack ?? '',
        },
      }),
    )
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return null
    }
    return this.props.children
  }
}

// React.lazy rejects during render when a route chunk fails to load — e.g. the per-fetch
// asset token is rejected with 401 (expired) or 403 (access revoked), or a newer version
// was published. Without a boundary React unmounts the whole tree, leaving a blank iframe.
// This renders a message instead. We can't auto-recover by reloading: the sandboxed
// null-origin iframe can't read sessionStorage (SecurityError) and a self-reload wouldn't
// carry the session cookie, so the HTML route couldn't re-auth — that needs a
// parent-driven reload (tracked as a follow-up).
class RetoolPublishedErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(error: Error): { failed: boolean } {
    console.error('RetoolPublishedErrorBoundary error', error)
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: React.ErrorInfo): void {
    enqueuePublishedMetric('increment', 'rr.published_fe.app_error', 1, { source: 'error_boundary' })
  }

  render(): React.ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return (
      <div
        style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          margin: 0,
          background: '#f6f8fa',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            background: '#fff',
            borderRadius: 8,
            boxShadow: '0 2px 24px rgba(31, 35, 40, 0.06)',
            padding: '32px 40px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ marginTop: 0, fontWeight: 600, color: '#d32f2f', fontSize: '2em' }}>Something went wrong</h1>
          <p style={{ color: '#444', marginBottom: 0, marginTop: 16, fontSize: '1.05em' }}>
            Refresh the page to try again.
          </p>
        </div>
      </div>
    )
  }
}

// Surface React render errors to the dev pill: onCaughtError = caught by any boundary (incl. a user
// fallback), onUncaughtError = escaped every boundary (blank app). Each preserves React's default
// logging first (console.error for caught; reportError for uncaught, which also feeds the R19 rollback
// detector). RetoolRuntimeErrorBoundary also dispatches — the overlay dedupes by (message, componentStack).
const dispatchReactError = (error: unknown, componentStack: string): void => {
  window.dispatchEvent(
    new CustomEvent('retool:react-error', {
      detail: { message: error instanceof Error ? error.message : String(error), componentStack },
    }),
  )
}
const rootOptions = {
  onCaughtError: (error: unknown, info: { componentStack?: string | undefined }) => {
    console.error(error)
    dispatchReactError(error, info.componentStack ?? '')
  },
  onUncaughtError: (error: unknown, info: { componentStack?: string | undefined }) => {
    reportError(error)
    dispatchReactError(error, info.componentStack ?? '')
  },
  // Recoverable errors are React's own retry-and-succeed path — handled, so just log, no pill.
  // It also gives rootOptions a property in common with React 18's RootOptions, so the sandbox's
  // React 18 @types accept the object (TS2559) while React 19 honors onCaughtError/onUncaughtError.
  onRecoverableError: (error: unknown) => reportError(error),
}
// Only wire the dev error pill in dev — the overlay is injected by the Vite dev server, not the
// production build. In published, RetoolPublishedErrorBoundary + React's defaults handle errors,
// and Vite tree-shakes rootOptions out of the bundle.
const root = import.meta.env['VITE_PUBLISHED_MODE']
  ? ReactDOM.createRoot(document.getElementById('root')!)
  : ReactDOM.createRoot(document.getElementById('root')!, rootOptions)
markAppEvalCompleteEnd()

// In the on-prem published iframe the document has an opaque origin, so Safari throws on any history.pushState/replaceState with a URL.
// BrowserRouter can't work there
// MemoryRouter keeps routing in memory and never touches window.history, sidestepping the block.
// The parent URL stays in sync via NavigationSyncer's postMessage bridge, which reads React Router state, not window.location. 
// We pass in the initial entry to the MemoryRouter so that we can use it for deep links and refreshes.
const inIframeMode = import.meta.env['VITE_PUBLISHED_MODE'] && window.self !== window.top
const useMemoryRouter = inIframeMode

const initialAppEntry = (() => {
  const { pathname, search, hash } = window.location
  const appPath = pathname.startsWith(basename) ? pathname.slice(basename.length) || '/' : pathname
  return (appPath.startsWith('/') ? appPath : '/' + appPath) + search + hash
})()
  
const Router = useMemoryRouter ? MemoryRouter : BrowserRouter
const routerProps = useMemoryRouter ? { initialEntries: [initialAppEntry] } : { basename }

root.render(
  <React.StrictMode>
    <RetoolAuthProvider>
      <RetoolAuthGate>
        <Router {...routerProps}>
          {/* Only include NavigationSyncer in bundled code when we are in an iframe and in preview mode */}
          {import.meta.env['VITE_PUBLISHED_MODE'] && window.self !== window.top && (
            <NavigationSyncer />
          )}
          {import.meta.env['VITE_PUBLISHED_MODE'] ? (
            <RetoolPublishedErrorBoundary>
              <App />
            </RetoolPublishedErrorBoundary>
          ) : (
            <RetoolRuntimeErrorBoundary>
              <App />
            </RetoolRuntimeErrorBoundary>
          )}
        </Router>
      </RetoolAuthGate>
    </RetoolAuthProvider>
  </React.StrictMode>
)

emitLocationChange()

bootstrapPublishedMetrics()