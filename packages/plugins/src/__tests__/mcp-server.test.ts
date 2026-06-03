/**
 * Tests for MCPServer
 */

import type { NodeStoreAPI, SchemaRegistryAPI } from '../services/local-api'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MCPServer, createMCPServer, type MCPRequest } from '../services/mcp-server'

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
      expect(toolNames).toContain('xnet_search')
      expect(toolNames).toContain('xnet_create_context_pack')
      expect(toolNames).toContain('xnet_validate_page_markdown')
      expect(toolNames).toContain('xnet_plan_page_patch')
      expect(toolNames).toContain('xnet_apply_page_markdown')
      expect(toolNames).toContain('xnet_get_audit_log')
      expect(toolNames).toContain('xnet_rollback_page_markdown')
      expect(toolNames).toContain('xnet_database_describe')
      expect(toolNames).toContain('xnet_database_sample')
      expect(toolNames).toContain('xnet_database_explain_query')
      expect(toolNames).toContain('xnet_canvas_list')
      expect(toolNames).toContain('xnet_canvas_read_selection')
      expect(toolNames).toContain('xnet_canvas_search')
      expect(toolNames).toContain('xnet_canvas_export_json_canvas')
      expect(toolNames).toContain('xnet_canvas_plan_json_canvas_import')
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
      expect(uris).toContain('xnet://workspace/summary')
      expect(uris).toContain('xnet://page/{pageId}.md')
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

    describe('tools/call - AI surface tools', () => {
      it('searches workspace nodes', async () => {
        await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Roadmap task', notes: 'AI integration' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_search',
            arguments: { query: 'roadmap' }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.results).toHaveLength(1)
        expect(data.results[0].title).toBe('Roadmap task')
      })

      it('creates a context pack from page seeds', async () => {
        const page = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'AI Plan', markdown: '## Goals\nShip MCP integration.' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_create_context_pack',
            arguments: { seeds: [{ kind: 'page', id: page.id }] }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.resources).toHaveLength(1)
        expect(data.resources[0].uri).toContain('xnet://page/')
        expect(data.resources[0].text).toContain('Ship MCP integration')
      })

      it('plans page Markdown patches without applying them', async () => {
        const page = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Draft', markdown: 'Original' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_plan_page_patch',
            arguments: {
              pageId: page.id,
              baseRevision: `updatedAt:${page.updatedAt}`,
              markdown: '# Draft\n\nUpdated'
            }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.status).toBe('validated')
        expect(data.validation.valid).toBe(true)
        expect(data.changes[0].operations[0].op).toBe('replaceMarkdown')
        expect(data.changes[0].operations[0].args.directiveCount).toBe(0)
        expect(data.changes[0].operations[0].args.diff).toContain('+Updated')

        const unchanged = await mockStore.get(page.id)
        expect(unchanged?.properties.markdown).toBe('Original')
      })

      it('returns invalid page patch plans for malformed xNet directives', async () => {
        const page = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Draft', markdown: 'Original' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_plan_page_patch',
            arguments: {
              pageId: page.id,
              markdown: ['# Draft', '', ':::xnet-database', '{"databaseId":', ':::'].join('\n')
            }
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { content: Array<{ type: string; text: string }> }
        const data = JSON.parse(result.content[0].text)
        expect(data.status).toBe('proposed')
        expect(data.validation.valid).toBe(false)
        expect(data.validation.errors).toContain(
          'xnet-database block directive payload must be valid JSON'
        )
      })

      it('queries, samples, and explains database rows with descriptors', async () => {
        const database = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Database@1.0.0',
          properties: {
            title: 'Projects',
            rowSchemaId: 'xnet://xnet.fyi/ProjectRow@1.0.0',
            columns: [{ id: 'title', name: 'Title', type: 'text' }],
            views: [{ id: 'view-table', name: 'Table', type: 'table' }]
          }
        })
        await mockStore.create({
          schemaId: 'xnet://xnet.fyi/ProjectRow@1.0.0',
          properties: { database: database.id, title: 'Alpha Launch', status: 'active' }
        })
        await mockStore.create({
          schemaId: 'xnet://xnet.fyi/ProjectRow@1.0.0',
          properties: { database: database.id, title: 'Beta Cleanup', status: 'later' }
        })

        const describeResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_database_describe',
            arguments: { databaseId: database.id, includeSample: true }
          })
        )
        const describeResult = describeResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const description = JSON.parse(describeResult.content[0].text)
        expect(description.columns).toHaveLength(1)
        expect(description.sample.rows).toHaveLength(2)

        const queryResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_database_query',
            arguments: {
              databaseId: database.id,
              descriptor: {
                search: { text: 'alpha' },
                orderBy: { title: 'asc' },
                materializedView: { viewId: 'view-table' }
              },
              count: 'exact',
              limit: 10
            }
          })
        )
        const queryResult = queryResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const query = JSON.parse(queryResult.content[0].text)
        expect(query.descriptor.schemaId).toBe('xnet://xnet.fyi/ProjectRow@1.0.0')
        expect(query.rows).toHaveLength(1)
        expect(query.rows[0].properties.title).toBe('Alpha Launch')
        expect(query.page.materializedView.viewId).toBe('view-table')
        expect(query.queryPlan.strategy).toBe('list-fallback')

        const explainResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_database_explain_query',
            arguments: {
              databaseId: database.id,
              descriptor: { materializedView: { viewId: 'view-table' } }
            }
          })
        )
        const explainResult = explainResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const explanation = JSON.parse(explainResult.content[0].text)
        expect(explanation.diagnostics.usesMaterializedView).toBe(true)
        expect(explanation.diagnostics.storageQueryAvailable).toBe(false)

        const sampleResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_database_sample',
            arguments: { databaseId: database.id, sampleSize: 1 }
          })
        )
        const sampleResult = sampleResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const sample = JSON.parse(sampleResult.content[0].text)
        expect(sample.rows).toHaveLength(1)
        expect(sample.strategy).toBe('deterministic-first-page')
      })

      it('plans mixed database row transactions and schema doc mutations', async () => {
        const database = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Database@1.0.0',
          properties: {
            title: 'Projects',
            rowSchemaId: 'xnet://xnet.fyi/ProjectRow@1.0.0'
          }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_plan_database_mutation',
            arguments: {
              databaseId: database.id,
              operations: [
                {
                  op: 'createRow',
                  args: { properties: { title: 'New project' } }
                },
                {
                  op: 'addColumn',
                  args: { column: { id: 'status', name: 'Status', type: 'select' } }
                }
              ]
            }
          })
        )

        const result = response.result as { content: Array<{ type: string; text: string }> }
        const plan = JSON.parse(result.content[0].text)
        expect(plan.validation.valid).toBe(true)
        expect(plan.requiredScopes).toContain('database.write.rows')
        expect(plan.requiredScopes).toContain('database.write.schema')
        expect(plan.changes.map((change: { targetKind: string }) => change.targetKind)).toEqual([
          'databaseRows',
          'database'
        ])
        expect(plan.changes[0].operations[0].args.transactionOperations[0]).toMatchObject({
          type: 'create',
          options: {
            schemaId: 'xnet://xnet.fyi/ProjectRow@1.0.0',
            properties: { database: database.id, title: 'New project' }
          }
        })
        expect(plan.changes[1].operations[0].args.yDocMutation).toMatchObject({
          document: 'database',
          collection: 'columns',
          helper: 'addColumn'
        })
      })

      it('rejects destructive database plans without explicit delete markers', async () => {
        const database = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Database@1.0.0',
          properties: { title: 'Projects' }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_plan_database_mutation',
            arguments: {
              databaseId: database.id,
              operations: [{ op: 'deleteRow', args: { rowId: 'row_1' } }]
            }
          })
        )

        const result = response.result as { content: Array<{ type: string; text: string }> }
        const plan = JSON.parse(result.content[0].text)
        expect(plan.risk).toBe('high')
        expect(plan.validation.valid).toBe(false)
        expect(plan.validation.errors).toContain(
          'operations[0] delete/drop/remove operations require confirmDelete true or deletionMarker "DELETE"'
        )
      })

      it('reads scoped canvas selections and exports source-backed JSON Canvas', async () => {
        const source = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Source Page', markdown: 'Source body' }
        })
        const canvas = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Canvas@1.0.0',
          properties: {
            title: 'AI Canvas',
            objects: [
              {
                id: 'obj-page',
                type: 'page',
                sourceNodeId: source.id,
                x: 40,
                y: 80,
                width: 240,
                height: 160,
                properties: { title: 'Page Card', url: 'xnet://page/source' }
              },
              {
                id: 'obj-note',
                type: 'note',
                x: 360,
                y: 80,
                width: 220,
                height: 140,
                properties: { title: 'Note Card', text: 'Follow up' }
              },
              {
                id: 'obj-far',
                type: 'note',
                x: 2400,
                y: 80,
                width: 220,
                height: 140,
                properties: { title: 'Far Card' }
              }
            ],
            edges: [{ id: 'edge-1', from: 'obj-page', to: 'obj-note', label: 'references' }]
          }
        })

        const listResponse = await server.handleRequest(
          createRequest('tools/call', { name: 'xnet_canvas_list', arguments: {} })
        )
        const listResult = listResponse.result as { content: Array<{ type: string; text: string }> }
        const list = JSON.parse(listResult.content[0].text)
        expect(list.canvases.map((item: { id: string }) => item.id)).toContain(canvas.id)

        const viewportResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_canvas_read_viewport',
            arguments: {
              canvasId: canvas.id,
              x: 0,
              y: 0,
              w: 1000,
              h: 600,
              tileSize: 1000,
              tileIds: ['0/0/0'],
              includeSourcePreviews: true
            }
          })
        )
        const viewportResult = viewportResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const viewport = JSON.parse(viewportResult.content[0].text)
        expect(viewport.objects.map((object: { id: string }) => object.id)).toEqual([
          'obj-page',
          'obj-note'
        ])
        expect(viewport.sourcePreviews[0].id).toBe(source.id)
        expect(viewport.scope.tileIds).toEqual(['0/0/0'])

        const selectionResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_canvas_read_selection',
            arguments: {
              canvasId: canvas.id,
              objectIds: ['obj-page'],
              includeSourcePreviews: true
            }
          })
        )
        const selectionResult = selectionResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const selection = JSON.parse(selectionResult.content[0].text)
        expect(selection.objects).toHaveLength(1)
        expect(selection.edges[0].id).toBe('edge-1')
        expect(selection.sourcePreviews[0].id).toBe(source.id)

        const searchResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_canvas_search',
            arguments: { canvasId: canvas.id, query: 'page card' }
          })
        )
        const searchResult = searchResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const search = JSON.parse(searchResult.content[0].text)
        expect(search.results[0].objectId).toBe('obj-page')

        const exportResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_canvas_export_json_canvas',
            arguments: { canvasId: canvas.id }
          })
        )
        const exportResult = exportResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const exported = JSON.parse(exportResult.content[0].text)
        const pageNode = exported.document.nodes.find(
          (node: { id: string }) => node.id === 'obj-page'
        )
        expect(pageNode).toMatchObject({
          type: 'link',
          xnet: { sourceNodeId: source.id }
        })
        expect(exported.document.edges[0]).toMatchObject({
          fromNode: 'obj-page',
          toNode: 'obj-note'
        })

        const importResponse = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_canvas_plan_json_canvas_import',
            arguments: { canvasId: canvas.id, document: exported.document }
          })
        )
        const importResult = importResponse.result as {
          content: Array<{ type: string; text: string }>
        }
        const importPlan = JSON.parse(importResult.content[0].text)
        expect(importPlan.validation.valid).toBe(true)
        expect(importPlan.changes[0].operations[0].args.object.sourceNodeId).toBe(source.id)
      })

      it('plans deterministic canvas layout mutations with visual diffs', async () => {
        const canvas = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Canvas@1.0.0',
          properties: {
            title: 'Layout Canvas',
            objects: [
              { id: 'a', type: 'note', x: 10, y: 20, width: 100, height: 80 },
              { id: 'b', type: 'note', x: 300, y: 20, width: 100, height: 80 }
            ],
            edges: []
          }
        })

        const response = await server.handleRequest(
          createRequest('tools/call', {
            name: 'xnet_plan_canvas_mutation',
            arguments: {
              canvasId: canvas.id,
              operations: [
                {
                  op: 'layoutObjects',
                  args: {
                    objectIds: ['a', 'b'],
                    algorithm: 'horizontal',
                    startX: 0,
                    startY: 0,
                    gap: 50
                  }
                },
                {
                  op: 'moveObject',
                  args: { objectId: 'a', x: 20, y: 30 }
                }
              ]
            }
          })
        )

        const result = response.result as { content: Array<{ type: string; text: string }> }
        const plan = JSON.parse(result.content[0].text)
        expect(plan.validation.valid).toBe(true)
        expect(plan.changes[0].operations[0].args.generatedOperations).toHaveLength(2)
        expect(plan.changes[0].operations[0].args.visualDiff).toMatchObject({
          kind: 'layout'
        })
        expect(plan.changes[0].operations[1].args.visualDiff).toMatchObject({
          kind: 'move',
          objectId: 'a',
          before: { x: 10, y: 20, width: 100, height: 80 },
          after: { x: 20, y: 30, width: 100, height: 80 }
        })
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

      it('reads xnet://workspace/summary resource', async () => {
        await mockStore.create({
          schemaId: 'xnet://xnet.dev/Task',
          properties: { title: 'Summary Task' }
        })

        const response = await server.handleRequest(
          createRequest('resources/read', {
            uri: 'xnet://workspace/summary'
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { contents: Array<{ uri: string; text: string }> }
        expect(result.contents[0].uri).toBe('xnet://workspace/summary')

        const data = JSON.parse(result.contents[0].text)
        expect(data.schemaCount).toBe(2)
        expect(data.recentNodes[0].title).toBe('Summary Task')
      })

      it('reads page Markdown resources with frontmatter identity', async () => {
        const page = await mockStore.create({
          schemaId: 'xnet://xnet.fyi/Page@1.0.0',
          properties: { title: 'Product Roadmap', markdown: 'AI surface notes' }
        })

        const response = await server.handleRequest(
          createRequest('resources/read', {
            uri: `xnet://page/${page.id}.md`
          })
        )

        expect(response.result).toBeDefined()
        const result = response.result as { contents: Array<{ mimeType: string; text: string }> }
        expect(result.contents[0].mimeType).toBe('text/markdown')
        expect(result.contents[0].text).toContain(`id: "${page.id}"`)
        expect(result.contents[0].text).toContain('# Product Roadmap')
        expect(result.contents[0].text).toContain('AI surface notes')
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
