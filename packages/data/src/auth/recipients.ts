import type { SchemaIRI } from '../schema/node'
import type { Schema } from '../schema/types'
import type { NodeState } from '../store'
import type { DID, AuthExpression, RoleResolver } from '@xnetjs/core'
import { deserializeAuthorization } from './serialize'
import { extractRoleRefs, hasPublicAccess } from './validate'

export const PUBLIC_CONTENT_KEY = new Uint8Array(32)
export const PUBLIC_RECIPIENT = 'PUBLIC'

export type Recipient = DID | typeof PUBLIC_RECIPIENT

export interface GrantRecordLike {
  id: string
  properties: Record<string, unknown>
}

export interface GrantIndexReader {
  findGrantsForResource(resourceId: string): GrantRecordLike[]
}

export interface RecipientDependencies {
  getNode: (nodeId: string) => Promise<NodeState | null>
  getSchema?: (schemaId: SchemaIRI) => Promise<Schema | undefined>
  /** Lists all nodes of a schema — required to expand membership-edge roles. */
  listNodes?: (schemaId: string) => Promise<NodeState[]>
  grantIndex?: GrantIndexReader
  maxDepth?: number
  /**
   * Account/device re-wrap (exploration 0243, P2.3). When set, each DID recipient is
   * expanded to every active device of the account it belongs to, so a user's content
   * is decryptable on all their devices. Build it with `deviceRecipientExpander` from
   * the ledger records. Omitted → recipients are exactly the resolved DIDs (no change).
   */
  expandDeviceRecipients?: (did: DID) => readonly string[]
}

const MAX_CONTAINER_DEPTH = 32

/** Expand DID recipients to the account's active devices when a re-wrap fn is supplied. */
function finalizeRecipients(
  recipients: Set<Recipient>,
  dependencies: RecipientDependencies
): Recipient[] {
  const expand = dependencies.expandDeviceRecipients
  if (!expand) return [...recipients]
  const out = new Set<Recipient>(recipients)
  for (const recipient of recipients) {
    if (recipient === PUBLIC_RECIPIENT) continue
    // The ledger stores device DIDs as `did:key:` strings; safe to treat as DID.
    for (const did of expand(recipient)) out.add(did as DID)
  }
  return [...out]
}

export async function computeRecipients(
  schema: Schema,
  node: NodeState,
  dependencies: RecipientDependencies
): Promise<Recipient[]> {
  const recipients = new Set<Recipient>()
  recipients.add(node.createdBy)

  // Grant-index recipients apply regardless of whether the schema declares
  // roles: a node shared purely via a hub/share grant must still reach its
  // grantees, including legacy (authorization-less) schemas. Folding this in
  // for every path fixes the owner-only lockout (exploration 0192, Landmine #3).
  const addGrantRecipients = () => {
    const grants = dependencies.grantIndex?.findGrantsForResource(node.id) ?? []
    for (const grant of grants) {
      const actions = parseGrantActions(grant.properties.actions)
      // An update grantee must decrypt the node to mutate it; a create-only
      // grant confers no access to this existing node's content (0304).
      if (actions.includes('read') || actions.includes('write') || actions.includes('update')) {
        const grantee = grant.properties.grantee
        if (typeof grantee === 'string' && grantee.startsWith('did:key:')) {
          recipients.add(grantee as DID)
        }
      }
    }
  }

  if (!schema.authorization) {
    addGrantRecipients()
    return finalizeRecipients(recipients, dependencies)
  }

  const auth = deserializeAuthorization(schema.authorization)
  const readExpr = auth.actions.read

  if (!readExpr) {
    addGrantRecipients()
    return finalizeRecipients(recipients, dependencies)
  }

  if (hasPublicAccess(readExpr)) {
    return [PUBLIC_RECIPIENT]
  }

  const readRoles = extractRoleRefs(readExpr)
  for (const roleName of readRoles) {
    const resolver = auth.roles[roleName]
    if (!resolver) continue

    const members = await resolveRoleMembers(resolver, node, schema, dependencies, 0)
    for (const did of members) {
      recipients.add(did)
    }
  }

  addGrantRecipients()

  return finalizeRecipients(recipients, dependencies)
}

async function resolveRoleMembers(
  resolver: RoleResolver,
  node: NodeState,
  _schema: Schema,
  dependencies: RecipientDependencies,
  depth: number
): Promise<DID[]> {
  if (depth > (dependencies.maxDepth ?? 3)) {
    return []
  }

  switch (resolver._tag) {
    case 'creator':
      return [node.createdBy]
    case 'property':
      return readDidProperty(node.properties[resolver.propertyName])
    case 'relation': {
      const targetId = node.properties[resolver.relationName]
      if (typeof targetId !== 'string') {
        return []
      }

      const targetNode = await dependencies.getNode(targetId)
      if (!targetNode || !dependencies.getSchema) {
        return []
      }

      const targetSchema = await dependencies.getSchema(targetNode.schemaId)
      if (!targetSchema?.authorization) {
        return []
      }

      const targetAuth = deserializeAuthorization(targetSchema.authorization)
      const targetResolver = targetAuth.roles[resolver.targetRole]
      if (!targetResolver) {
        return []
      }

      return resolveRoleMembers(targetResolver, targetNode, targetSchema, dependencies, depth + 1)
    }
    case 'membership': {
      if (!dependencies.listNodes) {
        return []
      }
      const containerIds = await collectContainerIds(node, resolver.parentProp, dependencies)
      const edges = await dependencies.listNodes(resolver.edgeSchema)
      const members = new Set<DID>()
      for (const edge of edges) {
        if (edge.deleted) continue
        const container = edge.properties[resolver.containerProp]
        if (typeof container !== 'string' || !containerIds.has(container)) continue
        const edgeRole = edge.properties[resolver.roleProp]
        if (typeof edgeRole !== 'string') continue
        const have = resolver.roleOrder.indexOf(edgeRole)
        const need = resolver.roleOrder.indexOf(resolver.minRole)
        if (have < 0 || need < 0 || have < need) continue
        for (const did of readDidProperty(edge.properties[resolver.memberProp])) {
          members.add(did)
        }
      }
      return [...members]
    }
  }
}

async function collectContainerIds(
  node: NodeState,
  parentProp: string | undefined,
  dependencies: RecipientDependencies
): Promise<Set<string>> {
  const ids = new Set<string>([node.id])
  if (!parentProp) {
    return ids
  }

  let current: NodeState | null = node
  let depth = 0
  while (current && depth < MAX_CONTAINER_DEPTH) {
    const parentId = current.properties[parentProp]
    if (typeof parentId !== 'string' || ids.has(parentId)) {
      break
    }
    ids.add(parentId)
    current = await dependencies.getNode(parentId)
    depth += 1
  }
  return ids
}

function readDidProperty(value: unknown): DID[] {
  if (Array.isArray(value)) {
    return value.filter(isDid)
  }

  if (isDid(value)) {
    return [value]
  }

  return []
}

function isDid(value: unknown): value is DID {
  return typeof value === 'string' && value.startsWith('did:key:')
}

function parseGrantActions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }

  if (typeof value !== 'string') {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

export function hasRecipientsChanged(previous: Recipient[], next: Recipient[]): boolean {
  if (previous.length !== next.length) {
    return true
  }

  const nextSet = new Set(next)
  return previous.some((recipient) => !nextSet.has(recipient))
}

export function canTransitionToPublic(readExpr: AuthExpression | undefined): boolean {
  if (!readExpr) {
    return false
  }

  return hasPublicAccess(readExpr)
}
