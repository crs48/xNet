/**
 * Root layout
 */
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { useSync, useIdentity } from '@xnet/react'
import { Sidebar } from '../components/Sidebar'
import { SyncIndicator } from '../components/SyncIndicator'
import { GlobalSearch } from '../components/GlobalSearch'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  const { status, peerCount } = useSync()
  const { identity } = useIdentity()

  return (
    <div className="flex flex-col h-screen">
      <header className="h-[52px] flex items-center justify-between px-4 border-b border-border bg-bg">
        <Link to="/" className="text-lg font-semibold text-text no-underline hover:no-underline">
          xNotes
        </Link>
        <GlobalSearch />
        <div className="flex items-center gap-4">
          <SyncIndicator status={status} peerCount={peerCount} />
          {identity && (
            <span className="text-xs text-text-secondary font-mono" title={identity.did}>
              {identity.did.slice(0, 16)}...
            </span>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
