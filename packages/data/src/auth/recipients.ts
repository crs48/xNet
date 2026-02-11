import type { SchemaIRI } from '../schema/node'
import type { Schema } from '../schema/types'
import type { NodeState } from '../store'
import type { DID, AuthExpression, RoleResolver } from '@xnet/core'
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
  grantIndex?: GrantIndexReader
  maxDepth?: number
}

export async function computeRecipients(
  schema: Schema,
  node: NodeState,
  dependencies: RecipientDependencies
): Promise<Recipient[]> {
  const recipients = new Set<Recipient>()
  recipients.add(node.createdBy)

  if (!schema.authorization) {
    return [...recipients]
  }

  const auth = deserializeAuthorization(schema.authorization)
  const readExpr = auth.actions.read

  if (!readExpr) {
    return [...recipients]
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

  const grants = dependencies.grantIndex?.findGrantsForResource(node.id) ?? []
  for (const grant of grants) {
    const actions = parseGrantActions(grant.properties.actions)
    if (actions.includes('read') || actions.includes('write')) {
      const grantee = grant.properties.grantee
      if (typeof grantee === 'string' && grantee.startsWith('did:key:')) {
        recipients.add(grantee as DID)
      }
    }
  }

  return [...recipients]
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
  }
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
