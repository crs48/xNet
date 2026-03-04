/**
 * Root layout with ErrorBoundary
 */
import { createRootRoute, Outlet, Link, useLocation } from '@tanstack/react-router'
import {
  useIdentity,
  ErrorBoundary,
  HubStatusIndicator,
  DemoBanner,
  useDemoMode
} from '@xnetjs/react'
import { ThemeToggle } from '@xnetjs/ui'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { GlobalSearch } from '../components/GlobalSearch'
import { Sidebar } from '../components/Sidebar'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  const { identity } = useIdentity()
  const location = useLocation()
  const { isDemo, limits } = useDemoMode()

  return (
    <div className="flex flex-col h-screen">
      {/* Demo mode banner */}
      {isDemo && limits && <DemoBanner evictionHours={limits.evictionHours} />}

      <header
        className={`h-[52px] flex items-center justify-between px-4 border-b border-border bg-background ${isDemo && limits ? 'mt-10' : ''}`}
      >
        <Link
          to="/"
          className="text-lg font-semibold text-foreground no-underline hover:no-underline"
        >
          xNet
        </Link>
        <GlobalSearch />
        <div className="flex items-center gap-3">
          <HubStatusIndicator />
          <ThemeToggle />
          {identity && (
            <span className="text-xs text-muted-foreground font-mono" title={identity.did}>
              {identity.did.slice(0, 16)}...
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary
            resetKey={location.pathname}
            fallback={({ error, reset }) => <ErrorFallback error={error} reset={reset} />}
          >
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

// ─── Error Fallback UI ──────────────────────────────────────────────────────

function ErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{error.message}</p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw size={14} />
          Try again
        </button>
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors no-underline text-foreground"
        >
          Go home
        </Link>
      </div>
      <details className="mt-6 text-left w-full max-w-md">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
          Technical details
        </summary>
        <pre className="mt-2 p-3 bg-secondary rounded-md text-xs overflow-auto max-h-40 text-muted-foreground">
          {error.stack}
        </pre>
      </details>
    </div>
  )
}
