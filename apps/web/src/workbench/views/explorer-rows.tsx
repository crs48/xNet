/**
 * Explorer row primitives (0166, folders in 0169).
 *
 * One row component serves both the flat lists and the folder tree:
 * rows drag (unified node transfer + canvas-legacy MIME), accept drops
 * for insert-before reordering inside a folder, and expose pin and
 * move-to-folder affordances on hover.
 */
import { useNavigate } from '@tanstack/react-router'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { CanvasSchema, DashboardSchema, DatabaseSchema, PageSchema } from '@xnetjs/data'
import { hasNodeTransfer, getNodeTransfer, setNodeTransfer, type NodeTransfer } from '@xnetjs/ui'
import { FolderInput, Pin } from 'lucide-react'
import { useState } from 'react'
import { navigateToNode } from '../navigation'
import { tabIdFor, useWorkbench } from '../state'
import { setPreviewIntent, TAB_VIEWS } from '../tabs'
import { useExplorerFolders } from './explorer-folders-context'

export type ExplorerNodeType = 'page' | 'database' | 'canvas' | 'dashboard'

export interface ExplorerItem {
  id: string
  title: string
  type: ExplorerNodeType
  updatedAt: number
  folder?: string | null
  sortKey?: string
  tags?: string[]
}

export const EXPLORER_SCHEMAS = {
  page: PageSchema,
  database: DatabaseSchema,
  canvas: CanvasSchema,
  dashboard: DashboardSchema
} as const

export const SCHEMA_IDS: Record<ExplorerNodeType, string> = {
  page: PageSchema._schemaId,
  database: DatabaseSchema._schemaId,
  canvas: CanvasSchema._schemaId,
  dashboard: DashboardSchema._schemaId
}

export function isExplorerNodeType(value: string): value is ExplorerNodeType {
  return value in SCHEMA_IDS
}

function ExplorerPinToggle({ nodeId, pinned }: { nodeId: string; pinned: boolean }) {
  const label = pinned ? 'Unpin' : 'Pin'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        useWorkbench.getState().togglePinnedNode(nodeId)
      }}
      className={`shrink-0 cursor-pointer border-none bg-transparent p-0 ${
        pinned ? 'text-ink-2' : 'invisible text-ink-3 hover:text-ink-1 group-hover:visible'
      }`}
    >
      <Pin size={11} strokeWidth={1.5} className={pinned ? 'fill-current' : ''} />
    </button>
  )
}

function MoveToFolderMenu({ item, onClose }: { item: ExplorerItem; onClose: () => void }) {
  const { folderRows, moveItemToFolder } = useExplorerFolders()
  const choose = (folderId: string | null) => {
    void moveItemToFolder(item, folderId)
    onClose()
  }
  return (
    <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-44 overflow-y-auto rounded-md border border-hairline bg-popover py-1">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          choose(null)
        }}
        className="block w-full cursor-pointer border-none bg-transparent px-3 py-1.5 text-left text-xs text-ink-2 hover:bg-accent hover:text-ink-1"
      >
        Unfiled
      </button>
      {folderRows.map((row) => (
        <button
          key={row.folder.id}
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            choose(row.folder.id)
          }}
          style={{ paddingLeft: 12 + row.depth * 12 }}
          className="block w-full cursor-pointer truncate border-none bg-transparent py-1.5 pr-3 text-left text-xs text-ink-2 hover:bg-accent hover:text-ink-1"
        >
          {row.folder.name || 'Untitled folder'}
        </button>
      ))}
    </div>
  )
}

function MoveToFolderButton({ item }: { item: ExplorerItem }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        title="Move to folder…"
        aria-label="Move to folder…"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((prev) => !prev)
        }}
        className="invisible cursor-pointer border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:visible"
      >
        <FolderInput size={11} strokeWidth={1.5} />
      </button>
      {open && <MoveToFolderMenu item={item} onClose={() => setOpen(false)} />}
    </span>
  )
}

export function ExplorerRow({
  item,
  pinned,
  depth = 0,
  onDropBefore
}: {
  item: ExplorerItem
  pinned: boolean
  depth?: number
  /** Tree rows accept drops to insert the dragged node before this one */
  onDropBefore?: (transfer: NodeTransfer) => void
}) {
  const navigate = useNavigate()
  const [dropping, setDropping] = useState(false)
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
      onDragOver={(event) => {
        if (!onDropBefore || !hasNodeTransfer(event)) return
        event.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={(event) => {
        setDropping(false)
        if (!onDropBefore) return
        const transfer = getNodeTransfer(event)
        if (!transfer) return
        event.preventDefault()
        event.stopPropagation()
        onDropBefore(transfer)
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
      style={depth > 0 ? { paddingLeft: 8 + depth * 14 } : undefined}
      className={`group flex h-[26px] cursor-pointer items-center gap-2 rounded-sm px-2 text-ink-2 transition-colors hover:bg-accent hover:text-ink-1 ${
        dropping ? 'shadow-[inset_0_1px_0_0_var(--color-border-emphasis,currentColor)]' : ''
      }`}
    >
      <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
      <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
      <MoveToFolderButton item={item} />
      <ExplorerPinToggle nodeId={item.id} pinned={pinned} />
    </div>
  )
}
