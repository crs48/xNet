/**
 * Explorer folder tree (exploration 0169).
 *
 * Folders are the canonical home: each row is a drop target (item →
 * move into folder, folder → re-parent with cycle check), a drag
 * source, and carries hover affordances for new-page / rename / delete.
 * Items inside an expanded folder render as ordinary ExplorerRows with
 * insert-before drop reordering. Expansion state persists with the
 * workbench store. Deleting a folder re-parents its contents — never
 * cascades.
 */
import type { FolderTreeNode } from '@xnetjs/data'
import { useNavigate } from '@tanstack/react-router'
import { hasNodeTransfer, getNodeTransfer, setNodeTransfer, type NodeTransfer } from '@xnetjs/ui'
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderPlus,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useUndoToast } from '../../components/UndoToast'
import { navigateToNode } from '../navigation'
import { useWorkbench } from '../state'
import { useExplorerFolders, type ExplorerFolderEntry } from './explorer-folders-context'
import { ExplorerRow, isExplorerNodeType } from './explorer-rows'

function useFolderTransferDrop(folderId: string | null): (transfer: NodeTransfer) => void {
  const { moveItemToFolder, moveFolder } = useExplorerFolders()
  return (transfer) => {
    if (transfer.nodeType === 'folder') {
      void moveFolder(transfer.nodeId, folderId)
    } else if (isExplorerNodeType(transfer.nodeType)) {
      void moveItemToFolder({ id: transfer.nodeId, type: transfer.nodeType }, folderId)
    }
  }
}

/** Shared dragover/drop wiring for folder-row and section-label targets. */
function DropTarget({
  onTransfer,
  className,
  children
}: {
  onTransfer: (transfer: NodeTransfer) => void
  className: (over: boolean) => string
  children: ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={(event) => {
        if (!hasNodeTransfer(event)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        const transfer = getNodeTransfer(event)
        if (!transfer) return
        event.preventDefault()
        event.stopPropagation()
        onTransfer(transfer)
      }}
      className={className(over)}
    >
      {children}
    </div>
  )
}

function FolderNameEditor({ folder, onDone }: { folder: ExplorerFolderEntry; onDone: () => void }) {
  const { renameFolder } = useExplorerFolders()
  return (
    <input
      type="text"
      autoFocus
      defaultValue={folder.name}
      onFocus={(event) => event.target.select()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          event.currentTarget.value = folder.name
          event.currentTarget.blur()
        }
      }}
      onBlur={(event) => {
        void renameFolder(folder.id, event.target.value)
        onDone()
      }}
      className="h-5 min-w-0 flex-1 rounded-sm border border-border-emphasis bg-surface-0 px-1 text-xs text-ink-1 outline-none"
    />
  )
}

function FolderHoverActions({
  folder,
  onRename
}: {
  folder: ExplorerFolderEntry
  onRename: () => void
}) {
  const navigate = useNavigate()
  const { createPageInFolder, deleteFolder } = useExplorerFolders()
  const { showUndoToast } = useUndoToast()
  const expand = useEnsureFolderExpanded()

  const action = (label: string, onClick: () => void, icon: ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="invisible shrink-0 cursor-pointer border-none bg-transparent p-0 text-ink-3 hover:text-ink-1 group-hover:visible"
    >
      {icon}
    </button>
  )

  return (
    <>
      {action(
        'New page in folder',
        () => {
          expand(folder.id)
          void createPageInFolder(folder.id).then((pageId) => {
            if (pageId) navigateToNode(navigate, 'page', pageId)
          })
        },
        <Plus size={11} strokeWidth={1.5} />
      )}
      {action('Rename folder', onRename, <Pencil size={11} strokeWidth={1.5} />)}
      {action(
        'Delete folder (contents move up)',
        () => {
          const label = folder.name?.trim() || 'Folder'
          void deleteFolder(folder.id).then(() => showUndoToast(`${label} deleted`))
        },
        <Trash2 size={11} strokeWidth={1.5} />
      )}
    </>
  )
}

function useEnsureFolderExpanded(): (folderId: string) => void {
  return (folderId) => {
    const state = useWorkbench.getState()
    if (!state.expandedFolderIds.includes(folderId)) state.toggleFolderExpanded(folderId)
  }
}

/** The name area of a folder row: rename input while editing, label otherwise. */
function FolderRowLabel({
  folder,
  editing,
  setEditingId
}: {
  folder: ExplorerFolderEntry
  editing: boolean
  setEditingId: (id: string | null) => void
}) {
  if (editing) {
    return <FolderNameEditor folder={folder} onDone={() => setEditingId(null)} />
  }
  return (
    <span
      className="min-w-0 flex-1 truncate text-xs"
      onDoubleClick={(event) => {
        event.stopPropagation()
        setEditingId(folder.id)
      }}
    >
      {folder.name || 'Untitled folder'}
    </span>
  )
}

