/**
 * CalmSurface — the calm shell's main region (exploration 0250).
 *
 * Always renders the router outlet, so all of the app's routes light up here
 * unchanged (parity). Like the workbench's editor it keeps the tab store synced
 * to the URL (so titles, recents and the inspector's active-node context stay
 * correct) and lets pages run full-bleed while every other view gets the padded
 * scroll container — but there is no tab strip, no split groups, no bottom tray.
 */
import { useLocation } from '@tanstack/react-router'
import { ErrorBoundary } from '@xnetjs/react'
import { useEffect, type ReactNode } from 'react'
import { ErrorFallback } from '../../components/ErrorFallback'
import { syncRouteToTabs, tabFromPathname } from '../tabs'

export function CalmSurface({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  // Router → store reconciliation (open-or-activate the tab for this route),
  // identical to the workbench so selectActiveTab / recents stay honest.
  useEffect(() => syncRouteToTabs(pathname), [pathname])

  const fullBleed = tabFromPathname(pathname)?.nodeType === 'page'

  return (
    <main
      data-wb-region="editor"
      className={`min-w-0 flex-1 bg-surface-0 ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto'}`}
    >
      <div className={fullBleed ? 'h-full' : 'mx-auto h-full max-w-[var(--surface-max,72rem)] p-6'}>
        <ErrorBoundary
          resetKey={pathname}
          fallback={({ error, reset }) => <ErrorFallback error={error} reset={reset} />}
        >
          {children}
        </ErrorBoundary>
      </div>
    </main>
  )
}
