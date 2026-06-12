/**
 * Root layout with ErrorBoundary.
 *
 * Two shells live here during the 0166 rollout: the workbench
 * (rail + panels + tabs + status bar) behind `xnet:shell=workbench`,
 * and the legacy header + sidebar shell as the fallback.
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
import { useState } from 'react'
import { ErrorFallback } from '../components/ErrorFallback'
import { GlobalSearch } from '../components/GlobalSearch'
import { Sidebar } from '../components/Sidebar'
import { WorkspaceCommands } from '../components/WorkspaceCommands'
import { getShellMode } from '../workbench/shell-flag'
import { Workbench } from '../workbench/Workbench'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  const [shell] = useState(getShellMode)

  if (shell === 'workbench') {
    return (
      <Workbench>
        <Outlet />
      </Workbench>
    )
  }

  return <LegacyLayout />
}

function LegacyLayout() {
  const { identity } = useIdentity()
  const location = useLocation()
  const { isDemo, limits } = useDemoMode()

  return (
    <div className="flex flex-col h-screen">
      <WorkspaceCommands />
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
          {import.meta.env.DEV && (
            <Link
              to="/stories"
              className="text-xs text-muted-foreground no-underline hover:no-underline hover:text-foreground"
            >
              Stories
            </Link>
          )}
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
