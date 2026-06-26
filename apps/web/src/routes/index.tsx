/**
 * Home page - document list with all types
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { FileText, Database, Layout, Plus, ChevronDown, Network, Compass } from 'lucide-react'
import { useEffect, useState } from 'react'
import { RestoringNotice } from '../components/RestoringNotice'
import { bootMark, logBootTimeline } from '../lib/boot-timeline'
import {
  CreateDocMenuItems,
  navigateToNewDoc,
  type CreatableDocType,
  type NavigateLike
} from '../lib/doc-creation'
import { useQueryTimer } from '../lib/read-path-probe'
import { useRestoringFromHub } from '../lib/use-restoring'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench } from '../workbench/state'
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

function HomePage() {
  const navigate = useNavigate()
  const [showCreateMenu, setShowCreateMenu] = useState(false)

  // Configurable startup tab (0166): '/' opens the chosen surface.
  const startupTab = useWorkbench((state) => state.startupTab)
  useEffect(() => {
    if (startupTab) {
      navigateToNode(navigate, startupTab.nodeType, startupTab.nodeId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: pages, loading: pagesLoading } = useQuery(PageSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })
  const { data: databases, loading: databasesLoading } = useQuery(DatabaseSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })
  const { data: canvases, loading: canvasesLoading } = useQuery(CanvasSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: 50
  })

  // Read-path timing (exploration 0212): each section's fire→resolve latency
  // and row count, gated behind `xnet:boot:debug`.
  useQueryTimer('home:pages', pagesLoading, pages?.length ?? 0)
  useQueryTimer('home:databases', databasesLoading, databases?.length ?? 0)
  useQueryTimer('home:canvases', canvasesLoading, canvases?.length ?? 0)

  const restoring = useRestoringFromHub()

  // Combine and sort whatever has resolved so far. Each query returns [] while
  // loading and fills in independently, so the list grows as sections resolve
  // instead of blocking the whole page on the slowest one (exploration 0212).
  const allDocs: DocInfo[] = [
    ...(pages || []).map((p) => ({ ...p, type: 'page' as const })),
    ...(databases || []).map((d) => ({ ...d, type: 'database' as const })),
    ...(canvases || []).map((c) => ({ ...c, type: 'canvas' as const }))
  ].sort((a, b) => b.updatedAt - a.updatedAt)

  const allLoaded = !pagesLoading && !databasesLoading && !canvasesLoading
  const anyRows = allDocs.length > 0

  // Mark the boot timeline the first time the landing surface has something
  // definitive to paint — rows, OR a confirmed empty/restoring state — so one
  // slow section no longer delays the felt first paint (explorations 0204, 0212).
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
  if (startupTab) return null

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">All Documents</h1>
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

      {allLoaded && !anyRows ? (
        restoring ? (
          <RestoringNotice />
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No documents yet. Create your first page, database, or canvas!</p>
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
