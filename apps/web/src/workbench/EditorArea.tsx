/**
 * EditorArea — the tabbed center region (exploration 0166).
 *
 * Phase 1: hosts the router outlet on surface-0 (the only surface-0
 * region — the work is brighter than the chrome). Phase 2 adds the
 * tab bar, groups and splits.
 */
import type { ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { ErrorBoundary } from '@xnetjs/react'
import { ErrorFallback } from '../components/ErrorFallback'

export function EditorArea({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-0">
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <ErrorBoundary
          resetKey={location.pathname}
          fallback={({ error, reset }) => <ErrorFallback error={error} reset={reset} />}
        >
          {children}
        </ErrorBoundary>
      </div>
    </div>
  )
}
