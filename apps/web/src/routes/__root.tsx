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
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="logo">
          xNotes
        </Link>
        <GlobalSearch />
        <div className="header-right">
          <SyncIndicator status={status} peerCount={peerCount} />
          {identity && (
            <span className="identity" title={identity.did}>
              {identity.did.slice(0, 16)}...
            </span>
          )}
        </div>
      </header>

      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
