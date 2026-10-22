import type { HubStorage, SerializedNodeChange } from '../storage/interface'

export const COMMUNITY_ROOM_PREFIX = 'xnet-community-'
const SPACE = 'xnet://xnet.fyi/Space@'
const MEMBERSHIP = 'xnet://xnet.fyi/SpaceMembership@'

/** Only the space creator's signed records can bootstrap this prototype's roster. */
export async function communityRecord(storage: HubStorage, spaceId: string, nodeId = spaceId) {
  // The owner index is pinned from the first verified Space creation. A later
  // writer can choose a lower Lamport time, so sorting authors is not authority.
  const creator = await storage.getNodeOwner(spaceId)
  if (!creator) return null
  const history = await storage.getNodeChangesForNode(creator, nodeId)
  const prefix = nodeId === spaceId ? SPACE : MEMBERSHIP
  if (
    !history.some(
      (change) =>
        change.authorDid === creator &&
        (change.schemaId ?? change.payload.schemaId ?? '').startsWith(prefix)
    )
  )
    return null
  const changes = history.filter(
    (change) =>
      change.authorDid === creator &&
      (change.schemaId ?? change.payload.schemaId ?? prefix).startsWith(prefix)
  )
  if (!changes.length) return null
  const properties: Record<string, unknown> = {}
  let deleted = false
  for (const change of changes) {
    Object.assign(properties, change.payload.properties)
    if (change.payload.deleted !== undefined) deleted = change.payload.deleted
  }
  return { creator, changes, properties, deleted }
}

export async function canReadCommunity(storage: HubStorage, did: string, spaceId: string) {
  const space = await communityRecord(storage, spaceId)
  if (!space || space.deleted || space.properties.archived || space.properties.parent) return false
  if (did === space.creator) return true
  const member = await communityRecord(storage, spaceId, `spacemember:${spaceId}:${did}`)
  return (
    !!member &&
    !member.deleted &&
    member.properties.space === spaceId &&
    member.properties.member === did &&
    ['viewer', 'commenter', 'member', 'admin', 'owner'].includes(String(member.properties.role)) &&
    (member.properties.expiresAt === undefined ||
      (typeof member.properties.expiresAt === 'number' && member.properties.expiresAt > Date.now()))
  )
}

/** Backfill existing circles, including ones created before the room was available. */
export async function communityChanges(
  storage: HubStorage,
  spaceId: string
): Promise<SerializedNodeChange[]> {
  const space = await communityRecord(storage, spaceId)
  if (!space) return []
  const members = new Set<string>([space.creator])
  const children = await storage.listContainedNodes(spaceId)
  if (children.length > 2000) throw new Error('Community dependency sync exceeds 2000 records.')
  for (const id of children) {
    const changes = await storage.getNodeChangesForNode(space.creator, id)
    for (const change of changes) {
      const schema = change.schemaId ?? change.payload.schemaId ?? ''
      if (schema.startsWith('xnet://xnet.fyi/Channel@')) {
        const values = change.payload.properties?.members
        if (Array.isArray(values))
          for (const did of values) if (typeof did === 'string') members.add(did)
      } else if (schema.startsWith(MEMBERSHIP)) {
        const did = change.payload.properties?.member
        if (typeof did === 'string') members.add(did)
      }
      if (members.size > 2000) throw new Error('Community roster exceeds 2000 people.')
    }
  }
  const changes = [...space.changes]
  for (const did of members) {
    const member = await communityRecord(storage, spaceId, `spacemember:${spaceId}:${did}`)
    if (member?.properties.space === spaceId && member.properties.member === did)
      changes.push(...member.changes)
  }
  return changes.sort((a, b) => a.lamportTime - b.lamportTime)
}
