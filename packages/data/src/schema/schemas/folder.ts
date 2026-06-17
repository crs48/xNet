/**
 * FolderSchema - canonical container (exploration 0169).
 *
 * Containment is stored on the CHILD as a single-valued `folder`
 * relation (see Task.parent precedent) — one home per node, enforced
 * structurally. Folders nest via their own `parent`. Folders carry no
 * permissions; Grants remain per-node.
 *
 * Sibling order (both folder-in-folder and item-in-folder) uses the
 * fractional `sortKey` machinery — compare by code units only, never
 * localeCompare (see fractional-index.ts).
 */

import type { InferNode } from '../types'
import { presets } from '../../auth'
import { compareSortKeys } from '../../database/fractional-index'
import { defineSchema } from '../define'
import { created, createdBy, relation, text } from '../properties'

export const FOLDER_SCHEMA_IRI = 'xnet://xnet.fyi/Folder@1.0.0'

export const FolderSchema = defineSchema({
  name: 'Folder',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Folder display name */
    name: text({ required: true, maxLength: 120 }),

    /** Emoji or icon URL */
    icon: text({ maxLength: 80 }),

    /** Parent folder; empty = top level */
    parent: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among siblings — fractional index, code-unit compare */
    sortKey: text({ maxLength: 500 }),

    createdAt: created(),
    createdBy: createdBy()
  },
  document: undefined,
  // Standalone/personal content: owner-only by default (exploration 0192).
  authorization: presets.private()
})

export type Folder = InferNode<(typeof FolderSchema)['_properties']>

// ─── Pure tree helpers ───────────────────────────────────────────────────────

/** Minimal shape the tree helpers need; Folder nodes satisfy it. */
export interface FolderLike {
  id: string
  name?: string
  parent?: string | null
  sortKey?: string
}

export interface FolderTreeNode<F extends FolderLike = FolderLike> {
  folder: F
  depth: number
  children: Array<FolderTreeNode<F>>
}

function compareSiblings(a: FolderLike, b: FolderLike): number {
  const bySortKey = compareSortKeys(a.sortKey ?? '', b.sortKey ?? '')
  if (bySortKey !== 0) return bySortKey
  // Code-unit tiebreak keeps ordering deterministic across peers
  return a.name === b.name ? 0 : (a.name ?? '') < (b.name ?? '') ? -1 : 1
}

/**
 * Build the folder tree from a flat list.
 *
 * Cycle-safe: folders whose parent is missing are treated as roots, and
 * folders trapped in a parent cycle are lifted to the root level so no
 * folder ever disappears from the UI (the no-orphans rule).
 */
export function buildFolderTree<F extends FolderLike>(folders: F[]): Array<FolderTreeNode<F>> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const childrenOf = new Map<string, F[]>()
  const roots: F[] = []

  for (const folder of folders) {
    const parentId = folder.parent ?? null
    if (!parentId || parentId === folder.id || !byId.has(parentId)) {
      roots.push(folder)
      continue
    }
    const siblings = childrenOf.get(parentId)
    if (siblings) siblings.push(folder)
    else childrenOf.set(parentId, [folder])
  }

  const attached = new Set<string>()
  const toNode = (folder: F, depth: number): FolderTreeNode<F> => {
    attached.add(folder.id)
    const children = (childrenOf.get(folder.id) ?? [])
      .filter((child) => !attached.has(child.id))
      .sort(compareSiblings)
      .map((child) => toNode(child, depth + 1))
    return { folder, depth, children }
  }

  const tree = roots.sort(compareSiblings).map((folder) => toNode(folder, 0))

  // Lift cycle members (unreachable from any root) to the top level
  const stranded = folders.filter((folder) => !attached.has(folder.id)).sort(compareSiblings)
  for (const folder of stranded) {
    if (!attached.has(folder.id)) tree.push(toNode(folder, 0))
  }

  return tree
}

/** Depth-first flatten for virtualized rendering. */
export function flattenFolderTree<F extends FolderLike>(
  tree: Array<FolderTreeNode<F>>,
  isExpanded: (folderId: string) => boolean = () => true
): Array<FolderTreeNode<F>> {
  const rows: Array<FolderTreeNode<F>> = []
  const visit = (node: FolderTreeNode<F>) => {
    rows.push(node)
    if (isExpanded(node.folder.id)) node.children.forEach(visit)
  }
  tree.forEach(visit)
  return rows
}

/**
 * Ancestor ids of a folder, nearest first. Cycle-safe (stops on revisit).
 */
export function folderAncestorIds(folderId: string, byId: Map<string, FolderLike>): string[] {
  const ancestors: string[] = []
  const seen = new Set<string>([folderId])
  let current = byId.get(folderId)?.parent ?? null
  while (current && !seen.has(current)) {
    ancestors.push(current)
    seen.add(current)
    current = byId.get(current)?.parent ?? null
  }
  return ancestors
}

/**
 * Would re-parenting `folderId` under `newParentId` create a cycle?
 * True when the new parent is the folder itself or any of its descendants.
 */
export function wouldCreateFolderCycle(
  folderId: string,
  newParentId: string | null | undefined,
  byId: Map<string, FolderLike>
): boolean {
  if (!newParentId) return false
  if (newParentId === folderId) return true
  return folderAncestorIds(newParentId, byId).includes(folderId)
}

/**
 * Breadcrumb path for a folder: root-first ids ending with the folder
 * itself. Cycle-safe.
 */
export function folderPathIds(folderId: string, byId: Map<string, FolderLike>): string[] {
  return [...folderAncestorIds(folderId, byId).reverse(), folderId]
}
