/**
 * Lab host bridge — the permission-gated capability surface exposed to Lab
 * code as the `xnet` global (exploration 0180).
 *
 * This mirrors the MCP server tool surface (`xnet_query` / `xnet_get`) so an
 * agent that already knows how to drive xNet over MCP can drive a Lab the same
 * way. Crucially, the bridge enforces `PluginPermissions.schemas.read` BEFORE
 * touching the store: a Lab can only read schemas its (host-assigned) grant
 * allows. Nothing here is ambient — code that wants data must call a named tool.
 */

import type { LabHostBridge, LabHostTool } from './runtime/types'
import type { PluginPermissions } from '@xnetjs/plugins'

/** The minimal read surface a Lab host bridge needs. Async by design. */
export interface LabStore {
  list(query: { schemaId?: string; limit?: number; offset?: number }): Promise<
    Array<{ id: string; schemaId: string; properties: Record<string, unknown> }>
  >
  get(id: string): Promise<{
    id: string
    schemaId: string
    properties: Record<string, unknown>
  } | null>
}

const DEFAULT_QUERY_LIMIT = 50
const MAX_QUERY_LIMIT = 500

/** Is `schemaId` covered by a `read` grant (`'*'` or an explicit list)? */
export function isSchemaReadable(
  permissions: PluginPermissions | undefined,
  schemaId: string
): boolean {
  const read = permissions?.schemas?.read
  if (!read) return false
  if (read === '*') return true
  // `read` is typed as the SchemaIRI template-literal; compare as plain strings.
  return (read as readonly string[]).includes(schemaId)
}

export class LabPermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LabPermissionError'
  }
}

/**
 * Build the host bridge. The tools close over `store` + `permissions`; a Lab
 * never sees the raw store, only the gated tools.
 */
export function createLabHostBridge(options: {
  store: LabStore
  permissions?: PluginPermissions
}): LabHostBridge {
  const { store, permissions } = options

  const requireRead = (schemaId: unknown): string => {
    if (typeof schemaId !== 'string' || !schemaId) {
      throw new LabPermissionError('schema must be a non-empty string')
    }
    if (!isSchemaReadable(permissions, schemaId)) {
      throw new LabPermissionError(`Lab is not permitted to read ${schemaId}`)
    }
    return schemaId
  }

  const tools: LabHostTool[] = [
    {
      name: 'query',
      description:
        'Query nodes by schema IRI. Returns matching nodes with their properties. ' +
        'Honors the Lab read-permission grant.',
      invoke: async (args) => {
        const schemaId = requireRead(args.schema)
        const rawLimit = typeof args.limit === 'number' ? args.limit : DEFAULT_QUERY_LIMIT
        const limit = Math.max(1, Math.min(MAX_QUERY_LIMIT, rawLimit))
        const offset = typeof args.offset === 'number' && args.offset > 0 ? args.offset : 0
        const nodes = await store.list({ schemaId, limit, offset })
        return nodes.map((node) => ({ id: node.id, properties: node.properties }))
      }
    },
    {
      name: 'get',
      description: 'Get a single node by id. Returns null if it is not readable or absent.',
      invoke: async (args) => {
        const id = args.id
        if (typeof id !== 'string' || !id) {
          throw new LabPermissionError('id must be a non-empty string')
        }
        const node = await store.get(id)
        if (!node) return null
        // Re-check read permission against the resolved node's schema.
        if (!isSchemaReadable(permissions, node.schemaId)) {
          throw new LabPermissionError(`Lab is not permitted to read ${node.schemaId}`)
        }
        return { id: node.id, schemaId: node.schemaId, properties: node.properties }
      }
    }
  ]

  const byName = new Map(tools.map((tool) => [tool.name, tool]))

  return {
    tools,
    get: (name) => byName.get(name)
  }
}

/**
 * Materialize a host bridge into a plain object of bound async functions —
 * the value injected into a runtime as the `xnet` global.
 */
export function bridgeToGlobal(bridge: LabHostBridge): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const api: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
  for (const tool of bridge.tools) {
    api[tool.name] = async (args: Record<string, unknown>) => tool.invoke(args ?? {})
  }
  return api
}
