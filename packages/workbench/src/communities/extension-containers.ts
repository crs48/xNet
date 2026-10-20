import type { ExtensionGrant } from './extension-data'
import type { NodeState } from '@xnetjs/data'
import type { DataBridge } from '@xnetjs/data-bridge'
import {
  FolderSchema,
  SpaceSchema,
  SpaceMembershipSchema,
  spaceMembershipId,
  isSpaceRole
} from '@xnetjs/data'
import { snapshotKey } from '@xnetjs/data/store'
import { ExtensionAccessError } from './extension-protocol'
import { readPage } from './extension-read-page'

export type ExtensionContainer = { kind: 'folder' | 'space'; id: string; descendants: boolean }
const fail = (message: string): never => {
  throw new ExtensionAccessError('denied', message)
}

/** Fresh, bounded evidence. No cached membership decision is used as write authority. */
export async function resolveExtensionContainers(
  bridge: DataBridge,
  grant: ExtensionGrant,
  signal: AbortSignal
) {
  const guards = new Map<string, NodeState | null>()
  const folders = new Set<string>(),
    spaces = new Set<string>()
  const deadline = Date.now() + 5000
  let expiresAt = Infinity
  const get = async (id: string) => {
    if (signal.aborted) throw new ExtensionAccessError('cancelled', 'Container access stopped.')
    if (!bridge.get)
      throw new ExtensionAccessError('unsupported', 'Container access is unavailable.')
    if (guards.has(id)) return guards.get(id)!
    if (guards.size >= 180)
      throw new ExtensionAccessError('quota', 'The container permission graph is too large.')
    const node = await bridge.get(id)
    guards.set(id, node)
    return node
  }
  const chain = async (id: string, kind: 'folder' | 'space') => {
    const result: NodeState[] = [],
      seen = new Set<string>()
    while (id) {
      if (seen.has(id) || seen.size >= 32) fail('Container ancestry is cyclic or too deep.')
      seen.add(id)
      const node = await get(id)
      if (
        !node ||
        node.deleted ||
        node.schemaId !== (kind === 'folder' ? FolderSchema : SpaceSchema)._schemaId
      )
        fail('A container is no longer available.')
      result.push(node!)
      const parent = node!.properties.parent
      if (parent != null && typeof parent !== 'string') fail('Invalid container ancestry.')
      id = typeof parent === 'string' ? parent : ''
    }
    return result
  }
  const membership = async (nodes: NodeState[]) => {
    let allowed = false
    for (const space of nodes) {
      const edge = await get(spaceMembershipId(space.id, grant.owner))
      if (!edge || edge.deleted) continue
      const expiry = edge.properties.expiresAt
      if (expiry != null && (typeof expiry !== 'number' || !Number.isFinite(expiry)))
        fail('Invalid membership expiry.')
      if (typeof expiry === 'number' && expiry > 0 && expiry <= Date.now()) continue
      // Owner-issued edges are a conservative subset of the core space cascade.
      const issuers = [
        space.createdBy,
        ...(Array.isArray(space.properties.owners) ? space.properties.owners : [])
      ]
      if (
        edge.schemaId !== SpaceMembershipSchema._schemaId ||
        edge.properties.space !== space.id ||
        edge.properties.member !== grant.owner ||
        !isSpaceRole(edge.properties.role) ||
        !issuers.includes(edge.createdBy)
      )
        continue
      allowed = true
      if (typeof expiry === 'number' && expiry > 0) expiresAt = Math.min(expiresAt, expiry)
    }
    return allowed
  }
  const canRead = async (node: NodeState) => {
    if (node.deleted) return false
    if (node.createdBy === grant.owner) return true
    if (typeof node.properties.space !== 'string' || node.properties.visibility === 'private')
      return false
    return membership(await chain(node.properties.space, 'space'))
  }
  for (const selection of grant.containers ?? []) {
    const schema = selection.kind === 'folder' ? FolderSchema : SpaceSchema
    const queue = [selection.id],
      visited = new Set<string>()
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) fail('Container ancestry contains a cycle.')
      visited.add(id)
      if (folders.size + spaces.size >= 100)
        throw new ExtensionAccessError('quota', 'Select at most one hundred nested containers.')
      const ancestors = await chain(id, selection.kind)
      const node = ancestors[0]
      if (!ancestors.some((ancestor) => ancestor.id === selection.id))
        throw new ExtensionAccessError(
          'conflict',
          'A nested container moved outside the approved root.'
        )
      if (selection.kind === 'folder') {
        if (
          ancestors.some(
            (item) =>
              item.createdBy !== grant.owner ||
              item.properties.space ||
              item.properties.visibility === 'public' ||
              item.properties.visibility === 'unlisted'
          )
        )
          fail('Folder access requires your private folder ancestry.')
        folders.add(id)
      } else {
        const member = await membership(ancestors)
        if (node.createdBy !== grant.owner && !member)
          fail('Space membership is unavailable or expired.')
        spaces.add(id)
      }
      if (selection.descendants) {
        const children = await readPage(
          bridge,
          schema,
          { where: { parent: id }, limit: 101, source: 'local' },
          signal
        )
        if (children.length > 100)
          throw new ExtensionAccessError('quota', 'This container has too many child containers.')
        for (const child of children) {
          if (child.schemaId !== schema._schemaId || child.properties.parent !== id)
            fail('A container query escaped its scope.')
          if (!child.deleted) queue.push(child.id)
        }
      }
    }
  }
  return {
    folders,
    spaces,
    guards,
    canRead,
    deadline: () => Math.min(deadline, expiresAt),
    expiresAt: () => expiresAt,
    fingerprint: () => snapshotKey([...guards].sort(([a], [b]) => a.localeCompare(b))),
    contains: (node: NodeState) =>
      folders.has(String(node.properties.folder)) || spaces.has(String(node.properties.space)),
    assertActive() {
      if (signal.aborted || Date.now() >= Math.min(deadline, expiresAt))
        throw new ExtensionAccessError('revoked', 'Container permission expired.')
    },
    async verify() {
      if (signal.aborted || Date.now() >= Math.min(deadline, expiresAt))
        throw new ExtensionAccessError('revoked', 'Container permission expired.')
      for (const [id, expected] of guards)
        if (snapshotKey(await bridge.get!(id)) !== snapshotKey(expected))
          throw new ExtensionAccessError(
            'conflict',
            'Container membership or ancestry changed. Reload the view.'
          )
    }
  }
}

/** Only private destinations can receive data learned from other approved sources. */
export async function privateExtensionDestination(
  bridge: DataBridge,
  grant: ExtensionGrant,
  node: NodeState,
  signal: AbortSignal
) {
  if (
    node.createdBy !== grant.owner ||
    node.properties.space ||
    node.properties.project ||
    node.properties.page ||
    node.properties.canvas ||
    node.properties.parent ||
    node.properties.publication ||
    node.properties.publishedAt ||
    (node.properties.visibility &&
      !['inherit', 'private'].includes(String(node.properties.visibility)))
  )
    fail('Edits require your private records, without a shared or published destination.')
  const scope = await resolveExtensionContainers(bridge, grant, signal)
  if (node.properties.folder && !scope.folders.has(String(node.properties.folder)))
    fail('Approve the private folder containing this record before editing.')
  return scope
}
