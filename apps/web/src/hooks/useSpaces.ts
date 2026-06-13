/**
 * Spaces: the group primitive (exploration 0179).
 *
 * One hook to list/create Spaces, file a node into a Space (its canonical
 * security home), and set a Space's visibility. Membership and invites ride the
 * existing share-link machinery (a Space invite is a share link with
 * `docType: 'space'`; members are the grants on the Space id) — so this hook
 * deliberately does NOT reimplement membership; the ShareDialog opened on a
 * Space id handles it.
 */
import {
  SpaceSchema,
  buildSpaceTree,
  type SpaceKind,
  type SpaceTreeNode,
  type SpaceVisibility
} from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'

export interface SpaceEntry {
  id: string
  name: string
  kind: SpaceKind
  parent?: string | null
  visibility: SpaceVisibility
  icon?: string
  color?: string
  archived?: boolean
  sortKey?: string
}

type SpaceDoc = {
  id: string
  name?: string
  kind?: SpaceKind
  parent?: string | null
  visibility?: SpaceVisibility
  icon?: string
  color?: string
  archived?: boolean
  sortKey?: string
}

export function toSpaceEntry(doc: SpaceDoc): SpaceEntry {
  return {
    id: doc.id,
    name: doc.name ?? '',
    kind: doc.kind ?? 'workspace',
    parent: doc.parent ?? null,
    visibility: doc.visibility ?? 'private',
    icon: doc.icon,
    color: doc.color,
    archived: doc.archived === true,
    sortKey: doc.sortKey
  }
}

/** Active (non-archived, named) spaces. */
export function activeSpaces(spaces: SpaceEntry[]): SpaceEntry[] {
  return spaces.filter((space) => !space.archived && space.name)
}

export interface SpacesApi {
  /** All spaces, including archived (for management UI). */
  allSpaces: SpaceEntry[]
  /** Active spaces only. */
  spaces: SpaceEntry[]
  /** Active spaces as a nesting tree (by `parent`). */
  tree: Array<SpaceTreeNode<SpaceEntry>>
  /** Create a Space; returns its id (or null on failure). */
  createSpace: (input: {
    name: string
    kind?: SpaceKind
    parent?: string | null
  }) => Promise<string | null>
  /** Rename a Space. */
  renameSpace: (spaceId: string, name: string) => Promise<void>
  /** Archive a Space (kept for stragglers; never hard-deleted from here). */
  archiveSpace: (spaceId: string) => Promise<void>
  /** File a node into a Space (its canonical security home); null = unfile. */
  setNodeSpace: (nodeId: string, spaceId: string | null) => Promise<void>
  /** Set a Space's visibility — the private→public dial. */
  setSpaceVisibility: (spaceId: string, visibility: SpaceVisibility) => Promise<void>
}

export function useSpaces(): SpacesApi {
  const { create, mutate } = useMutate()
  const { data: spaceDocs } = useQuery(SpaceSchema, { orderBy: { name: 'asc' } })

  const allSpaces = useMemo(() => (spaceDocs ?? []).map(toSpaceEntry), [spaceDocs])
  const spaces = useMemo(() => activeSpaces(allSpaces), [allSpaces])
  const tree = useMemo(() => buildSpaceTree(spaces), [spaces])

  const createSpace = useCallback<SpacesApi['createSpace']>(
    async ({ name, kind = 'workspace', parent = null }) => {
      const trimmed = name.trim()
      if (!trimmed) return null
      const space = await create(SpaceSchema, {
        name: trimmed,
        kind,
        visibility: 'private',
        ...(parent ? { parent } : {})
      })
      return space?.id ?? null
    },
    [create]
  )

  const renameSpace = useCallback<SpacesApi['renameSpace']>(
    async (spaceId, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await mutate([{ type: 'update', id: spaceId, data: { name: trimmed } }])
    },
    [mutate]
  )

  const archiveSpace = useCallback<SpacesApi['archiveSpace']>(
    async (spaceId) => {
      await mutate([{ type: 'update', id: spaceId, data: { archived: true } }])
    },
    [mutate]
  )

  const setNodeSpace = useCallback<SpacesApi['setNodeSpace']>(
    async (nodeId, spaceId) => {
      await mutate([{ type: 'update', id: nodeId, data: { space: spaceId ?? '' } }])
    },
    [mutate]
  )

  const setSpaceVisibility = useCallback<SpacesApi['setSpaceVisibility']>(
    async (spaceId, visibility) => {
      await mutate([{ type: 'update', id: spaceId, data: { visibility } }])
    },
    [mutate]
  )

  return {
    allSpaces,
    spaces,
    tree,
    createSpace,
    renameSpace,
    archiveSpace,
    setNodeSpace,
    setSpaceVisibility
  }
}
