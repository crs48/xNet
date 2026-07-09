/**
 * useNodeActions (exploration 0285) — the shared verb list for an Explorer
 * node, rendered by both the right-click ContextMenu and the hover "⋯" kebab so
 * the two never drift.
 *
 * The hook wires the real mutations (`useMutate` for delete, `useSpaces` for
 * move-to-workspace, `useExplorerFolders` for move-to-folder) and the workbench
 * store (Desk pin, sidebar pin). Because it calls the space/folder query hooks,
 * it must only be mounted lazily — inside the menu popup, which Base UI renders
 * on open — never per row.
 */
import { useMutate } from '@xnetjs/react'
import { type Action } from '@xnetjs/ui'
import {
  FolderInput,
  LampDesk,
  Pencil,
  Pin,
  SquareArrowOutUpRight,
  Trash2,
  Users
} from 'lucide-react'
import { createElement } from 'react'
import { useWorkbench } from '../workbench/state'
import { useExplorerFolders } from '../workbench/views/explorer-folders-context'
import { SCHEMA_IDS, type ExplorerItem } from '../workbench/views/explorer-items'
import { useSpaces } from './useSpaces'

export interface UseNodeActionsOptions {
  item: ExplorerItem
  /** Whether the node is currently pinned to the sidebar. */
  pinned: boolean
  /** Open the node (navigate to it). */
  onOpen: () => void
  /** Enter inline-rename mode on the row. */
  onRename: () => void
}

/** Build the ordered {@link Action} list for an Explorer node. */
export function useNodeActions({
  item,
  pinned,
  onOpen,
  onRename
}: UseNodeActionsOptions): Action[] {
  const { remove } = useMutate()
  const { spaces, setNodeSpace } = useSpaces()
  const { folderRows, moveItemToFolder } = useExplorerFolders()

  const moveToSpace: Action = {
    id: 'move-space',
    label: 'Move to workspace',
    icon: createElement(Users, { size: 14 }),
    children: [
      { id: 'space-none', label: 'No workspace', run: () => void setNodeSpace(item.id, null) },
      ...spaces.map((space) => ({
        id: `space-${space.id}`,
        label: space.name || 'Untitled space',
        run: () => void setNodeSpace(item.id, space.id)
      }))
    ]
  }

  const moveToFolder: Action = {
    id: 'move-folder',
    label: 'Move to folder',
    icon: createElement(FolderInput, { size: 14 }),
    children: [
      { id: 'folder-none', label: 'Unfiled', run: () => void moveItemToFolder(item, null) },
      ...folderRows.map((row) => ({
        id: `folder-${row.folder.id}`,
        label: row.folder.name || 'Untitled folder',
        run: () => void moveItemToFolder(item, row.folder.id)
      }))
    ]
  }

  return [
    {
      id: 'open',
      label: 'Open',
      icon: createElement(SquareArrowOutUpRight, { size: 14 }),
      run: onOpen
    },
    { id: 'rename', label: 'Rename…', icon: createElement(Pencil, { size: 14 }), run: onRename },
    { id: '---' },
    {
      id: 'pin-desk',
      label: 'Pin to Desk',
      icon: createElement(LampDesk, { size: 14 }),
      run: () =>
        useWorkbench.getState().queueDeskPin({
          nodeId: item.id,
          schemaId: SCHEMA_IDS[item.type],
          title: item.title || 'Untitled'
        })
    },
    {
      id: 'pin-sidebar',
      label: pinned ? 'Unpin from sidebar' : 'Pin to sidebar',
      icon: createElement(Pin, { size: 14 }),
      run: () => useWorkbench.getState().togglePinnedNode(item.id)
    },
    moveToSpace,
    moveToFolder,
    { id: '---' },
    {
      id: 'delete',
      label: 'Delete',
      icon: createElement(Trash2, { size: 14 }),
      danger: true,
      run: () => void remove(item.id)
    }
  ]
}
