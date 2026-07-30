/**
 * Local, agent-signed backend for `xnet mcp serve --agent <name> --db <path>`
 * (exploration 0337).
 *
 * Builds a framework-agnostic runtime client whose signing identity IS the
 * enrolled agent's DID, then adapts its NodeStore to the `NodeStoreAPI` the
 * AI surface expects. Every write the MCP server performs lands in the kernel
 * change log signed by the agent key — the tamper-evident half of the audit
 * trail. Contrast with the remote-API backend, where writes are signed by the
 * app's own identity.
 */

import type { DID } from '@xnetjs/core'
import type { NodeStorageAdapter, SchemaIRI } from '@xnetjs/data'
import type { NodeData, NodeStoreAPI, SchemaData, SchemaRegistryAPI } from '@xnetjs/plugins/node'
import type { AgentBackend } from './agent-remote.js'
import { getSigningPublicKeyFromPrivate } from '@xnetjs/crypto'
import { SQLiteNodeStorageAdapter, builtInSchemas } from '@xnetjs/data'
import { createDID } from '@xnetjs/identity'
import { createXNetClient, type XNetClient } from '@xnetjs/runtime'

export type LocalAgentBackendOptions = {
  /** SQLite file path; in-memory (ephemeral) when omitted. */
  db?: string
  /** The agent's Ed25519 private key. */
  agentKey: Uint8Array
}

export type LocalAgentBackend = AgentBackend & {
  client: XNetClient
  agentDID: string
}

const toNodeData = (node: {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted?: boolean
  createdAt?: number
  updatedAt?: number
}): NodeData => ({
  id: node.id,
  schemaId: node.schemaId,
  properties: node.properties,
  deleted: node.deleted ?? false,
  createdAt: node.createdAt ?? 0,
  updatedAt: node.updatedAt ?? 0
})

async function resolveStorage(db?: string): Promise<NodeStorageAdapter> {
  if (db) {
    const { createElectronSQLiteAdapter } = await import('@xnetjs/sqlite/electron')
    const adapter = await createElectronSQLiteAdapter({
      path: db,
      busyTimeout: 5000,
      foreignKeys: true,
      walMode: true
    })
    return new SQLiteNodeStorageAdapter(adapter)
  }
  const { createMemorySQLiteAdapter } = await import('@xnetjs/sqlite/memory')
  const adapter = await createMemorySQLiteAdapter()
  return new SQLiteNodeStorageAdapter(adapter)
}

function builtInSchemaRegistry(): SchemaRegistryAPI {
  const iris = Object.keys(builtInSchemas).filter((iri) => iri.includes('@'))
  return {
    getAllIRIs: () => iris,
    get: async (iri: string): Promise<SchemaData | null> => {
      const loader = (builtInSchemas as Record<string, () => Promise<unknown>>)[iri]
      if (!loader) return null
      const schema = (await loader()) as {
        schema: { '@id': string; name: string; properties: unknown }
      }
      return {
        iri,
        name: schema.schema.name,
        properties: schema.schema.properties as Record<string, unknown>
      }
    }
  }
}

export async function createLocalAgentBackend(
  options: LocalAgentBackendOptions
): Promise<LocalAgentBackend> {
  const agentDID = createDID(getSigningPublicKeyFromPrivate(options.agentKey)) as DID
  const nodeStorage = await resolveStorage(options.db)
  const client = await createXNetClient({
    nodeStorage,
    authorDID: agentDID,
    signingKey: options.agentKey
  })

  const store: NodeStoreAPI = {
    get: async (id) => {
      const node = await client.store.get(id)
      return node ? toNodeData(node) : null
    },
    list: async (opts) => {
      const nodes = await client.store.list({
        ...(opts?.schemaId ? { schemaId: opts.schemaId as SchemaIRI } : {}),
        ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
        ...(opts?.offset !== undefined ? { offset: opts.offset } : {})
      })
      return nodes.map(toNodeData)
    },
    create: async (opts) => {
      const node = await client.store.create({
        ...(opts.id ? { id: opts.id } : {}),
        schemaId: opts.schemaId as SchemaIRI,
        properties: opts.properties
      })
      return toNodeData(node)
    },
    update: async (id, opts) => {
      const node = await client.store.update(id, { properties: opts.properties })
      return toNodeData(node)
    },
    delete: async (id) => {
      await client.store.delete(id)
    },
    subscribe: (listener) =>
      client.store.subscribe((event: { change: { type: string } }) => {
        listener({ change: { type: event.change.type }, node: null, isRemote: false })
      })
  }

  return { store, schemas: builtInSchemaRegistry(), client, agentDID }
}
