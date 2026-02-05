/**
 * Home page - document list with all types
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnet/data'
import { useQuery } from '@xnet/react'
import { FileText, Database, Layout, Plus, ChevronDown } from 'lucide-react'
import { useState } from 'react'

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

  const handleCreate = (type: DocType) => {
    const id = Math.random().toString(36).substring(2, 15)
    setShowCreateMenu(false)

    switch (type) {
      case 'page':
        navigate({ to: '/doc/$docId', params: { docId: id } })
        break
      case 'database':
        navigate({ to: '/db/$dbId', params: { dbId: id } })
        break
      case 'canvas':
        navigate({ to: '/canvas/$canvasId', params: { canvasId: id } })
        break
    }
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

          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-1 bg-background border border-border rounded-md shadow-lg z-10 py-1 min-w-[140px]">
              <button
                onClick={() => handleCreate('page')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-foreground bg-transparent border-none cursor-pointer"
              >
                <FileText size={14} />
                <span>Page</span>
              </button>
              <button
                onClick={() => handleCreate('database')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-foreground bg-transparent border-none cursor-pointer"
              >
                <Database size={14} />
                <span>Database</span>
              </button>
              <button
                onClick={() => handleCreate('canvas')}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-foreground bg-transparent border-none cursor-pointer"
              >
                <Layout size={14} />
                <span>Canvas</span>
              </button>
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
