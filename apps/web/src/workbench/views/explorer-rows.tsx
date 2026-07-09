/**
 * Explorer row primitives (0166, folders in 0169, context menu in 0285).
 *
 * One row component serves both the flat lists and the folder tree:
 * rows drag (unified node transfer + canvas-legacy MIME), accept drops
 * for insert-before reordering inside a folder, expose a sidebar-pin
 * toggle, and carry the full verb set on right-click (or the hover "⋯"
 * kebab) — rename, move to workspace/folder, pin, delete.
 */
import { useNavigate } from '@tanstack/react-router'
import { CANVAS_INTERNAL_NODE_MIME, serializeCanvasInternalNodeDragData } from '@xnetjs/canvas'
import { useMutate } from '@xnetjs/react'
import {
  ActionDropdownItems,
  ActionMenuList,
  ContextMenu,
  Menu,
  hasNodeTransfer,
  getNodeTransfer,
  setNodeTransfer,
  type NodeTransfer
} from '@xnetjs/ui'
import { MoreHorizontal, Pin } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNodeActions } from '../../hooks/useNodeActions'
import { navigateToNode } from '../navigation'
import { tabIdFor, useWorkbench } from '../state'
import { setPreviewIntent, TAB_VIEWS } from '../tabs'
import { EXPLORER_SCHEMAS, SCHEMA_IDS, type ExplorerItem } from './explorer-items'

export {
  EXPLORER_SCHEMAS,
  SCHEMA_IDS,
  isExplorerNodeType,
  type ExplorerItem,
  type ExplorerNodeType
} from './explorer-items'

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

/**
 * The shared action list for a node, rendered inside the menu popup so its
 * `useNodeActions` (which runs space/folder queries) only mounts on open.
 */
function NodeRowMenuBody({
  item,
  pinned,
  variant,
  onOpen,
  onRename
}: {
  item: ExplorerItem
  pinned: boolean
  variant: 'context' | 'dropdown'
  onOpen: () => void
  onRename: () => void
}) {
  const actions = useNodeActions({ item, pinned, onOpen, onRename })
  return variant === 'context' ? (
    <ActionMenuList actions={actions} />
  ) : (
    <ActionDropdownItems actions={actions} />
  )
}

/** Hover "⋯" kebab — the visible twin of the right-click menu. */
function NodeRowKebab(props: {
  item: ExplorerItem
  pinned: boolean
  onOpen: () => void
  onRename: () => void
}) {
  return (
    <Menu
      align="start"
      trigger={
        <button
          type="button"
          title="More actions"
          aria-label="More actions"
          onClick={(event) => event.stopPropagation()}
          className="invisible shrink-0 cursor-pointer border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:visible"
        >
          <MoreHorizontal size={13} strokeWidth={1.5} />
        </button>
      }
    >
      <NodeRowMenuBody {...props} variant="dropdown" />
    </Menu>
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
  const { update } = useMutate()
  const [dropping, setDropping] = useState(false)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const Icon = TAB_VIEWS[item.type].icon
  const title = item.title || 'Untitled'

  const open = () => {
    setPreviewIntent()
    navigateToNode(navigate, item.type, item.id)
  }

  const commitRename = (value: string) => {
    const next = value.trim()
    setEditing(false)
    if (next && next !== item.title) {
      void update(EXPLORER_SCHEMAS[item.type], item.id, { title: next })
    }
  }

  return (
    <ContextMenu
      className="contents"
      menu={
        <NodeRowMenuBody
          item={item}
          pinned={pinned}
          variant="context"
          onOpen={open}
          onRename={() => setEditing(true)}
        />
      }
    >
      <div
        role="button"
        tabIndex={0}
        draggable={!editing}
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
          if (editing) return
          open()
        }}
        onDoubleClick={() => {
          if (editing) return
          useWorkbench.getState().promoteTab(tabIdFor(item.type, item.id))
        }}
        onKeyDown={(event) => {
          if (editing) return
          if (event.key === 'Enter') {
            navigateToNode(navigate, item.type, item.id)
          }
          if (event.key === 'F2') {
            event.preventDefault()
            setEditing(true)
          }
        }}
        style={depth > 0 ? { paddingLeft: 8 + depth * 14 } : undefined}
        className={`group flex h-[26px] cursor-pointer items-center gap-2 rounded-sm px-2 text-ink-2 transition-colors hover:bg-accent hover:text-ink-1 ${
          dropping ? 'shadow-[inset_0_1px_0_0_var(--color-border-emphasis,currentColor)]' : ''
        }`}
      >
        <Icon size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={title}
            onClick={(event) => event.stopPropagation()}
            onBlur={(event) => commitRename(event.currentTarget.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') commitRename(event.currentTarget.value)
              if (event.key === 'Escape') setEditing(false)
            }}
            className="min-w-0 flex-1 rounded-sm border border-border bg-surface-0 px-1 text-xs text-ink-1 outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
        )}
        <NodeRowKebab item={item} pinned={pinned} onOpen={open} onRename={() => setEditing(true)} />
        <ExplorerPinToggle nodeId={item.id} pinned={pinned} />
      </div>
    </ContextMenu>
  )
}
