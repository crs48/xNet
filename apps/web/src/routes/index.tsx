/**
 * Home page - document list with all types
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useIdentity, useQuery } from '@xnetjs/react'
import { FileText, Database, Layout, Plus, ChevronDown, Network, Compass } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RestoringNotice } from '../components/RestoringNotice'
import { bootMark, logBootTimeline } from '../lib/boot-timeline'
import { deskIdFor, isQuietDefaultEnabled } from '../lib/desk'
import {
  CreateDocMenuItems,
  navigateToNewDoc,
  type CreatableDocType,
  type NavigateLike
} from '../lib/doc-creation'
import { useQueryTimer } from '../lib/read-path-probe'
import { useInstantRows } from '../lib/use-instant-rows'
import { useRestoringFromHub } from '../lib/use-restoring'
import { navigateToNode } from '../workbench/navigation'
import { tabIdFor, useWorkbench } from '../workbench/state'
import { setPreviewIntent } from '../workbench/tabs'
import { HomeChats, homeHeading, lensShowsChats, lensShowsDocs } from './home-lens'
import { hasOnboarded } from './welcome'

export const Route = createFileRoute('/')({
  component: HomePage
})

type DocType = 'page' | 'database' | 'canvas'

interface DocInfo {
  id: string
  title?: string
  type: DocType
  updatedAt: number
}

/**
 * Whether the 0166 startup-surface redirect has already run this session. Not
 * component state: it must outlive HomePage remounts (see the effect below).
 */
let startupRedirectDone = false

