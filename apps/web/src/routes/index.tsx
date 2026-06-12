/**
 * Home page - document list with all types
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { FileText, Database, Layout, Plus, ChevronDown, Network } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  CreateDocMenuItems,
  navigateToNewDoc,
  type CreatableDocType,
  type NavigateLike
} from '../lib/doc-creation'
import { navigateToNode } from '../workbench/navigation'
import { useWorkbench } from '../workbench/state'

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

  const loading = pagesLoading || databasesLoading || canvasesLoading

  // Combine and sort all documents
  const allDocs: DocInfo[] = [
    ...(pages || []).map((p) => ({ ...p, type: 'page' as const })),
    ...(databases || []).map((d) => ({ ...d, type: 'database' as const })),
    ...(canvases || []).map((c) => ({ ...c, type: 'canvas' as const }))
  ].sort((a, b) => b.updatedAt - a.updatedAt)

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }

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

      {allDocs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No documents yet. Create your first page, database, or canvas!</p>
        </div>
      ) : (
        <ul className="list-none">
          {allDocs.map((doc) => {
            const Icon = getIcon(doc.type)
            const route = getRoute(doc)

            return (
              <li key={`${doc.type}-${doc.id}`} className="border-b border-border last:border-b-0">
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
    </div>
  )
}
