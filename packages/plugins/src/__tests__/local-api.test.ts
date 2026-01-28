/**
 * Tests for LocalAPIServer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  LocalAPIServer,
  createLocalAPI,
  type NodeStoreAPI,
  type SchemaRegistryAPI
} from '../services/local-api'

// ─── Mock Store ──────────────────────────────────────────────────────────────

type MockNode = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
}

let nodeIdCounter = 0

function createMockStore(): NodeStoreAPI {
  const nodes: Map<string, MockNode> = new Map()
  const listeners: Set<
    (event: { change: { type: string }; node: MockNode | null; isRemote: boolean }) => void
  > = new Set()

  return {
    get: async (id) => nodes.get(id) ?? null,
    list: async (options) => {
      let result = Array.from(nodes.values())
      if (options?.schemaId) {
        result = result.filter((n) => n.schemaId === options.schemaId)
      }
      if (options?.offset) {
        result = result.slice(options.offset)
      }
      if (options?.limit) {
        result = result.slice(0, options.limit)
      }
      return result
    },
    create: async (options) => {
      nodeIdCounter++
      const node = {
        id: `node-${Date.now()}-${nodeIdCounter}`,
        schemaId: options.schemaId,
        properties: options.properties,
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      nodes.set(node.id, node)
      for (const listener of listeners) {
        listener({ change: { type: 'node-change' }, node, isRemote: false })
      }
      return node
    },
    update: async (id, options) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const updated = {
        ...existing,
        properties: { ...existing.properties, ...options.properties },
        updatedAt: Date.now()
      }
      nodes.set(id, updated)
      return updated
    },
    delete: async (id) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      existing.deleted = true
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

function createMockSchemas(): SchemaRegistryAPI {
  const schemas = new Map([
    [
      'xnet://xnet.dev/Task',
      { iri: 'xnet://xnet.dev/Task', name: 'Task', properties: { title: { type: 'text' } } }
    ],
    [
      'xnet://xnet.dev/Project',
      { iri: 'xnet://xnet.dev/Project', name: 'Project', properties: { name: { type: 'text' } } }
    ]
  ])

  return {
    getAllIRIs: () => Array.from(schemas.keys()),
    get: async (iri) => schemas.get(iri) ?? null
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('LocalAPIServer', () => {
  let server: LocalAPIServer
  let mockStore: NodeStoreAPI
  let mockSchemas: SchemaRegistryAPI
  let baseUrl: string

  beforeEach(async () => {
    mockStore = createMockStore()
    mockSchemas = createMockSchemas()

    // Use a random port to avoid conflicts
    const port = 30000 + Math.floor(Math.random() * 1000)

    server = createLocalAPI({
      port,
      store: mockStore,
      schemas: mockSchemas
    })

    await server.start()
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await server.stop()
  })

  describe('health', () => {
    it('returns health status', async () => {
      const response = await fetch(`${baseUrl}/health`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('ok')
      expect(data.version).toBe('1.0.0')
      expect(typeof data.timestamp).toBe('number')
    })
  })

  describe('nodes', () => {
    it('creates a node', async () => {
      const response = await fetch(`${baseUrl}/api/v1/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'xnet://xnet.dev/Task',
          properties: { title: 'Test Task' }
        })
      })

      expect(response.status).toBe(201)
      const node = await response.json()
      expect(node.schemaId).toBe('xnet://xnet.dev/Task')
      expect(node.properties.title).toBe('Test Task')
    })

    it('lists nodes', async () => {
      // Create a node first
      await mockStore.create({
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'Task 1' }
      })

      const response = await fetch(`${baseUrl}/api/v1/nodes`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.nodes).toHaveLength(1)
      expect(data.nodes[0].properties.title).toBe('Task 1')
    })

    it('filters nodes by schema', async () => {
      await mockStore.create({ schemaId: 'xnet://xnet.dev/Task', properties: { title: 'Task' } })
      await mockStore.create({
        schemaId: 'xnet://xnet.dev/Project',
        properties: { name: 'Project' }
      })

      const response = await fetch(`${baseUrl}/api/v1/nodes?schema=xnet://xnet.dev/Task`)
      const data = await response.json()

      expect(data.nodes).toHaveLength(1)
      expect(data.nodes[0].schemaId).toBe('xnet://xnet.dev/Task')
    })

    it('gets a node by ID', async () => {
      const created = await mockStore.create({
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'Get Test' }
      })

      const response = await fetch(`${baseUrl}/api/v1/nodes/${created.id}`)
      expect(response.status).toBe(200)

      const node = await response.json()
      expect(node.id).toBe(created.id)
      expect(node.properties.title).toBe('Get Test')
    })

    it('returns 404 for non-existent node', async () => {
      const response = await fetch(`${baseUrl}/api/v1/nodes/non-existent`)
      expect(response.status).toBe(404)
    })

    it('updates a node', async () => {
      const created = await mockStore.create({
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'Original' }
      })

      const response = await fetch(`${baseUrl}/api/v1/nodes/${created.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Updated' })
      })

      expect(response.status).toBe(200)
      const node = await response.json()
      expect(node.properties.title).toBe('Updated')
    })

    it('deletes a node', async () => {
      const created = await mockStore.create({
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'To Delete' }
      })

      const response = await fetch(`${baseUrl}/api/v1/nodes/${created.id}`, {
        method: 'DELETE'
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('query', () => {
    it('queries nodes by schema', async () => {
      await mockStore.create({ schemaId: 'xnet://xnet.dev/Task', properties: { title: 'Task 1' } })
      await mockStore.create({ schemaId: 'xnet://xnet.dev/Task', properties: { title: 'Task 2' } })

      const response = await fetch(`${baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          schema: 'xnet://xnet.dev/Task',
          limit: 10
        })
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.nodes).toHaveLength(2)
    })

    it('requires schema field', async () => {
      const response = await fetch(`${baseUrl}/api/v1/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      })

      expect(response.status).toBe(400)
    })
  })

  describe('events', () => {
    it('returns events since timestamp', async () => {
      // Use timestamp from before create - subtract 1ms to ensure event is after
      const before = Date.now() - 1

      // Create a node to generate an event
      await mockStore.create({
        schemaId: 'xnet://xnet.dev/Task',
        properties: { title: 'Event Test' }
      })

      // Wait a bit for the event to be buffered
      await new Promise((r) => setTimeout(r, 50))

      const response = await fetch(`${baseUrl}/api/v1/events?since=${before}`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.events).toHaveLength(1)
      expect(data.events[0].type).toBe('updated')
      expect(typeof data.timestamp).toBe('number')
    })
  })

  describe('schemas', () => {
    it('lists all schemas', async () => {
      const response = await fetch(`${baseUrl}/api/v1/schemas`)
      expect(response.status).toBe(200)

      const data = await response.json()
      expect(data.schemas).toHaveLength(2)
    })

    it('gets a schema by IRI', async () => {
      const iri = encodeURIComponent('xnet://xnet.dev/Task')
      const response = await fetch(`${baseUrl}/api/v1/schemas/${iri}`)
      expect(response.status).toBe(200)

      const schema = await response.json()
      expect(schema.name).toBe('Task')
    })

    it('returns 404 for non-existent schema', async () => {
      const iri = encodeURIComponent('xnet://xnet.dev/NonExistent')
      const response = await fetch(`${baseUrl}/api/v1/schemas/${iri}`)
      expect(response.status).toBe(404)
    })
  })

  describe('authentication', () => {
    it('requires token when configured', async () => {
      await server.stop()

      const port = 30000 + Math.floor(Math.random() * 1000)
      const authServer = createLocalAPI({
        port,
        token: 'secret-token',
        store: mockStore,
        schemas: mockSchemas
      })

      await authServer.start()

      try {
        // Without token
        const noAuth = await fetch(`http://127.0.0.1:${port}/health`)
        expect(noAuth.status).toBe(401)

        // With wrong token
        const wrongAuth = await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: 'Bearer wrong-token' }
        })
        expect(wrongAuth.status).toBe(401)

        // With correct token
        const goodAuth = await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: 'Bearer secret-token' }
        })
        expect(goodAuth.status).toBe(200)
      } finally {
        await authServer.stop()
      }
    })
  })

  describe('CORS', () => {
    it('handles preflight requests', async () => {
      const response = await fetch(`${baseUrl}/api/v1/nodes`, {
        method: 'OPTIONS'
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-origin')).toBe('*')
      expect(response.headers.get('access-control-allow-methods')).toContain('GET')
    })
  })

  describe('error handling', () => {
    it('returns 404 for unknown routes', async () => {
      const response = await fetch(`${baseUrl}/api/v1/unknown`)
      expect(response.status).toBe(404)
    })

    it('handles invalid JSON body', async () => {
      const response = await fetch(`${baseUrl}/api/v1/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not valid json'
      })

      expect(response.status).toBe(500)
    })
  })
})

describe('createLocalAPI', () => {
  it('creates a server instance', () => {
    const server = createLocalAPI({
      store: createMockStore(),
      schemas: createMockSchemas()
    })

    expect(server).toBeInstanceOf(LocalAPIServer)
    expect(server.port).toBe(31415) // default port
    expect(server.isRunning).toBe(false)
  })
})
