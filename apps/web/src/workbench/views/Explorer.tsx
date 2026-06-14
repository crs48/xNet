/**
 * Explorer — the Left Panel navigation view (exploration 0166).
 *
 * Replaces the type-siloed Sidebar with the unified model: Pinned,
 * Recent, the folder tree (exploration 0169), then Unfiled — one
 * type-filterable list of every node. Every row drags (unified node
 * transfer + canvas-legacy MIME). Single click opens a preview tab;
 * double click promotes; pinning keeps a node at the top. When a text
 * or type filter is active the tree hides and results span all items.
 */
import { useNavigate } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CanvasSchema, DashboardSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { ChevronDown, Link as LinkIcon, Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { AddSharedDialog } from '../../components/AddSharedDialog'
import { CreateDocMenuItems, navigateToNewDoc, type NavigateLike } from '../../lib/doc-creation'
import { useWorkbench } from '../state'
import { filterExplorerItems } from './explorer-filter'
import { partitionByFolder } from './explorer-folders'
import { ExplorerFoldersProvider } from './explorer-folders-context'
import { ExplorerRow, type ExplorerItem, type ExplorerNodeType } from './explorer-rows'
import { ExplorerFoldersSection } from './ExplorerFolderTree'
import { ExplorerSpacesSection } from './ExplorerSpacesSection'
import { ExplorerTagsSection } from './ExplorerTagsSection'

const TYPE_FILTERS: Array<{ id: ExplorerNodeType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Page' },
  { id: 'database', label: 'Database' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'dashboard', label: 'Dashboard' }
]

const QUERY_LIMIT = 500
const ROW_HEIGHT = 26

function ExplorerCreateMenu({
  open,
  onToggle,
  onCreate,
  onAddShared
}: {
  open: boolean
  onToggle: () => void
  onCreate: (type: ExplorerNodeType) => void
  onAddShared: () => void
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="flex h-7 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface-0 text-xs text-ink-1 transition-colors hover:bg-accent"
      >
        <Plus size={13} strokeWidth={1.5} />
        New
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-hairline bg-popover py-1">
          <CreateDocMenuItems
            types={['page', 'database', 'canvas', 'dashboard']}
            onCreate={onCreate}
          />
          <hr className="my-1 border-hairline" />
          <button
            onClick={onAddShared}
            className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-sm text-ink-2 hover:bg-accent hover:text-ink-1"
          >
            <LinkIcon size={14} strokeWidth={1.5} />
            <span>Add Shared...</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ExplorerSection({
  label,
  items,
  pinned
}: {
  label: string
  items: ExplorerItem[]
  pinned: boolean
}) {
  if (items.length === 0) return null
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      {items.map((item) => (
        <ExplorerRow key={`${label}-${item.id}`} item={item} pinned={pinned} />
      ))}
    </>
  )
}

function PinnedAndRecent({
  pinnedItems,
  recentItems
}: {
  pinnedItems: ExplorerItem[]
  recentItems: ExplorerItem[]
}) {
  if (pinnedItems.length === 0 && recentItems.length === 0) return null
  return (
    <div className="shrink-0 px-1">
      <ExplorerSection label="Pinned" items={pinnedItems} pinned />
      <ExplorerSection label="Recent" items={recentItems} pinned={false} />
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

interface ExplorerDocShape {
  id: string
  title?: string
  updatedAt?: number
  folder?: string
  sortKey?: string
  tags?: string[]
  space?: string
}

function collectItems(
  docs: ExplorerDocShape[] | undefined | null,
  type: ExplorerNodeType,
  spaceScope: string | null
): ExplorerItem[] {
  return (docs ?? [])
    // When a Space is active, show only its content; `null` = all (exploration 0181).
    .filter((doc) => spaceScope === null || (doc.space ?? '') === spaceScope)
    .map((doc) => ({
      id: doc.id,
      title: doc.title ?? '',
      type,
      updatedAt: doc.updatedAt ?? 0,
      folder: doc.folder ?? null,
      sortKey: doc.sortKey,
      tags: doc.tags
    }))
}

/** All organizable nodes, newest first, with folder/sortKey projected. */
function useExplorerItems(): ExplorerItem[] {
  const options = { orderBy: { updatedAt: 'desc' as const }, limit: QUERY_LIMIT }
  const { data: pages } = useQuery(PageSchema, options)
  const { data: databases } = useQuery(DatabaseSchema, options)
  const { data: canvases } = useQuery(CanvasSchema, options)
  const { data: dashboards } = useQuery(DashboardSchema, options)
  const spaceScope = useWorkbench((s) => s.currentSpaceId)

  return useMemo<ExplorerItem[]>(
    () =>
      [
        ...collectItems(pages, 'page', spaceScope),
        ...collectItems(databases, 'database', spaceScope),
        ...collectItems(canvases, 'canvas', spaceScope),
        ...collectItems(dashboards, 'dashboard', spaceScope)
      ].sort((a, b) => b.updatedAt - a.updatedAt),
    [pages, databases, canvases, dashboards, spaceScope]
  )
}

function VirtualizedItemList({
  items,
  pinnedNodeIds
}: {
  items: ExplorerItem[]
  pinnedNodeIds: string[]
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12
  })

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-1">
      {items.length === 0 ? (
        <p className="mt-6 text-center text-xs text-ink-3">No items</p>
      ) : (
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
          className="w-full"
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]
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
  )
}

/** Pinned + Recent, folder tree + tags (hidden while filtering), then the list. */
function ExplorerSections({
  filterActive,
  allItems,
  listItems,
  pinnedItems,
  recentItems,
  pinnedNodeIds
}: {
  filterActive: boolean
  allItems: ExplorerItem[]
  listItems: ExplorerItem[]
  pinnedItems: ExplorerItem[]
  recentItems: ExplorerItem[]
  pinnedNodeIds: string[]
}) {
  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="flex h-full flex-col">
        <PinnedAndRecent pinnedItems={pinnedItems} recentItems={recentItems} />
        {!filterActive && <ExplorerSpacesSection />}
        {!filterActive && <ExplorerFoldersSection pinnedNodeIds={pinnedNodeIds} />}
        {!filterActive && <ExplorerTagsSection items={allItems} />}
        <SectionLabel>{filterActive ? 'Results' : 'Unfiled'}</SectionLabel>
        <VirtualizedItemList items={listItems} pinnedNodeIds={pinnedNodeIds} />
      </div>
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

  const allItems = useExplorerItems()
  const byId = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems])

  const filterActive = filter !== 'all' || search.trim() !== ''
  const unfiled = useMemo(() => partitionByFolder(allItems).unfiled, [allItems])
  const listItems = useMemo(
    () => (filterActive ? filterExplorerItems(allItems, filter, search) : unfiled),
    [filterActive, allItems, filter, search, unfiled]
  )

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

  const handleCreate = (type: ExplorerNodeType) => {
    setShowCreateMenu(false)
    navigateToNewDoc(navigate as unknown as NavigateLike, type)
  }

  return (
    <ExplorerFoldersProvider items={allItems}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Tools */}
        <div className="flex flex-col gap-2 border-b border-hairline p-2">
          <ExplorerCreateMenu
            open={showCreateMenu}
            onToggle={() => setShowCreateMenu((prev) => !prev)}
            onCreate={handleCreate}
            onAddShared={() => {
              setShowCreateMenu(false)
              setShowAddSharedDialog(true)
            }}
          />
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

        <ExplorerSections
          filterActive={filterActive}
          allItems={allItems}
          listItems={listItems}
          pinnedItems={pinnedItems}
          recentItems={recentItems}
          pinnedNodeIds={pinnedNodeIds}
        />

        <AddSharedDialog
          isOpen={showAddSharedDialog}
          onClose={() => setShowAddSharedDialog(false)}
        />
      </div>
    </ExplorerFoldersProvider>
  )
}
