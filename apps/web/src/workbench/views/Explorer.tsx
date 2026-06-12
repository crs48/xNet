/**
 * Explorer — the Left Panel navigation view (exploration 0166).
 *
 * Replaces the type-siloed Sidebar with the unified model: Pinned,
 * Recent, then All Items — one virtualized, type-filterable list of
 * every node. Every row drags (unified node transfer + canvas-legacy
 * MIME). Single click opens a preview tab; double click promotes;
 * pinning keeps a node at the top.
 */
import { useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { CanvasSchema, DashboardSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { setNodeTransfer } from '@xnetjs/ui'
import { ChevronDown, Link as LinkIcon, Pin, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { AddSharedDialog } from '../../components/AddSharedDialog'
import { CreateDocMenuItems, navigateToNewDoc, type NavigateLike } from '../../lib/doc-creation'
import { navigateToNode } from '../navigation'
import { tabIdFor, useWorkbench } from '../state'
import { setPreviewIntent, TAB_VIEWS } from '../tabs'

type ExplorerNodeType = 'page' | 'database' | 'canvas' | 'dashboard'

interface ExplorerItem {
  id: string
  title: string
  type: ExplorerNodeType
  updatedAt: number
}

const SCHEMA_IDS: Record<ExplorerNodeType, string> = {
  page: PageSchema._schemaId,
  database: DatabaseSchema._schemaId,
  canvas: CanvasSchema._schemaId,
  dashboard: DashboardSchema._schemaId
}

const TYPE_FILTERS: Array<{ id: ExplorerNodeType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Page' },
  { id: 'database', label: 'Database' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'dashboard', label: 'Dashboard' }
]

const QUERY_LIMIT = 500
const ROW_HEIGHT = 26

function ExplorerRow({ item, pinned }: { item: ExplorerItem; pinned: boolean }) {
  const navigate = useNavigate()
  const Icon = TAB_VIEWS[item.type].icon
  const title = item.title || 'Untitled'

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-explorer-item-id={item.id}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copyMove'
        setNodeTransfer(event, {
          nodeId: item.id,
          nodeType: item.type,
          title,
          schemaId: SCHEMA_IDS[item.type],
          sourceContext: 'explorer'
        })
        event.dataTransfer.setData(
          CANVAS_INTERNAL_NODE_MIME,
          serializeCanvasInternalNodeDragData({
            nodeId: item.id,
            schemaId: SCHEMA_IDS[item.type],
            title
          })
        )
      }}
      onClick={() => {
        setPreviewIntent()
        navigateToNode(navigate, item.type, item.id)
      }}
      onDoubleClick={() => {
        useWorkbench.getState().promoteTab(tabIdFor(item.type, item.id))
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          navigateToNode(navigate, item.type, item.id)
        }
      }}
      className="group flex h-[26px] cursor-pointer items-center gap-2 rounded-sm px-2 text-ink-2 transition-colors hover:bg-accent hover:text-ink-1"
    >
      <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
      <button
        type="button"
        title={pinned ? 'Unpin' : 'Pin'}
        aria-label={pinned ? 'Unpin' : 'Pin'}
        onClick={(event) => {
          event.stopPropagation()
          useWorkbench.getState().togglePinnedNode(item.id)
        }}
        className={`shrink-0 cursor-pointer border-none bg-transparent p-0 ${
          pinned ? 'text-ink-2' : 'invisible text-ink-3 hover:text-ink-1 group-hover:visible'
        }`}
      >
        <Pin size={11} strokeWidth={1.5} className={pinned ? 'fill-current' : ''} />
      </button>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-ink-3">
      {children}
    </div>
  )
}

