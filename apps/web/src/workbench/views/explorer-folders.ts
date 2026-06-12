/**
 * Explorer folder partitioning (exploration 0169) — pure and unit-tested.
 *
 * Items carry their canonical home as a single-valued `folder` relation
 * plus a fractional `sortKey` for order among folder siblings. Sort keys
 * compare by code units (never localeCompare).
 */
import { compareSortKeys, generateSortKey } from '@xnetjs/data'

export interface FolderableItem {
  id: string
  folder?: string | null
  sortKey?: string
  updatedAt?: number
}

export interface FolderPartition<T extends FolderableItem> {
  /** Items without a folder, in the caller's original order */
  unfiled: T[]
  /** Items per folder id, ordered by sortKey (code-unit compare) */
  byFolder: Map<string, T[]>
}

function compareFolderSiblings(a: FolderableItem, b: FolderableItem): number {
  const bySortKey = compareSortKeys(a.sortKey ?? '', b.sortKey ?? '')
  if (bySortKey !== 0) return bySortKey
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
}

/** Split items into unfiled and per-folder buckets (sorted by sortKey). */
export function partitionByFolder<T extends FolderableItem>(items: T[]): FolderPartition<T> {
  const unfiled: T[] = []
  const byFolder = new Map<string, T[]>()

  for (const item of items) {
    if (!item.folder) {
      unfiled.push(item)
      continue
    }
    const bucket = byFolder.get(item.folder)
    if (bucket) bucket.push(item)
    else byFolder.set(item.folder, [item])
  }

  for (const bucket of byFolder.values()) {
    bucket.sort(compareFolderSiblings)
  }

  return { unfiled, byFolder }
}

/** Sort key that appends after the last sibling in a folder. */
export function appendSortKey(siblings: FolderableItem[]): string {
  const last = siblings[siblings.length - 1]
  return generateSortKey(last?.sortKey || undefined)
}

/**
 * Sort key that inserts immediately before `beforeId` among siblings.
 * Falls back to appending when the target is not present.
 */
export function insertBeforeSortKey(siblings: FolderableItem[], beforeId: string): string {
  const index = siblings.findIndex((sibling) => sibling.id === beforeId)
  if (index < 0) return appendSortKey(siblings)
  const prev = siblings[index - 1]
  return generateSortKey(prev?.sortKey || undefined, siblings[index].sortKey || undefined)
}
