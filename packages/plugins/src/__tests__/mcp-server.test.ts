/**
 * Tests for MCPServer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPServer, createMCPServer, type MCPRequest } from '../services/mcp-server'
import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'

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

  return {
    get: vi.fn(async (id: string) => nodes.get(id) ?? null),
    list: vi.fn(async (options?: { schemaId?: string; limit?: number; offset?: number }) => {
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
    }),
    create: vi.fn(async (options: { schemaId: string; properties: Record<string, unknown> }) => {
      nodeIdCounter++
      const node: MockNode = {
        id: `node-${Date.now()}-${nodeIdCounter}`,
        schemaId: options.schemaId,
        properties: options.properties,
        deleted: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      nodes.set(node.id, node)
      return node
    }),
    update: vi.fn(async (id: string, options: { properties: Record<string, unknown> }) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      const updated: MockNode = {
        ...existing,
        properties: { ...existing.properties, ...options.properties },
        updatedAt: Date.now()
      }
      nodes.set(id, updated)
      return updated
    }),
    delete: vi.fn(async (id: string) => {
      const existing = nodes.get(id)
      if (!existing) throw new Error(`Node not found: ${id}`)
      existing.deleted = true
    }),
    subscribe: vi.fn(() => () => {})
  }
}

function createMockSchemas(): SchemaRegistryAPI {
  const schemas = new Map([
    [
      'xnet://xnet.dev/Task',
      {
        iri: 'xnet://xnet.dev/Task',
        name: 'Task',
        properties: { title: { type: 'text' }, done: { type: 'checkbox' } }
      }
    ],
    [
      'xnet://xnet.dev/Project',
      { iri: 'xnet://xnet.dev/Project', name: 'Project', properties: { name: { type: 'text' } } }
    ]
  ])

  return {
    getAllIRIs: vi.fn(() => Array.from(schemas.keys())),
    get: vi.fn(async (iri: string) => schemas.get(iri) ?? null)
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function createRequest(method: string, params?: Record<string, unknown>): MCPRequest {
  return {
    jsonrpc: '2.0',
    id: 1,
    method,
    params
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MCPServer', () => {
  let server: MCPServer
  let mockStore: NodeStoreAPI
  let mockSchemas: SchemaRegistryAPI

  beforeEach(() => {
    mockStore = createMockStore()
    mockSchemas = createMockSchemas()
    server = new MCPServer({
      store: mockStore,
      schemas: mockSchemas
    })
  })

  describe('server info', () => {
    it('returns server info', () => {
      const info = server.getServerInfo()
      expect(info.name).toBe('xnet')
      expect(info.version).toBe('1.0.0')
    })

    it('uses custom name and version', () => {
      const custom = new MCPServer({
        store: mockStore,
        schemas: mockSchemas,
        name: 'my-xnet',
        version: '2.0.0'
      })
      const info = custom.getServerInfo()
      expect(info.name).toBe('my-xnet')
      expect(info.version).toBe('2.0.0')
    })
  })

  describe('capabilities', () => {
    it('returns capabilities', () => {
      const caps = server.getCapabilities()
      expect(caps).toHaveProperty('tools')
      expect(caps).toHaveProperty('resources')
    })
  })

  describe('tools', () => {
    it('returns list of tools', () => {
      const tools = server.getTools()
      expect(tools.length).toBeGreaterThan(0)

      const toolNames = tools.map((t) => t.name)
      expect(toolNames).toContain('xnet_query')
      expect(toolNames).toContain('xnet_get')
      expect(toolNames).toContain('xnet_create')
      expect(toolNames).toContain('xnet_update')
      expect(toolNames).toContain('xnet_delete')
      expect(toolNames).toContain('xnet_schemas')
    })

    it('tools have proper schema', () => {
      const tools = server.getTools()
      for (const tool of tools) {
        expect(tool.name).toBeDefined()
        expect(tool.description).toBeDefined()
        expect(tool.inputSchema.type).toBe('object')
        expect(tool.inputSchema.properties).toBeDefined()
      }
    })
  })

  describe('resources', () => {
    it('returns list of resources', () => {
      const resources = server.getResources()
      expect(resources.length).toBeGreaterThan(0)

      const uris = resources.map((r) => r.uri)
      expect(uris).toContain('xnet://nodes')
      expect(uris).toContain('xnet://schemas')
    })
  })

  describe('handleRequest', () => {
    describe('initialize', () => {
      it('responds to initialize request', async () => {
        const response = await server.handleRequest(createRequest('initialize'))

        expect(response.result).toBeDefined()
        const result = response.result as { protocolVersion: string; serverInfo: { name: string } }
        expect(result.protocolVersion).toBe('2024-11-05')
        expect(result.serverInfo.name).toBe('xnet')
      })
    })

    describe('tools/list', () => {
      it('lists available tools', async () => {
        const response = await server.handleRequest(createRequest('tools/list'))

        expect(response.result).toBeDefined()
        const result = response.result as { tools: unknown[] }
        expect(result.tools.length).toBeGreaterThan(0)
      })
    })

    describe('tools/call - xnet_query', () => {
      it('queries nodes by schema', async () => {
        // Create some nodes first
        await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Task 1' }
        })
        await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Task 2' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_query',
            arguments: { schema: 'xnet://xnet.dev/Task' }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        expect(result.content).toHaveLength(1)
        expect(result.content[0].type).toBe('text')

        const data = JSON.parse(result.content[0].text)
        expect(data.nodes).toHaveLength(2)
      })
    })

    describe('tools/call - xnet_get', () => {
      it('gets a node by ID', async () => {
        const created = await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Test Task' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_get',
            arguments: { nodeId: created.id }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.id).toBe(created.id)
        expect(data.properties.title).toBe('Test Task')
      })

      it('returns error for non-existent node', async () => {
        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_get',
            arguments: { nodeId: 'non-existent' }
          })
        )

        expect(response.error).toBeDefined()
        expect(response.error?.message).toContain('not found')
      })
    })

    describe('tools/call - xnet_create', () => {
      it('creates a new node', async () => {
        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_create',
            arguments: {
              schema: 'xnet://xnet.dev/Task',
              properties: { title: 'New Task', done: false }
            }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.schemaId).toBe('xnet://xnet.dev/Task')
        expect(data.properties.title).toBe('New Task')
        expect(data.properties.done).toBe(false)
      })
    })

    describe('tools/call - xnet_update', () => {
      it('updates an existing node', async () => {
        const created = await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Original', done: false }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_update',
            arguments: {
              nodeId: created.id,
              properties: { done: true }
            }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.properties.title).toBe('Original')
        expect(data.properties.done).toBe(true)
      })

      it('returns error for non-existent node', async () => {
        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_update',
            arguments: {
              nodeId: 'non-existent',
              properties: { title: 'Updated' }
            }
          })
        )

        expect(response.error).toBeDefined()
        expect(response.error?.message).toContain('not found')
      })
    })

    describe('tools/call - xnet_delete', () => {
      it('deletes a node', async () => {
        const created = await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'To Delete' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_delete',
            arguments: { nodeId: created.id }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.success).toBe(true)
        expect(data.nodeId).toBe(created.id)
      })

      it('returns error for non-existent node', async () => {
        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_delete',
            arguments: { nodeId: 'non-existent' }
          })
        )

        expect(response.error).toBeDefined()
        expect(response.error?.message).toContain('not found')
      })
    })

    describe('tools/call - xnet_schemas', () => {
      it('lists all schemas', async () => {
        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_schemas',
            arguments: {}
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.schemas).toHaveLength(2)

        const names = data.schemas.map((s: { name: string }) => s.name)
        expect(names).toContain('Task')
        expect(names).toContain('Project')
      })
    })

    describe('tools/call - unknown tool', () => {
      it('returns error for unknown tool', async () => {
        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'unknown_tool',
            arguments: {}
          })
        )

        expect(response.error).toBeDefined()
        expect(response.error?.message).toContain('Unknown tool')
      })
    })

    describe('resources/list', () => {
      it('lists available resources', async () => {
        const response = await server.handleRequest(createRequest('resources/list'))

        expect(response.result).toBeDefined()
        const result = response.result as { resources: Array<{ uri: string }> }
        expect(result.resources.length).toBeGreaterThan(0)
      })
    })

    describe('resources/read', () => {
      it('reads xnet://nodes resource', async () => {
        await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Test' }
        })

        const response = await server.handleRequest(
          createRequest('resources/read', {
            uri: 'xnet://nodes'
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { contents: Array<{ uri: string; text: string }> }
        expect(result.contents).toHaveLength(1)
        expect(result.contents[0].uri).toBe('xnet://nodes')

        const data = JSON.parse(result.contents[0].text)
        expect(data.nodes).toBeDefined()
      })

      it('reads xnet://schemas resource', async () => {
        const response = await server.handleRequest(
          createRequest('resources/read', {
            uri: 'xnet://schemas'
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { contents: Array<{ uri: string; text: string }> }
        expect(result.contents[0].uri).toBe('xnet://schemas')

        const data = JSON.parse(result.contents[0].text)
        expect(data.schemas).toBeDefined()
      })

      it('returns error for unknown resource', async () => {
        const response = await server.handleRequest(
          createRequest('resources/read', {
            uri: 'xnet://unknown'
          })
        )

        expect(response.error).toBeDefined()
        expect(response.error?.message).toContain('not found')
      })
    })

    describe('unknown method', () => {
      it('returns error for unknown method', async () => {
        const response = await server.handleRequest(createRequest('unknown/method'))

        expect(response.error).toBeDefined()
        expect(response.error?.code).toBe(-32601)
        expect(response.error?.message).toContain('Method not found')
      })
    })
  })
})

describe('createMCPServer', () => {
  it('creates a server instance', () => {
    const server = createMCPServer({
      store: createMockStore(),
      schemas: createMockSchemas()
    })

    expect(server).toBeInstanceOf(MCPServer)
  })
})
