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
import { CanvasSchema, DashboardSchema, DatabaseSchema, MapSchema, PageSchema } from '@xnetjs/data'
import { useQuery } from '@xnetjs/react'
import { ArrowUpDown, Check, ChevronDown, Link as LinkIcon, Plus } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AddSharedDialog } from '../../components/AddSharedDialog'
import { useCreateInSpace } from '../../hooks/useCreateInSpace'
import { useSpaces } from '../../hooks/useSpaces'
import { CreateDocMenuItems, navigateToNewDoc, type NavigateLike } from '../../lib/doc-creation'
import { useWorkbench } from '../state'
import { filterExplorerItems } from './explorer-filter'
import { partitionByFolder } from './explorer-folders'
import { ExplorerFoldersProvider } from './explorer-folders-context'
import { ExplorerRow, type ExplorerItem, type ExplorerNodeType } from './explorer-rows'
import { NO_SPACE, isRealSpace, matchesScope } from './explorer-scope'
import { EXPLORER_SORTS, sortExplorerItems, type ExplorerSort } from './explorer-sort'
import { ExplorerFoldersSection } from './ExplorerFolderTree'
import { ExplorerScopeBar } from './ExplorerScopeBar'
import { ExplorerSpacesSection } from './ExplorerSpacesSection'
import { ExplorerTagsSection } from './ExplorerTagsSection'

const TYPE_FILTERS: Array<{ id: ExplorerNodeType | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'page', label: 'Page' },
  { id: 'database', label: 'Database' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'map', label: 'Map' }
]

const QUERY_LIMIT = 500
const ROW_HEIGHT = 26