export function Explorer() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<ExplorerNodeType | 'all'>('all')
  const [search, setSearch] = useState('')
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const pinnedNodeIds = useWorkbench((state) => state.pinnedNodeIds)
  const recents = useWorkbench((state) => state.recents)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: pages } = useQuery(PageSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: QUERY_LIMIT
  })
  const { data: databases } = useQuery(DatabaseSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: QUERY_LIMIT
  })
  const { data: canvases } = useQuery(CanvasSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: QUERY_LIMIT
  })
  const { data: dashboards } = useQuery(DashboardSchema, {
    orderBy: { updatedAt: 'desc' },
    limit: QUERY_LIMIT
  })

  const allItems = useMemo<ExplorerItem[]>(() => {
    const collect = (
      docs: Array<{ id: string; title?: string; updatedAt?: number }> | undefined,
      type: ExplorerNodeType
    ): ExplorerItem[] =>
      (docs ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title ?? '',
        type,
        updatedAt: doc.updatedAt ?? 0
      }))

    return [
      ...collect(pages, 'page'),
      ...collect(databases, 'database'),
      ...collect(canvases, 'canvas'),
      ...collect(dashboards, 'dashboard')
    ].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [pages, databases, canvases, dashboards])

  const byId = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return allItems.filter((item) => {
      if (filter !== 'all' && item.type !== filter) return false
      if (needle && !(item.title || 'untitled').toLowerCase().includes(needle)) return false
      return true
    })
  }, [allItems, filter, search])

  const pinnedItems = useMemo(
    () => pinnedNodeIds.map((id) => byId.get(id)).filter((item): item is ExplorerItem => !!item),
    [pinnedNodeIds, byId]
  )

  const recentItems = useMemo(
    () =>
      recents
        .map((recent) => byId.get(recent.nodeId))
        .filter((item): item is ExplorerItem => !!item)
        .filter((item) => !pinnedNodeIds.includes(item.id))
        .slice(0, 8),
    [recents, byId, pinnedNodeIds]
  )

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  const handleCreate = (type: ExplorerNodeType) => {
    setShowCreateMenu(false)
    navigateToNewDoc(navigate as unknown as NavigateLike, type)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tools */}
      <div className="flex flex-col gap-2 border-b border-hairline p-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowCreateMenu((prev) => !prev)}
            className="flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-0 text-xs text-ink-1 transition-colors hover:bg-accent"
          >
            <Plus size={13} strokeWidth={1.5} />
            New
            <ChevronDown
              size={12}
              strokeWidth={1.5}
              className={`transition-transform ${showCreateMenu ? 'rotate-180' : ''}`}
            />
          </button>
          {showCreateMenu && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-hairline bg-popover py-1">
              <CreateDocMenuItems
                types={['page', 'database', 'canvas', 'dashboard']}
                onCreate={handleCreate}
              />
              <hr className="my-1 border-hairline" />
              <button
                onClick={() => {
                  setShowCreateMenu(false)
                  setShowAddSharedDialog(true)
                }}
                className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-sm text-ink-2 hover:bg-accent hover:text-ink-1"
              >
                <LinkIcon size={14} strokeWidth={1.5} />
                <span>Add Shared...</span>
              </button>
            </div>
          )}
        </div>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter…"
          className="h-6 w-full rounded-sm border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
        />
        <div className="flex flex-wrap gap-1">
          {TYPE_FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              className={`cursor-pointer rounded-full border px-1.5 py-px text-[10px] transition-colors ${
                filter === entry.id
                  ? 'border-accent-ink bg-accent text-ink-1'
                  : 'border-hairline bg-transparent text-ink-3 hover:text-ink-1'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pinned + Recent (fixed), then All Items (virtualized) */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          {(pinnedItems.length > 0 || recentItems.length > 0) && (
            <div className="shrink-0 px-1">
              {pinnedItems.length > 0 && (
                <>
                  <SectionLabel>Pinned</SectionLabel>
                  {pinnedItems.map((item) => (
                    <ExplorerRow key={`pin-${item.id}`} item={item} pinned />
                  ))}
                </>
              )}
              {recentItems.length > 0 && (
                <>
                  <SectionLabel>Recent</SectionLabel>
                  {recentItems.map((item) => (
                    <ExplorerRow key={`recent-${item.id}`} item={item} pinned={false} />
                  ))}
                </>
              )}
            </div>
          )}

          <SectionLabel>All items</SectionLabel>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1">
            {filtered.length === 0 ? (
              <p className="mt-6 text-center text-xs text-ink-3">No items</p>
            ) : (
              <div
                style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
                className="w-full"
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const item = filtered[virtualRow.index]
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: virtualRow.size,
                        transform: `translateY(${virtualRow.start}px)`
                      }}
                    >
                      <ExplorerRow item={item} pinned={pinnedNodeIds.includes(item.id)} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <AddSharedDialog isOpen={showAddSharedDialog} onClose={() => setShowAddSharedDialog(false)} />
    </div>
  )
}