function HomePage() {
  const navigate = useNavigate()
  const [showCreateMenu, setShowCreateMenu] = useState(false)

  // Configurable startup tab (0166): '/' opens the chosen surface — but only
  // on the app's first landing. Since 0388 the All/Docs/Chats sections
  // navigate to '/' deliberately, and a redirect that fired on every arrival
  // would bounce the user straight back out of the surface they just asked
  // for. `startupRedirectDone` is module-scoped, so it survives HomePage
  // remounts and resets only on a real reload.
  const startupTab = useWorkbench((state) => state.startupTab)
  const redirecting = Boolean(startupTab) && !startupRedirectDone
  useEffect(() => {
    if (!startupTab || startupRedirectDone) return
    startupRedirectDone = true
    navigateToNode(navigate, startupTab.nodeType, startupTab.nodeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pagesQuery = useQuery(PageSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })
  const databasesQuery = useQuery(DatabaseSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })
  const canvasesQuery = useQuery(CanvasSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })

  // Instant-shell overlay (exploration 0249, F2): paint from the previous
  // session's localStorage snapshot in <1s while the single SQLite worker pays
  // its first cold OPFS read, then switch to live data and write the snapshot
  // through. localStorage is read on the main thread, not behind the cold worker.
  const pages = useInstantRows('page', pagesQuery)
  const databases = useInstantRows('database', databasesQuery)
  const canvases = useInstantRows('canvas', canvasesQuery)

  // Read-path timing (exploration 0212): each section's fire→resolve latency
  // and row count, gated behind `xnet:boot:debug`. Track the LIVE query so the
  // numbers still reflect the real cold read, not the instant snapshot paint.
  useQueryTimer('home:pages', pagesQuery.loading, pagesQuery.data?.length ?? 0)
  useQueryTimer('home:databases', databasesQuery.loading, databasesQuery.data?.length ?? 0)
  useQueryTimer('home:canvases', canvasesQuery.loading, canvasesQuery.data?.length ?? 0)

  const restoring = useRestoringFromHub()
  const { did } = useIdentity()
  const setStartupTab = useWorkbench((state) => state.setStartupTab)
  // `/` is home for the All/Docs/Chats lenses (0388): the section that
  // navigated here decides which projection this surface paints.
  const activeLensId = useWorkbench((state) => state.activeLensId)
  const showDocs = lensShowsDocs(activeLensId)
  const showChats = lensShowsChats(activeLensId)

  // Combine and sort whatever the overlay has (snapshot first, then live). Each
  // section fills in independently, so the list grows as sections resolve
  // instead of blocking the whole page on the slowest one (explorations 0212, 0249).
  const allDocs: DocInfo[] = [
    ...pages.rows.map((p) => ({ ...p, type: 'page' as const })),
    ...databases.rows.map((d) => ({ ...d, type: 'database' as const })),
    ...canvases.rows.map((c) => ({ ...c, type: 'canvas' as const }))
  ].sort((a, b) => b.updatedAt - a.updatedAt)

  const allLoaded = !pagesQuery.loading && !databasesQuery.loading && !canvasesQuery.loading
  const anyRows = allDocs.length > 0

  // Mark the boot timeline the first time the landing surface has something
  // definitive to paint — rows, OR a confirmed empty/restoring state — so one
  // slow section no longer delays the felt first paint (explorations 0204, 0212).
  // A truly fresh identity — every section loaded, zero docs, not restoring
  // from a hub — adopts the Desk (0273): a deterministic per-identity canvas
  // becomes the startup surface and this navigation lands on it (the node
  // itself is created on arrival via CanvasView's createIfMissing). Existing
  // users always have rows (or a restore in flight), so they are never moved.
  // Gated on the staged-rollout flag while dogfooding (0273 Phase 4); the
  // post-dogfood default flip is inverting isQuietDefaultEnabled.
  const freshIdentity =
    allLoaded && !anyRows && !restoring && !startupTab && did != null && isQuietDefaultEnabled()
  useEffect(() => {
    if (!freshIdentity || !did) return
    const deskId = deskIdFor(did)
    const workbench = useWorkbench.getState()
    workbench.setChrome('quiet')
    setStartupTab({ nodeType: 'canvas', nodeId: deskId })
    navigateToNode(navigate, 'canvas', deskId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshIdentity])

  useEffect(() => {
    if (anyRows || allLoaded) {
      bootMark('query:first-rows')
      // Log again at first paint so the capture includes `firstPaint` — the hub
      // now connects early, so a log only at hub:connected would miss the
      // residual time-to-paint (exploration 0229).
      logBootTimeline('query:first-rows')
    }
  }, [anyRows, allLoaded])

  const handleCreate = (type: CreatableDocType) => {
    setShowCreateMenu(false)
    navigateToNewDoc(navigate as unknown as NavigateLike, type)
  }

  const getIcon = (type: DocType) => {
    switch (type) {
      case 'page':
        return FileText
      case 'database':
        return Database
      case 'canvas':
        return Layout
    }
  }

  const getRoute = (doc: DocInfo) => {
    switch (doc.type) {
      case 'page':
        return { to: '/doc/$docId' as const, params: { docId: doc.id } }
      case 'database':
        return { to: '/db/$dbId' as const, params: { dbId: doc.id } }
      case 'canvas':
        return { to: '/canvas/$canvasId' as const, params: { canvasId: doc.id } }
    }
  }

  // A configured startup surface (0166) redirects away from '/' in the effect
  // above, which runs after paint. Render nothing meanwhile so the user does
  // not see the full document-list chrome flash before navigation lands (0212).
  // Once that redirect has run, '/' is an ordinary destination again (0388).
  if (redirecting) return null

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">{homeHeading(activeLensId)}</h1>
        <div className="relative">
          <div className="flex items-center gap-2">
            <Link
              to="/data"
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground no-underline transition-colors hover:bg-accent hover:no-underline"
            >
              <Network size={16} />
              <span>Data Workspace</span>
            </Link>
            <button
              onClick={() => setShowCreateMenu(!showCreateMenu)}
              className="flex items-center gap-2 bg-primary text-white border-none px-4 py-2 rounded-md cursor-pointer text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              <span>New</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${showCreateMenu ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-md shadow-lg z-10 py-1 min-w-[140px]">
              <CreateDocMenuItems types={['page', 'database', 'canvas']} onCreate={handleCreate} />
            </div>
          )}
        </div>
      </div>

      {!hasOnboarded() && (
        <Link
          to="/welcome"
          className="mb-4 flex items-center justify-between rounded-lg border border-border bg-accent/30 px-4 py-3 text-sm no-underline hover:bg-accent/50 hover:no-underline"
        >
          <span>
            <strong className="font-medium text-foreground">Finish setting up</strong> — choose your
            content filters and whether to be discoverable.
          </span>
          <ChevronDown size={16} className="-rotate-90 text-muted-foreground" />
        </Link>
      )}

      <Link
        to="/discover"
        className="mb-6 flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm no-underline transition-colors hover:bg-accent hover:no-underline"
      >
        <Compass size={18} className="text-muted-foreground" />
        <span>
          <strong className="font-medium text-foreground">Discover people</strong> — find
          collaborators and friends through shared interests.
        </span>
      </Link>

      {showChats && <HomeChats heading={showDocs ? 'Chats' : undefined} standalone={!showDocs} />}

      {!showDocs ? null : allLoaded && !anyRows ? (
        restoring ? (
          <RestoringNotice />
        ) : (
          <div className="flex flex-col items-center gap-5 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground">
              <FileText size={22} strokeWidth={1.5} />
            </div>
            <div className="space-y-1">
              <p className="text-base font-medium text-foreground">Your workspace is ready</p>
              <p className="text-sm text-muted-foreground">
                Create your first document — or press ⌘K to jump anywhere.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleCreate('page')}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <FileText size={16} strokeWidth={1.5} className="text-muted-foreground" />
                New page
              </button>
              <button
                type="button"
                onClick={() => handleCreate('database')}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Database size={16} strokeWidth={1.5} className="text-muted-foreground" />
                New database
              </button>
              <button
                type="button"
                onClick={() => handleCreate('canvas')}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
              >
                <Layout size={16} strokeWidth={1.5} className="text-muted-foreground" />
                New canvas
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          {anyRows && (
            <ul className="list-none">
              {allDocs.map((doc) => {
                const Icon = getIcon(doc.type)
                const route = getRoute(doc)

                return (
                  <li
                    key={`${doc.type}-${doc.id}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <Link
                      to={route.to}
                      params={route.params}
                      // VS Code-style preview tabs (0284): a single click opens
                      // an italic preview that the next open replaces; a
                      // double-click promotes it to a permanent tab.
                      onClick={() => setPreviewIntent()}
                      onDoubleClick={() =>
                        useWorkbench.getState().promoteTab(tabIdFor(doc.type, doc.id))
                      }
                      className="flex items-center gap-3 py-4 text-foreground no-underline hover:no-underline hover:bg-accent/30 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <Icon size={18} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium flex-1">{doc.title || 'Untitled'}</span>
                      <span className="text-xs text-muted-foreground capitalize">{doc.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {/* Still resolving some sections — paint what we have, fill in the
              rest. A subtle row when rows already show; the centered restore/
              spinner only on a still-empty first paint (exploration 0212). */}
          {!allLoaded &&
            (restoring && !anyRows ? (
              <RestoringNotice />
            ) : (
              <div
                className={
                  anyRows
                    ? 'py-4 text-center text-sm text-muted-foreground'
                    : 'flex items-center justify-center h-full text-muted-foreground'
                }
              >
                Loading...
              </div>
            ))}
        </>
      )}
    </div>
  )
}