function FolderRow({
  node,
  expanded,
  editing,
  setEditingId
}: {
  node: FolderTreeNode<ExplorerFolderEntry>
  expanded: boolean
  editing: boolean
  setEditingId: (id: string | null) => void
}) {
  const onTransfer = useFolderTransferDrop(node.folder.id)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const toggle = () => useWorkbench.getState().toggleFolderExpanded(node.folder.id)

  return (
    <DropTarget
      onTransfer={onTransfer}
      className={(over) =>
        `group flex h-[26px] cursor-pointer items-center gap-1.5 rounded-sm px-2 text-ink-2 transition-colors hover:bg-accent hover:text-ink-1 ${
          over ? 'bg-accent text-ink-1' : ''
        }`
      }
    >
      <div
        role="button"
        tabIndex={0}
        draggable={!editing}
        data-explorer-folder-id={node.folder.id}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          setNodeTransfer(event, {
            nodeId: node.folder.id,
            nodeType: 'folder',
            title: node.folder.name,
            sourceContext: 'explorer'
          })
        }}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') toggle()
        }}
        style={node.depth > 0 ? { paddingLeft: node.depth * 14 } : undefined}
        className="flex min-w-0 flex-1 items-center gap-1.5"
      >
        <Chevron size={12} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <FolderClosed size={13} strokeWidth={1.5} className="shrink-0 text-ink-3" />
        <FolderRowLabel folder={node.folder} editing={editing} setEditingId={setEditingId} />
        <FolderHoverActions folder={node.folder} onRename={() => setEditingId(node.folder.id)} />
      </div>
    </DropTarget>
  )
}

function FolderContents({
  node,
  pinnedNodeIds
}: {
  node: FolderTreeNode<ExplorerFolderEntry>
  pinnedNodeIds: string[]
}) {
  const { itemsByFolder, moveItemBefore } = useExplorerFolders()
  const items = itemsByFolder.get(node.folder.id) ?? []
  return (
    <>
      {items.map((item) => (
        <ExplorerRow
          key={item.id}
          item={item}
          pinned={pinnedNodeIds.includes(item.id)}
          depth={node.depth + 1}
          onDropBefore={(transfer) => {
            if (!isExplorerNodeType(transfer.nodeType)) return
            void moveItemBefore(
              { id: transfer.nodeId, type: transfer.nodeType },
              node.folder.id,
              item.id
            )
          }}
        />
      ))}
    </>
  )
}

function FolderBranch({
  node,
  pinnedNodeIds,
  expandedFolderIds,
  editingId,
  setEditingId
}: {
  node: FolderTreeNode<ExplorerFolderEntry>
  pinnedNodeIds: string[]
  expandedFolderIds: string[]
  editingId: string | null
  setEditingId: (id: string | null) => void
}) {
  const expanded = expandedFolderIds.includes(node.folder.id)
  return (
    <>
      <FolderRow
        node={node}
        expanded={expanded}
        editing={editingId === node.folder.id}
        setEditingId={setEditingId}
      />
      {expanded && <FolderContents node={node} pinnedNodeIds={pinnedNodeIds} />}
      {expanded &&
        node.children.map((child) => (
          <FolderBranch
            key={child.folder.id}
            node={child}
            pinnedNodeIds={pinnedNodeIds}
            expandedFolderIds={expandedFolderIds}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        ))}
    </>
  )
}

/** Section label that also accepts drops: folders → root, items → unfile. */
function FolderSectionLabel({ onCreated }: { onCreated: (folderId: string | null) => void }) {
  const onTransfer = useFolderTransferDrop(null)
  const { createFolder } = useExplorerFolders()

  return (
    <DropTarget
      onTransfer={onTransfer}
      className={(over) =>
        `flex items-center justify-between px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-ink-3 ${
          over ? 'text-ink-1' : ''
        }`
      }
    >
      <span>Folders</span>
      <button
        type="button"
        title="New folder"
        aria-label="New folder"
        onClick={() => {
          void createFolder(null).then(onCreated)
        }}
        className="cursor-pointer border-none bg-transparent p-0 text-ink-3 hover:text-ink-1"
      >
        <FolderPlus size={12} strokeWidth={1.5} />
      </button>
    </DropTarget>
  )
}

/** "Folders" header plus the nested tree; rename state lives here. */
export function ExplorerFoldersSection({ pinnedNodeIds }: { pinnedNodeIds: string[] }) {
  const { tree } = useExplorerFolders()
  const expandedFolderIds = useWorkbench((state) => state.expandedFolderIds)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="px-1">
      <FolderSectionLabel onCreated={setEditingId} />
      {tree.map((node) => (
        <FolderBranch
          key={node.folder.id}
          node={node}
          pinnedNodeIds={pinnedNodeIds}
          expandedFolderIds={expandedFolderIds}
          editingId={editingId}
          setEditingId={setEditingId}
        />
      ))}
    </div>
  )
}
