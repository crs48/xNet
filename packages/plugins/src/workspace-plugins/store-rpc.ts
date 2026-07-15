/**
 * Workspace-plugin store RPC (exploration 0331).
 *
 * The ONLY way sandboxed plugin code reaches workspace data: named, gated ops
 * served over the frame MessagePort. Three layers, denylist-wins:
 *
 *  1. DENYLIST — identity, plugin-source, and membership schemas are
 *     unreachable regardless of grants (Patchwork's denylist-wins lesson: a
 *     plugin must never rewrite its own source, mint grants, or touch the
 *     account ledger).
 *  2. Reads follow `permissions.schemas.read` (the labs host-bridge model —
 *     no grant, no read).
 *  3. Writes follow `permissions.schemas.write` via the same `guardStore`
 *     semantics the in-realm plugin context enforces (closed by default).
 */

import type { PluginPermissions } from '../types'
import { matchSchemaIri } from '../ecosystem/capability-guard'
import { PLUGIN_SOURCE_SCHEMA_IRI } from '../schemas/plugin-source'

/** Minimal async store surface the RPC drives (structural over NodeStore). */
export interface WorkspacePluginStore {
  list(query: {
    schemaId?: string
    limit?: number
    offset?: number
  }): Promise<Array<{ id: string; schemaId: string; properties: Record<string, unknown> }>>
  get(id: string): Promise<{
    id: string
    schemaId: string
    properties: Record<string, unknown>
  } | null>
  create(options: {
    schemaId: string
    properties: Record<string, unknown>
  }): Promise<{ id: string }>
  update(id: string, properties: Record<string, unknown>): Promise<unknown>
  delete(id: string): Promise<unknown>
}

/**
 * Schema IRI patterns no workspace plugin can read or write, regardless of
 * its grant. Deny always wins over any allow.
 */
export const PLUGIN_STORE_DENYLIST: readonly string[] = [
  PLUGIN_SOURCE_SCHEMA_IRI,
  'xnet://xnet.fyi/Plugin@*',
  'xnet://xnet.fyi/Grant@*',
  'xnet://xnet.fyi/Space@*',
  'xnet://xnet.fyi/SpaceMembership@*',
  'xnet://xnet.fyi/Profile@*',
  'xnet://xnet.fyi/AccountRecord@*',
  'xnet://xnet.fyi/DeviceRecord@*',
  'xnet://xnet.fyi/RecoveryRecord@*',
  'xnet://xnet.fyi/RevocationRecord@*'
]

/** True when `schemaId` is denylisted for workspace plugins. */
export function isDenylistedSchema(schemaId: string): boolean {
  return PLUGIN_STORE_DENYLIST.some((pattern) => matchSchemaIri(pattern, schemaId))
}

export class PluginStoreRpcError extends Error {
  constructor(
    message: string,
    public readonly op: string,
    public readonly schemaId?: string
  ) {
    super(message)
    this.name = 'PluginStoreRpcError'
  }
}

const DEFAULT_QUERY_LIMIT = 50
const MAX_QUERY_LIMIT = 500

function isReadAllowed(permissions: PluginPermissions | undefined, schemaId: string): boolean {
  const read = permissions?.schemas?.read
  if (!read) return false
  if (read === '*') return true
  return (read as readonly string[]).some((pattern) => matchSchemaIri(pattern, schemaId))
}

function isWriteAllowed(permissions: PluginPermissions | undefined, schemaId: string): boolean {
  const write = permissions?.schemas?.write
  if (!write) return false
  if (write === '*') return true
  return (write as readonly string[]).some((pattern) => matchSchemaIri(pattern, schemaId))
}

export interface PluginStoreRpc {
  /** Dispatch one frame store-call. Throws {@link PluginStoreRpcError} on denial. */
  call(op: string, args: Record<string, unknown>): Promise<unknown>
}

/**
 * Build the gated store RPC for one plugin. The frame gets `call`; the raw
 * store never crosses the boundary.
 */
export function createPluginStoreRpc(options: {
  store: WorkspacePluginStore
  permissions?: PluginPermissions
  pluginId: string
}): PluginStoreRpc {
  const { store, permissions, pluginId } = options

  const requireReadable = (schemaId: string, op: string): void => {
    if (isDenylistedSchema(schemaId)) {
      throw new PluginStoreRpcError(
        `Schema ${schemaId} is not accessible to workspace plugins`,
        op,
        schemaId
      )
    }
    if (!isReadAllowed(permissions, schemaId)) {
      throw new PluginStoreRpcError(
        `Plugin '${pluginId}' lacks read permission for ${schemaId}`,
        op,
        schemaId
      )
    }
  }

  const requireWritable = (schemaId: string, op: string): void => {
    if (isDenylistedSchema(schemaId)) {
      throw new PluginStoreRpcError(
        `Schema ${schemaId} is not accessible to workspace plugins`,
        op,
        schemaId
      )
    }
    if (!isWriteAllowed(permissions, schemaId)) {
      throw new PluginStoreRpcError(
        `Plugin '${pluginId}' lacks schemaWrite permission for ${schemaId}`,
        op,
        schemaId
      )
    }
  }

  const asSchemaId = (value: unknown, op: string): string => {
    if (typeof value !== 'string' || !value) {
      throw new PluginStoreRpcError('schemaId must be a non-empty string', op)
    }
    return value
  }

  const asNodeId = (value: unknown, op: string): string => {
    if (typeof value !== 'string' || !value) {
      throw new PluginStoreRpcError('id must be a non-empty string', op)
    }
    return value
  }

  /** Resolve an existing node and assert the plugin may write its schema. */
  const requireWritableNode = async (id: string, op: string) => {
    const node = await store.get(id)
    if (!node) throw new PluginStoreRpcError(`Node not found: ${id}`, op)
    requireWritable(node.schemaId, op)
    return node
  }

  return {
    async call(op, args) {
      switch (op) {
        case 'query': {
          const schemaId = asSchemaId(args.schemaId ?? args.schema, op)
          requireReadable(schemaId, op)
          const rawLimit = typeof args.limit === 'number' ? args.limit : DEFAULT_QUERY_LIMIT
          const limit = Math.max(1, Math.min(MAX_QUERY_LIMIT, rawLimit))
          const offset = typeof args.offset === 'number' && args.offset > 0 ? args.offset : 0
          const nodes = await store.list({ schemaId, limit, offset })
          return nodes.map((n) => ({ id: n.id, schemaId: n.schemaId, properties: n.properties }))
        }
        case 'get': {
          const id = asNodeId(args.id, op)
          const node = await store.get(id)
          if (!node) return null
          requireReadable(node.schemaId, op)
          return { id: node.id, schemaId: node.schemaId, properties: node.properties }
        }
        case 'create': {
          const schemaId = asSchemaId(args.schemaId, op)
          requireWritable(schemaId, op)
          const properties =
            args.properties && typeof args.properties === 'object'
              ? (args.properties as Record<string, unknown>)
              : {}
          return store.create({ schemaId, properties })
        }
        case 'update': {
          const id = asNodeId(args.id, op)
          await requireWritableNode(id, op)
          const properties =
            args.properties && typeof args.properties === 'object'
              ? (args.properties as Record<string, unknown>)
              : {}
          await store.update(id, properties)
          return { ok: true }
        }
        case 'delete': {
          const id = asNodeId(args.id, op)
          await requireWritableNode(id, op)
          await store.delete(id)
          return { ok: true }
        }
        default:
          throw new PluginStoreRpcError(`Unknown store op: ${op}`, op)
      }
    }
  }
}
