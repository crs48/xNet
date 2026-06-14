/**
 * Spaces: the people-container primitive (explorations 0179 + 0181).
 *
 * `useSpaces` lists/creates/nests Spaces and files nodes into them.
 * `useSpaceMembers` reads and writes the per-Space membership roster
 * (`SpaceMembership` edges) — the schema-native source of truth the
 * authorization cascade resolves against. Inviting by URL still rides the
 * share-link machinery (a Space invite is a share link with `docType: 'space'`),
 * and a claim writes a membership edge so the new member shows in the roster.
 */
import {
  SpaceSchema,
  SpaceMembershipSchema,
  buildSpaceTree,
  spaceMembershipId,
  type SpaceKind,
  type SpaceRole,
  type SpaceTreeNode,
  type SpaceVisibility
} from '@xnetjs/data'
import { useIdentity, useMutate, useQuery } from '@xnetjs/react'
import { useCallback, useMemo } from 'react'

type Did = `did:key:${string}`
const asDid = (value: string): Did => value as Did

export interface SpaceEntry {
  id: string
  name: string
  kind: SpaceKind
  parent?: string | null
  visibility: SpaceVisibility
  description?: string
  icon?: string
  color?: string
  archived?: boolean
  sortKey?: string
  owners: string[]
}

type SpaceDoc = {
  id: string
  name?: string
  kind?: SpaceKind
  parent?: string | null
  visibility?: SpaceVisibility
  description?: string
  icon?: string
  color?: string
  archived?: boolean
  sortKey?: string
  owners?: string[]
}

