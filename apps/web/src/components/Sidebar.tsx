/**
 * Sidebar component with collapsible sections for all document types
 */
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import {
  FileText,
  Database,
  Layout,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Settings,
  Link as LinkIcon
} from 'lucide-react'
import { useState } from 'react'
import { AddSharedDialog } from './AddSharedDialog'
import { MyTasksPanel } from './MyTasksPanel'

type DocType = 'page' | 'database' | 'canvas'
type SidebarDoc = {
  id: string
  title?: string
  updatedAt?: number
}

const SECTION_PAGE_SIZE = 20

const typeConfig = {
  page: {
    icon: FileText,
    label: 'Pages',
    route: '/doc/$docId' as const,
    paramKey: 'docId'
  },
  database: {
    icon: Database,
    label: 'Databases',
    route: '/db/$dbId' as const,
    paramKey: 'dbId'
  },
  canvas: {
    icon: Layout,
    label: 'Canvases',
    route: '/canvas/$canvasId' as const,
    paramKey: 'canvasId'
  }
} as const

const schemaByType = {
  page: PageSchema._schemaId,
  database: DatabaseSchema._schemaId
} as const

export function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const [sectionLimits, setSectionLimits] = useState<Record<DocType, number>>({
    page: SECTION_PAGE_SIZE,
    database: SECTION_PAGE_SIZE,
    canvas: SECTION_PAGE_SIZE
  })
  const [expandedSections, setExpandedSections] = useState<Record<DocType, boolean>>({
    page: true,
    database: true,
    canvas: true
  })

  const pageQueryLimit = sectionLimits.page + 1
  const databaseQueryLimit = sectionLimits.database + 1
  const canvasQueryLimit = sectionLimits.canvas + 1

  const { data: pages, loading: pagesLoading } = useQuery(PageSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: pageQueryLimit
  })
  const { data: databases, loading: databasesLoading } = useQuery(DatabaseSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: databaseQueryLimit
  })
  const { data: canvases, loading: canvasesLoading } = useQuery(CanvasSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: canvasQueryLimit
  })

  const toggleSection = (type: DocType) => {
    setExpandedSections((prev) => ({ ...prev, [type]: !prev[type] }))
  }

  const showMore = (type: DocType) => {
    setSectionLimits((prev) => ({
      ...prev,
      [type]: prev[type] + SECTION_PAGE_SIZE
    }))
  }

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

  const renderDocLink = (type: DocType, doc: { id: string; title?: string }) => {
    const config = typeConfig[type]
    const Icon = config.icon
    const isActive = location.pathname.includes(doc.id)

    // Render type-specific links to satisfy TypeScript
    if (type === 'page') {
      return (
        <Link
          to="/doc/$docId"
          params={{ docId: doc.id }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'copy'
            event.dataTransfer.setData(
              CANVAS_INTERNAL_NODE_MIME,
              serializeCanvasInternalNodeDragData({
                nodeId: doc.id,
                schemaId: schemaByType.page,
                title: doc.title || 'Untitled'
              })
            )
            event.dataTransfer.setData('text/plain', doc.title || 'Untitled')
          }}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group transition-colors no-underline hover:no-underline ${
            isActive ? 'bg-accent' : 'hover:bg-accent/50'
          }`}
          data-sidebar-document-id={doc.id}
          data-sidebar-document-type="page"
        >
          <Icon size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-sm truncate flex-1 text-foreground">{doc.title || 'Untitled'}</span>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Delete:', doc.id)
            }}
            className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        </Link>
      )
    }

    if (type === 'database') {
      return (
        <Link
          to="/db/$dbId"
          params={{ dbId: doc.id }}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'copy'
            event.dataTransfer.setData(
              CANVAS_INTERNAL_NODE_MIME,
              serializeCanvasInternalNodeDragData({
                nodeId: doc.id,
                schemaId: schemaByType.database,
                title: doc.title || 'Untitled'
              })
            )
            event.dataTransfer.setData('text/plain', doc.title || 'Untitled')
          }}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group transition-colors no-underline hover:no-underline ${
            isActive ? 'bg-accent' : 'hover:bg-accent/50'
          }`}
          data-sidebar-document-id={doc.id}
          data-sidebar-document-type="database"
        >
          <Icon size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-sm truncate flex-1 text-foreground">{doc.title || 'Untitled'}</span>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              console.log('Delete:', doc.id)
            }}
            className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        </Link>
      )
    }

    // type === 'canvas'
    return (
      <Link
        to="/canvas/$canvasId"
        params={{ canvasId: doc.id }}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer mb-0.5 group transition-colors no-underline hover:no-underline ${
          isActive ? 'bg-accent' : 'hover:bg-accent/50'
        }`}
      >
        <Icon size={14} className="text-muted-foreground flex-shrink-0" />
        <span className="text-sm truncate flex-1 text-foreground">{doc.title || 'Untitled'}</span>
        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            console.log('Delete:', doc.id)
          }}
          className="bg-transparent border-none text-muted-foreground cursor-pointer p-1 opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
        >
          <Trash2 size={12} />
        </button>
      </Link>
    )
  }

  const renderSection = (type: DocType, docs: SidebarDoc[], hasMore: boolean, loading: boolean) => {
    const config = typeConfig[type]
    const isExpanded = expandedSections[type]
    const visibleDocs = docs.slice(0, sectionLimits[type])

    if (loading) {
      return (
        <div key={type} className="mb-2">
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading...</div>
        </div>
      )
    }

    if (visibleDocs.length === 0) return null

    return (
      <div key={type} className="mb-2">
        {/* Section header */}
        <button
          onClick={() => toggleSection(type)}
          className="w-full flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="uppercase font-medium tracking-wider">{config.label}</span>
          <span className="ml-auto opacity-50">
            {visibleDocs.length}
            {hasMore ? '+' : ''}
          </span>
        </button>

        {/* Documents */}
        {isExpanded && (
          <ul className="list-none p-0 m-0">
            {visibleDocs.map((doc) => (
              <li key={doc.id}>{renderDocLink(type, doc)}</li>
            ))}
            {hasMore && (
              <li className="pt-1">
                <button
                  type="button"
                  onClick={() => showMore(type)}
                  className="w-full px-2 py-1.5 text-left text-xs text-primary hover:text-primary/80 transition-colors bg-transparent border-none cursor-pointer"
                >
                  Show more {config.label.toLowerCase()}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    )
  }

  return (
    <aside className="w-[250px] bg-secondary border-r border-border flex flex-col">
      {/* Create button */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <button
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            className="w-full flex items-center justify-center gap-2 bg-primary text-white border-none px-4 py-2 rounded-md cursor-pointer text-sm hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            <span>New</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${showCreateMenu ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Create menu dropdown */}
          {showCreateMenu && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-10 py-1">
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
              <hr className="my-1 border-border" />
              <button
                onClick={() => {
                  setShowCreateMenu(false)
                  setShowAddSharedDialog(true)
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left text-primary bg-transparent border-none cursor-pointer"
              >
                <LinkIcon size={14} />
                <span>Add Shared...</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-auto p-2">
        <MyTasksPanel />

        {renderSection(
          'page',
          pages || [],
          (pages?.length || 0) > sectionLimits.page,
          pagesLoading
        )}
        {renderSection(
          'database',
          databases || [],
          (databases?.length || 0) > sectionLimits.database,
          databasesLoading
        )}
        {renderSection(
          'canvas',
          canvases || [],
          (canvases?.length || 0) > sectionLimits.canvas,
          canvasesLoading
        )}

        {!pagesLoading &&
          !databasesLoading &&
          !canvasesLoading &&
          (pages?.length || 0) + (databases?.length || 0) + (canvases?.length || 0) === 0 && (
            <p className="text-muted-foreground text-sm text-center mt-8">No documents yet</p>
          )}
      </div>

      {/* Settings */}
      <div className="p-2 border-t border-border">
        <Link
          to="/settings"
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer no-underline hover:no-underline transition-colors ${
            location.pathname === '/settings'
              ? 'bg-accent text-foreground'
              : 'text-foreground hover:bg-accent/50'
          }`}
        >
          <Settings size={14} className="text-muted-foreground" />
          <span className="text-sm">Settings</span>
        </Link>
      </div>

      {/* Add Shared Dialog */}
      <AddSharedDialog isOpen={showAddSharedDialog} onClose={() => setShowAddSharedDialog(false)} />
    </aside>
  )
}
