/**
 * In-memory NodeStore/SchemaRegistry backend.
 *
 * Shared by tests, the agent-surface benchmark, and CLI fixtures so each
 * consumer does not re-implement the same mock store.
 */

import type { NodeData, NodeStoreAPI, SchemaData, SchemaRegistryAPI } from '../services/local-api'

export type MemoryNodeStore = NodeStoreAPI & {
  /** Test helper: update properties and bump updatedAt without going through update(). */
  setNode(id: string, properties: Record<string, unknown>): void
}

export function createMemoryNodeStore(initialNodes: NodeData[]): MemoryNodeStore {
  const nodes = new Map(initialNodes.map((node) => [node.id, node]))
  let counter = 0

  return {
    get: async (id) => nodes.get(id) ?? null,
    list: async (options) => {
      let result = Array.from(nodes.values())
      if (options?.schemaId) {
        result = result.filter((node) => node.schemaId === options.schemaId)
      }
      if (options?.offset) result = result.slice(options.offset)
      if (options?.limit) result = result.slice(0, options.limit)
      return result
    },
    create: async (options) => {
      counter += 1
      const id = options.id ?? `node-${nodes.size + 1}-${counter}`
      const existing = nodes.get(id)
      const node: NodeData = {
        id,
        schemaId: options.schemaId,
        // Deterministic-id retries LWW-upsert like the real store.
        properties: existing
          ? { ...existing.properties, ...options.properties }
          : options.properties,
        deleted: false,
        createdAt: existing?.createdAt ?? 1,
        updatedAt: 1000 + counter
      }
      nodes.set(node.id, node)
      return node
    },
    update: async (id, options) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const node = {
        ...existing,
        properties: { ...existing.properties, ...options.properties },
        updatedAt: existing.updatedAt + 1
      }
      nodes.set(id, node)
      return node
    },
    delete: async (id) => {
      const existing = nodes.get(id)
      if (existing) existing.deleted = true
    },
    subscribe: () => () => {},
    setNode: (id, properties) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      nodes.set(id, {
        ...existing,
        properties: { ...existing.properties, ...properties },
        updatedAt: existing.updatedAt + 1
      })
    }
  }
}

export function createMemorySchemaRegistry(schemas: SchemaData[]): SchemaRegistryAPI {
  const byIri = new Map(schemas.map((schema) => [schema.iri, schema]))
  return {
    getAllIRIs: () => Array.from(byIri.keys()),
    get: async (iri) => byIri.get(iri) ?? null
  }
}

/** The Page/Database/Canvas schema set most agent-surface fixtures use. */
export function createWorkspaceFixtureSchemas(): SchemaRegistryAPI {
  return createMemorySchemaRegistry([
    {
      iri: 'xnet://xnet.fyi/Page@1.0.0',
      name: 'Page',
      properties: { title: { type: 'text' } }
    },
    {
      iri: 'xnet://xnet.fyi/Database@1.0.0',
      name: 'Database',
      properties: { title: { type: 'text' } }
    },
    {
      iri: 'xnet://xnet.fyi/Canvas@1.0.0',
      name: 'Canvas',
      properties: { title: { type: 'text' } }
    },
    {
      iri: 'xnet://xnet.fyi/db/projects@1.0.0',
      name: 'Project Row',
      properties: {
        title: { type: 'text' },
        databaseId: { type: 'text' },
        status: { type: 'text' },
        owner: { type: 'text' }
      }
    }
  ])
}