export function toSpaceEntry(doc: SpaceDoc): SpaceEntry {
  return {
    id: doc.id,
    name: doc.name ?? '',
    kind: doc.kind ?? 'workspace',
    parent: doc.parent ?? null,
    visibility: doc.visibility ?? 'private',
    description: doc.description,
    icon: doc.icon,
    color: doc.color,
    archived: doc.archived === true,
    sortKey: doc.sortKey,
    owners: Array.isArray(doc.owners) ? doc.owners : []
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
  /** Look up a single space by id. */
  getSpace: (spaceId: string | null | undefined) => SpaceEntry | null
  /** Create a Space; returns its id (or null on failure). */
  createSpace: (input: {
    name: string
    kind?: SpaceKind
    parent?: string | null
    description?: string
  }) => Promise<string | null>
  /** Rename a Space. */
  renameSpace: (spaceId: string, name: string) => Promise<void>
  /** Patch presentation fields (description / icon / color). */
  updateSpace: (
    spaceId: string,
    patch: Partial<Pick<SpaceEntry, 'name' | 'description' | 'icon' | 'color'>>
  ) => Promise<void>
  /** Archive a Space (kept for stragglers; never hard-deleted from here). */
  archiveSpace: (spaceId: string) => Promise<void>
  /** Re-parent a Space (move it under another, or to top level with null). */
  setSpaceParent: (spaceId: string, parentId: string | null) => Promise<void>
  /** File a node into a Space (its canonical security home); null = unfile. */
  setNodeSpace: (nodeId: string, spaceId: string | null) => Promise<void>
  /** Set a Space's visibility — the private→public dial. */
  setSpaceVisibility: (spaceId: string, visibility: SpaceVisibility) => Promise<void>
}

export function useSpaces(): SpacesApi {
  const { create, mutate } = useMutate()
  const { did } = useIdentity()
  const { data: spaceDocs } = useQuery(SpaceSchema, { orderBy: { name: 'asc' } })

  const allSpaces = useMemo(() => (spaceDocs ?? []).map(toSpaceEntry), [spaceDocs])
  const spaces = useMemo(() => activeSpaces(allSpaces), [allSpaces])
  const tree = useMemo(() => buildSpaceTree(spaces), [spaces])
  const byId = useMemo(() => new Map(allSpaces.map((s) => [s.id, s])), [allSpaces])

  const getSpace = useCallback<SpacesApi['getSpace']>(
    (spaceId) => (spaceId ? (byId.get(spaceId) ?? null) : null),
    [byId]
  )

  const createSpace = useCallback<SpacesApi['createSpace']>(
    async ({ name, kind = 'workspace', parent = null, description }) => {
      const trimmed = name.trim()
      if (!trimmed) return null
      const space = await create(SpaceSchema, {
        name: trimmed,
        kind,
        visibility: 'private',
        ...(did ? { owners: [asDid(did)] } : {}),
        ...(description ? { description } : {}),
        ...(parent ? { parent } : {})
      })
      // Seed the creator's owner membership so the roster + cascade have an edge.
      if (space?.id && did) {
        await create(
          SpaceMembershipSchema,
          {
            space: space.id,
            member: asDid(did),
            role: 'owner',
            addedBy: asDid(did),
            addedAt: Date.now()
          },
          spaceMembershipId(space.id, did)
        )
      }
      return space?.id ?? null
    },
    [create, did]
  )

  const renameSpace = useCallback<SpacesApi['renameSpace']>(
    async (spaceId, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await mutate([{ type: 'update', id: spaceId, data: { name: trimmed } }])
    },
    [mutate]
  )

  const updateSpace = useCallback<SpacesApi['updateSpace']>(
    async (spaceId, patch) => {
      await mutate([{ type: 'update', id: spaceId, data: patch }])
    },
    [mutate]
  )

  const archiveSpace = useCallback<SpacesApi['archiveSpace']>(
    async (spaceId) => {
      await mutate([{ type: 'update', id: spaceId, data: { archived: true } }])
    },
    [mutate]
  )

  const setSpaceParent = useCallback<SpacesApi['setSpaceParent']>(
    async (spaceId, parentId) => {
      await mutate([{ type: 'update', id: spaceId, data: { parent: parentId ?? '' } }])
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
    getSpace,
    createSpace,
    renameSpace,
    updateSpace,
    archiveSpace,
    setSpaceParent,
    setNodeSpace,
    setSpaceVisibility
  }
}

// ─── Membership roster ─────────────────────────────────────────────────────

export interface SpaceMemberEntry {
  id: string
  member: string
  role: SpaceRole
  addedBy?: string
  addedAt?: number
}

export interface SpaceMembersApi {
  members: SpaceMemberEntry[]
  /** Add (or upsert) a member at a role. */
  addMember: (memberDid: string, role: SpaceRole) => Promise<void>
  /** Change a member's role. */
  setMemberRole: (memberDid: string, role: SpaceRole) => Promise<void>
  /** Remove a member from the Space. */
  removeMember: (memberDid: string) => Promise<void>
}

type MembershipDoc = {
  id: string
  space?: string
  member?: string
  role?: SpaceRole
  addedBy?: string
  addedAt?: number
}

export function useSpaceMembers(spaceId: string | null): SpaceMembersApi {
  const { create, mutate } = useMutate()
  const { did } = useIdentity()
  const { data: docs } = useQuery(SpaceMembershipSchema, spaceId ? { where: { space: spaceId } } : {})

  const members = useMemo<SpaceMemberEntry[]>(() => {
    if (!spaceId) return []
    return (docs ?? [])
      .map((doc: MembershipDoc) => doc)
      .filter((doc) => doc.space === spaceId && typeof doc.member === 'string')
      .map((doc) => ({
        id: doc.id,
        member: doc.member as string,
        role: (doc.role ?? 'member') as SpaceRole,
        addedBy: doc.addedBy,
        addedAt: doc.addedAt
      }))
  }, [docs, spaceId])

  const addMember = useCallback<SpaceMembersApi['addMember']>(
    async (memberDid, role) => {
      if (!spaceId || !memberDid) return
      await create(
        SpaceMembershipSchema,
        {
          space: spaceId,
          member: asDid(memberDid),
          role,
          addedBy: asDid(did ?? memberDid),
          addedAt: Date.now()
        },
        spaceMembershipId(spaceId, memberDid)
      )
    },
    [create, spaceId, did]
  )

  const setMemberRole = useCallback<SpaceMembersApi['setMemberRole']>(
    async (memberDid, role) => {
      if (!spaceId || !memberDid) return
      await mutate([
        { type: 'update', id: spaceMembershipId(spaceId, memberDid), data: { role } }
      ])
    },
    [mutate, spaceId]
  )

  const removeMember = useCallback<SpaceMembersApi['removeMember']>(
    async (memberDid) => {
      if (!spaceId || !memberDid) return
      await mutate([{ type: 'delete', id: spaceMembershipId(spaceId, memberDid) }])
    },
    [mutate, spaceId]
  )

  return { members, addMember, setMemberRole, removeMember }
}
