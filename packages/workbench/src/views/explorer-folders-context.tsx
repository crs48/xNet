/**
 * Explorer folders context (exploration 0169).
 *
 * One provider (mounted by Explorer) owns the Folder query and every
 * folder mutation: move item / move folder / create / rename / delete.
 * Tree rows and the per-row "Move to folder…" menu consume it, so the
 * append/insert sortKey logic lives in exactly one place.
 *
 * Invariants:
 * - An item has at most ONE home (`folder` is single-valued).
 * - Deleting a folder re-parents child folders and contained items to
 *   the deleted folder's parent (or Unfiled) — content is never deleted.
 * - Re-parenting a folder under itself or a descendant is rejected
 *   (wouldCreateFolderCycle).
 */
import {
  FolderSchema,
  buildFolderTree,
  flattenFolderTree,
  wouldCreateFolderCycle,
  type FolderTreeNode
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { appendSortKey, insertBeforeSortKey, partitionByFolder } from './explorer-folders'
import { EXPLORER_SCHEMAS, type ExplorerItem } from './explorer-items'

export interface ExplorerFolderEntry {
  id: string
  name: string
  parent?: string | null
  sortKey?: string
}

export interface ExplorerFoldersValue {
  /** Folder nodes by id */
  foldersById: Map<string, ExplorerFolderEntry>
  /** Nested folder tree, cycle-safe */
  tree: Array<FolderTreeNode<ExplorerFolderEntry>>
  /** Fully-expanded depth-first rows (for menus) */
  folderRows: Array<FolderTreeNode<ExplorerFolderEntry>>
  /** Items per folder id, ordered by sortKey */
  itemsByFolder: Map<string, ExplorerItem[]>
  /** Items with no folder */
  unfiled: ExplorerItem[]
  moveItemToFolder: (
    item: Pick<ExplorerItem, 'id' | 'type'>,
    folderId: string | null
  ) => Promise<void>
  moveItemBefore: (
    item: Pick<ExplorerItem, 'id' | 'type'>,
    folderId: string,
    beforeItemId: string
  ) => Promise<void>
  moveFolder: (folderId: string, parentId: string | null) => Promise<void>
  createFolder: (parentId: string | null) => Promise<string | null>
  createPageInFolder: (folderId: string) => Promise<string | null>
  renameFolder: (folderId: string, name: string) => Promise<void>
  deleteFolder: (folderId: string) => Promise<void>
}

const ExplorerFoldersContext = createContext<ExplorerFoldersValue | null>(null)

export function useExplorerFolders(): ExplorerFoldersValue {
  const value = useContext(ExplorerFoldersContext)
  if (!value) throw new Error('useExplorerFolders must be used inside ExplorerFoldersProvider')
  return value
}

function toFolderEntry(doc: {
  id: string
  name?: string
  parent?: string
  sortKey?: string
}): ExplorerFolderEntry {
  return {
    id: doc.id,
    name: doc.name ?? '',
    parent: doc.parent ?? null,
    sortKey: doc.sortKey
  }
}

/** Folders this folder directly contains (for delete re-parenting). */
function childFoldersOf(folders: ExplorerFolderEntry[], folderId: string): ExplorerFolderEntry[] {
  return folders.filter((folder) => folder.parent === folderId)
}

export function ExplorerFoldersProvider({
  items,
  children
}: {
  items: ExplorerItem[]
  children: ReactNode
}) {
  const { create, mutate } = useMutate()
  // Bounded read; `createdAt` is an indexed system order so this stays on the
  // fast path as the workspace grows (exploration 0184).
  const { data: folderDocs } = useQuery(FolderSchema, {
    orderBy: { createdAt: 'asc' },
    limit: 500
  })

  const folders = useMemo(() => (folderDocs ?? []).map(toFolderEntry), [folderDocs])
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const folderRows = useMemo(() => flattenFolderTree(tree), [tree])
  const partition = useMemo(() => partitionByFolder(items), [items])

  const value = useMemo<ExplorerFoldersValue>(() => {
    const siblingsIn = (folderId: string | null) =>
      folderId ? (partition.byFolder.get(folderId) ?? []) : []

    const moveItemToFolder: ExplorerFoldersValue['moveItemToFolder'] = async (item, folderId) => {
      const sortKey = folderId ? appendSortKey(siblingsIn(folderId)) : null
      await mutate([{ type: 'update', id: item.id, data: { folder: folderId, sortKey } }])
    }

    const moveItemBefore: ExplorerFoldersValue['moveItemBefore'] = async (
      item,
      folderId,
      beforeItemId
    ) => {
      const siblings = siblingsIn(folderId).filter((sibling) => sibling.id !== item.id)
      const sortKey = insertBeforeSortKey(siblings, beforeItemId)
      await mutate([{ type: 'update', id: item.id, data: { folder: folderId, sortKey } }])
    }

    const moveFolder: ExplorerFoldersValue['moveFolder'] = async (folderId, parentId) => {
      if (wouldCreateFolderCycle(folderId, parentId, foldersById)) return
      await mutate([{ type: 'update', id: folderId, data: { parent: parentId } }])
    }

    const createFolder: ExplorerFoldersValue['createFolder'] = async (parentId) => {
      const folder = await create(FolderSchema, {
        name: 'New folder',
        parent: parentId ?? undefined
      })
      return folder?.id ?? null
    }

    const createPageInFolder: ExplorerFoldersValue['createPageInFolder'] = async (folderId) => {
      const page = await create(EXPLORER_SCHEMAS.page, {
        title: 'Untitled',
        folder: folderId,
        sortKey: appendSortKey(siblingsIn(folderId))
      })
      return page?.id ?? null
    }

    const renameFolder: ExplorerFoldersValue['renameFolder'] = async (folderId, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await mutate([{ type: 'update', id: folderId, data: { name: trimmed } }])
    }

    const deleteFolder: ExplorerFoldersValue['deleteFolder'] = async (folderId) => {
      const parent = foldersById.get(folderId)?.parent ?? null
      await mutate([
        ...childFoldersOf(folders, folderId).map((child) => ({
          type: 'update' as const,
          id: child.id,
          data: { parent }
        })),
        ...siblingsIn(folderId).map((item) => ({
          type: 'update' as const,
          id: item.id,
          data: { folder: parent }
        })),
        { type: 'delete' as const, id: folderId }
      ])
    }

    return {
      foldersById,
      tree,
      folderRows,
      itemsByFolder: partition.byFolder,
      unfiled: partition.unfiled,
      moveItemToFolder,
      moveItemBefore,
      moveFolder,
      createFolder,
      createPageInFolder,
      renameFolder,
      deleteFolder
    }
  }, [create, mutate, folders, foldersById, tree, folderRows, partition])

  return <ExplorerFoldersContext.Provider value={value}>{children}</ExplorerFoldersContext.Provider>
}