function ExplorerCreateMenu({
  open,
  onToggle,
  onCreate,
  onAddShared,
  targetName
}: {
  open: boolean
  onToggle: () => void
  onCreate: (type: ExplorerNodeType) => void
  onAddShared: () => void
  /** Name of the Space new docs file into, or null when creating unfiled. */
  targetName: string | null
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md border border-hairline bg-surface-0 text-xs text-ink-1 transition-colors hover:bg-accent ${
          targetName ? 'justify-start px-2' : 'justify-center'
        }`}
      >
        <Plus size={13} strokeWidth={1.5} className="shrink-0" />
        <span className="shrink-0">New</span>
        {targetName ? <span className="min-w-0 truncate text-ink-3">in {targetName}</span> : null}
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          className={`${targetName ? 'ml-auto' : ''} shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border border-hairline bg-popover py-1">
          <div className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wider text-ink-3">
            {targetName ? `Creating in ${targetName}` : 'Not in any workspace'}
          </div>
          <CreateDocMenuItems
            types={['page', 'database', 'canvas', 'dashboard', 'map', 'lab']}
            onCreate={onCreate}
          />
          {targetName ? (
            <p className="m-0 px-3 pt-1 text-[10px] text-ink-3">
              Dashboards &amp; Labs file after you move them.
            </p>
          ) : null}
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

/** Compact sort picker for the flat list (exploration 0190). */
function SortMenu({
  value,
  onChange
}: {
  value: ExplorerSort
  onChange: (sort: ExplorerSort) => void
}) {
  const [open, setOpen] = useState(false)
  const current = EXPLORER_SORTS.find((entry) => entry.id === value) ?? EXPLORER_SORTS[0]
  return (
    <span className="relative ml-auto">
      <button
        type="button"
        title="Sort list"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-[18px] cursor-pointer items-center gap-0.5 rounded-full border border-hairline px-1.5 text-[10px] text-ink-3 transition-colors hover:text-ink-1"
      >
        <ArrowUpDown size={10} />
        {current.label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-md border border-hairline bg-popover py-1 shadow-md">
          {EXPLORER_SORTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                onChange(entry.id)
                setOpen(false)
              }}
              className={`flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-xs hover:bg-accent hover:text-ink-1 ${
                entry.id === value ? 'text-ink-1' : 'text-ink-2'
              }`}
            >
              <span className="flex w-3 shrink-0 justify-center">
                {entry.id === value ? <Check size={11} /> : null}
              </span>
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </span>
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
    <div className="px-1">
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
  createdAt?: number
  folder?: string
  sortKey?: string
  tags?: string[]
  space?: string
}

function collectItems(
  docs: ExplorerDocShape[] | undefined | null,
  type: ExplorerNodeType,
  spaceScope: string | null,
  spaceFilter: string[]
): ExplorerItem[] {
  return (
    (docs ?? [])
      // Scope: a single Space, the No-workspace bucket, or a multi-Space view
      // filter (exploration 0190); `null` + empty filter = All.
      .filter((doc) => matchesScope(doc.space, spaceScope, spaceFilter))
      .map((doc) => ({
        id: doc.id,
        title: doc.title ?? '',
        type,
        updatedAt: doc.updatedAt ?? 0,
        createdAt: doc.createdAt ?? 0,
        folder: doc.folder ?? null,
        sortKey: doc.sortKey,
        tags: doc.tags
      }))
  )
}

/** All organizable nodes, newest first, with folder/sortKey projected. */
function useExplorerItems(): ExplorerItem[] {
  const options = { orderBy: { updatedAt: 'desc' as const }, limit: QUERY_LIMIT }
  const { data: pages } = useQuery(PageSchema, options)
  const { data: databases } = useQuery(DatabaseSchema, options)
  const { data: canvases } = useQuery(CanvasSchema, options)
  const { data: dashboards } = useQuery(DashboardSchema, options)
  const { data: maps } = useQuery(MapSchema, options)
  const spaceScope = useWorkbench((s) => s.currentSpaceId)
  const spaceFilter = useWorkbench((s) => s.spaceFilter)

  return useMemo<ExplorerItem[]>(
    () =>
      [
        ...collectItems(pages, 'page', spaceScope, spaceFilter),
        ...collectItems(databases, 'database', spaceScope, spaceFilter),
        ...collectItems(canvases, 'canvas', spaceScope, spaceFilter),
        ...collectItems(dashboards, 'dashboard', spaceScope, spaceFilter),
        ...collectItems(maps, 'map', spaceScope, spaceFilter)
      ].sort((a, b) => b.updatedAt - a.updatedAt),
    [pages, databases, canvases, dashboards, maps, spaceScope, spaceFilter]
  )
}

function VirtualizedItemList({
  items,
  pinnedNodeIds,
  emptyMessage = 'No items',
  scrollRef,
  contentRef
}: {
  items: ExplorerItem[]
  pinnedNodeIds: string[]
  emptyMessage?: string
  /** The shared Explorer scroll viewport this list windows against. */
  scrollRef: React.RefObject<HTMLDivElement>
  /** Wrapper of everything scrolled; observed so the list's offset stays fresh. */
  contentRef: React.RefObject<HTMLDivElement>
}) {
  const listRef = useRef<HTMLDivElement>(null)

  // This list is not the scroll container — it sits below Pinned/Recent, Spaces,
  // Folders and Tags inside one shared scroll parent. Feed the virtualizer the
  // list's offset within that parent as `scrollMargin`, and re-measure whenever
  // the scrolled content resizes (sections above collapse/expand/mount), or the
  // virtualized rows would drift out of place.
  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    const listEl = listRef.current
    const contentEl = contentRef.current
    if (!listEl || !contentEl) return
    const measure = () => setScrollMargin(listEl.offsetTop)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(contentEl)
    return () => observer.disconnect()
  }, [contentRef])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin
  })

  if (items.length === 0) {
    return (
      <div ref={listRef} className="px-1">
        <p className="mt-6 text-center text-xs text-ink-3">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="px-1">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }} className="w-full">
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
                transform: `translateY(${virtualRow.start - scrollMargin}px)`
              }}
            >
              <ExplorerRow item={item} pinned={pinnedNodeIds.includes(item.id)} />
            </div>
          )
        })}
      </div>
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
  pinnedNodeIds,
  listEmptyMessage
}: {
  filterActive: boolean
  allItems: ExplorerItem[]
  listItems: ExplorerItem[]
  pinnedItems: ExplorerItem[]
  recentItems: ExplorerItem[]
  pinnedNodeIds: string[]
  listEmptyMessage: string
}) {
  // One scroll region for the whole panel: Pinned/Recent, Spaces, Folders and
  // Tags grow to their natural height and scroll together with the Unfiled list,
  // instead of each clipping inside a fixed percentage cap (which left overflow
  // unreachable when several sections were full). `relative` makes this the
  // offset parent the virtualized list measures its `scrollMargin` against.
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
      <div ref={contentRef}>
        <PinnedAndRecent pinnedItems={pinnedItems} recentItems={recentItems} />
        {!filterActive && <ExplorerSpacesSection />}
        {!filterActive && <ExplorerFoldersSection pinnedNodeIds={pinnedNodeIds} />}
        {!filterActive && <ExplorerTagsSection items={allItems} />}
        <SectionLabel>{filterActive ? 'Results' : 'Unfiled'}</SectionLabel>
        <VirtualizedItemList
          items={listItems}
          pinnedNodeIds={pinnedNodeIds}
          emptyMessage={listEmptyMessage}
          scrollRef={scrollRef}
          contentRef={contentRef}
        />
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
  const currentSpaceId = useWorkbench((state) => state.currentSpaceId)
  const explorerSort = useWorkbench((state) => state.explorerSort)
  const setExplorerSort = useWorkbench((state) => state.setExplorerSort)
  const { getSpace } = useSpaces()
  const createInSpace = useCreateInSpace()

  // The Space new docs file into (null = All / No-workspace → unfiled).
  const createTarget = isRealSpace(currentSpaceId) ? getSpace(currentSpaceId) : null

  const allItems = useExplorerItems()
  const byId = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems])

  const filterActive = filter !== 'all' || search.trim() !== ''
  const unfiled = useMemo(() => partitionByFolder(allItems).unfiled, [allItems])
  const listItems = useMemo(() => {
    const base = filterActive ? filterExplorerItems(allItems, filter, search) : unfiled
    return sortExplorerItems(base, explorerSort)
  }, [filterActive, allItems, filter, search, unfiled, explorerSort])

  const listEmptyMessage = filterActive
    ? 'No matches'
    : createTarget
      ? `Nothing in ${createTarget.name} yet`
      : currentSpaceId === NO_SPACE
        ? 'Nothing outside a workspace'
        : 'No items'

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
    // File into the active Space; All / No-workspace create unfiled (0190).
    if (isRealSpace(currentSpaceId)) {
      void createInSpace(type, currentSpaceId)
      return
    }
    navigateToNewDoc(navigate as unknown as NavigateLike, type)
  }

  return (
    <ExplorerFoldersProvider items={allItems}>
      <div className="flex h-full min-h-0 flex-col">
        {/* Workspace scope — persistent, always visible (exploration 0190) */}
        <ExplorerScopeBar />
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
            targetName={createTarget?.name ?? null}
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter…"
            className="h-6 w-full rounded-sm border border-hairline bg-surface-0 px-2 text-xs text-ink-1 outline-none placeholder:text-ink-3 focus:border-border-emphasis"
          />
          <div className="flex flex-wrap items-center gap-1">
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
            <SortMenu value={explorerSort} onChange={setExplorerSort} />
          </div>
        </div>

        <ExplorerSections
          filterActive={filterActive}
          allItems={allItems}
          listItems={listItems}
          pinnedItems={pinnedItems}
          recentItems={recentItems}
          pinnedNodeIds={pinnedNodeIds}
          listEmptyMessage={listEmptyMessage}
        />

        <AddSharedDialog
          isOpen={showAddSharedDialog}
          onClose={() => setShowAddSharedDialog(false)}
        />
      </div>
    </ExplorerFoldersProvider>
  )
}
