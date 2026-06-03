/**
 * MCP Server for xNet
 *
 * Exposes xNet data to AI agents via the Model Context Protocol.
 * Provides tools for querying, creating, and updating nodes.
 *
 * This runs as a stdio-based MCP server, typically spawned by an MCP client.
 */

import type { NodeStoreAPI, SchemaRegistryAPI } from './local-api'
import {
  AiSurfaceService,
  createAiSurfaceService,
  type AiJsonSchema,
  type AiResource,
  type AiSurfaceLimits,
  type AiToolDefinition
} from '../ai-surface'

// ─── MCP Protocol Types ──────────────────────────────────────────────────────

/**
 * MCP Tool definition
 */
export interface MCPTool {
  name: string
  title?: string
  description: string
  risk?: string
  requiredScopes?: string[]
  inputSchema: {
    type: 'object'
    properties: Record<string, MCPPropertySchema>
    required?: string[]
  }
}

/**
 * MCP property schema
 */
export interface MCPPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  enum?: readonly string[]
  properties?: Record<string, MCPPropertySchema>
  required?: string[]
  items?: MCPPropertySchema
  additionalProperties?: boolean | MCPPropertySchema
}

/**
 * MCP Resource definition
 */
export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  risk?: string
  requiredScopes?: string[]
  dynamic?: boolean
}

/**
 * MCP Request from client
 */
export interface MCPRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

/**
 * MCP Response to client
 */
export interface MCPResponse {
  jsonrpc: '2.0'
  id: number | string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * MCP Server configuration
 */
export interface MCPServerConfig {
  store: NodeStoreAPI
  schemas: SchemaRegistryAPI
  /** Shared AI surface service. A default service is created when omitted. */
  aiSurface?: AiSurfaceService
  /** Optional output and pagination limits for the default AI surface. */
  aiLimits?: Partial<AiSurfaceLimits>
  /** Server name (default: 'xnet') */
  name?: string
  /** Server version (default: '1.0.0') */
  version?: string
}

// ─── MCP Server Implementation ───────────────────────────────────────────────

/**
 * MCP Server for xNet.
 *
 * Provides tools for AI agents to interact with xNet data:
 * - xnet_query: Query nodes by schema and filter
 * - xnet_create: Create a new node
 * - xnet_update: Update an existing node
 * - xnet_delete: Delete a node
 * - xnet_search: Full-text search across nodes
 * - xnet_schemas: List available schemas
 *
 * @example
 * ```typescript
 * const server = new MCPServer({
 *   store: nodeStore,
 *   schemas: schemaRegistry
 * })
 *
 * // Start stdio server (for MCP client connections)
 * await server.startStdio()
 * ```
 */
export class MCPServer {
  private config: {
    store: NodeStoreAPI
    schemas: SchemaRegistryAPI
    aiSurface: AiSurfaceService
    name: string
    version: string
  }
  private tools: Map<string, MCPTool> = new Map()
  private aiToolNames: Set<string> = new Set()
  private running = false

  constructor(config: MCPServerConfig) {
    const aiSurface =
      config.aiSurface ??
      createAiSurfaceService({
        store: config.store,
        schemas: config.schemas,
        limits: config.aiLimits
      })

    this.config = {
      store: config.store,
      schemas: config.schemas,
      aiSurface,
      name: config.name ?? 'xnet',
      version: config.version ?? '1.0.0'
    }
    this.registerTools()
  }

  /**
   * Get server info for MCP initialize response
   */
  getServerInfo(): { name: string; version: string } {
    return {
      name: this.config.name,
      version: this.config.version
    }
  }

  /**
   * Get server capabilities
   */
  getCapabilities(): { tools: Record<string, never>; resources: Record<string, never> } {
    return {
      tools: {},
      resources: {}
    }
  }

  /**
   * Get all registered tools
   */
  getTools(): MCPTool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Get available resources
   */
  getResources(): MCPResource[] {
    return this.config.aiSurface.getResources().map(toMCPResource)
  }

  /**
   * Handle an MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { id, method, params } = request

    try {
      let result: unknown

      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: '2024-11-05',
            serverInfo: this.getServerInfo(),
            capabilities: this.getCapabilities()
          }
          break

        case 'tools/list':
          result = { tools: this.getTools() }
          break

        case 'tools/call':
          result = await this.handleToolCall(params as { name: string; arguments?: unknown })
          break

        case 'resources/list':
          result = { resources: this.getResources() }
          break

        case 'resources/read':
          result = await this.handleResourceRead(params as { uri: string })
          break

        case 'notifications/initialized':
          // Client notification that initialization is complete
          result = {}
          break

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` }
          }
      }

      return { jsonrpc: '2.0', id, result }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : 'Unknown error'
        }
      }
    }
  }

  /**
   * Start the MCP server in stdio mode.
   * Reads JSON-RPC requests from stdin and writes responses to stdout.
   */
  async startStdio(): Promise<void> {
    if (this.running) {
      throw new Error('Server already running')
    }

    this.running = true

    // Read from stdin line by line
    const readline = await import('readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    })

    for await (const line of rl) {
      if (!this.running) break

      try {
        const request = JSON.parse(line) as MCPRequest
        const response = await this.handleRequest(request)
        console.log(JSON.stringify(response))
      } catch {
        // Invalid JSON - send parse error
        console.log(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' }
          })
        )
      }
    }
  }

  /**
   * Stop the stdio server
   */
  stop(): void {
    this.running = false
  }

  // ─── Tool Registration ─────────────────────────────────────────────────────

  private registerTools(): void {
    this.tools.set('xnet_query', {
      name: 'xnet_query',
      description:
        'Query nodes by schema and optional filter. Returns matching nodes with their properties.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: {
            type: 'string',
            description: 'Schema IRI to query (e.g., xnet://xnet.dev/Task)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 20)'
          },
          offset: {
            type: 'number',
            description: 'Number of results to skip for pagination'
          }
        },
        required: ['schema']
      }
    })

    this.tools.set('xnet_get', {
      name: 'xnet_get',
      description: 'Get a single node by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The unique ID of the node to retrieve'
          }
        },
        required: ['nodeId']
      }
    })

    this.tools.set('xnet_create', {
      name: 'xnet_create',
      description: 'Create a new node with the given schema and properties.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: {
            type: 'string',
            description: 'Schema IRI for the new node'
          },
          properties: {
            type: 'object',
            description: 'Initial property values for the node'
          }
        },
        required: ['schema', 'properties']
      }
    })

    this.tools.set('xnet_update', {
      name: 'xnet_update',
      description: 'Update properties of an existing node.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to update'
          },
          properties: {
            type: 'object',
            description: 'Properties to update (only specified properties will change)'
          }
        },
        required: ['nodeId', 'properties']
      }
    })

    this.tools.set('xnet_delete', {
      name: 'xnet_delete',
      description: 'Delete a node by its ID.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to delete'
          }
        },
        required: ['nodeId']
      }
    })

    this.tools.set('xnet_schemas', {
      name: 'xnet_schemas',
      description:
        'List all available schemas with their properties. Useful for understanding what types of nodes can be created.',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    })

    for (const tool of this.config.aiSurface.getTools()) {
      this.aiToolNames.add(tool.name)
      this.tools.set(tool.name, toMCPTool(tool))
    }
  }

  // ─── Tool Execution ────────────────────────────────────────────────────────

  private async handleToolCall(params: {
    name: string
    arguments?: unknown
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { name, arguments: args } = params
    const toolArgs = (args ?? {}) as Record<string, unknown>

    let result: unknown

    switch (name) {
      case 'xnet_query': {
        const schemaId = toolArgs.schema as string
        const limit = (toolArgs.limit as number) ?? 20
        const offset = (toolArgs.offset as number) ?? 0

        const nodes = await this.config.store.list({ schemaId, limit, offset })
        result = { nodes, count: nodes.length }
        break
      }

      case 'xnet_get': {
        const nodeId = toolArgs.nodeId as string
        const node = await this.config.store.get(nodeId)
        if (!node) {
          throw new Error(`Node not found: ${nodeId}`)
        }
        result = node
        break
      }

      case 'xnet_create': {
        const schema = toolArgs.schema as string
        const properties = toolArgs.properties as Record<string, unknown>

        const node = await this.config.store.create({
          schemaId: schema,
          properties
        })
        result = node
        break
      }

      case 'xnet_update': {
        const nodeId = toolArgs.nodeId as string
        const properties = toolArgs.properties as Record<string, unknown>

        const existing = await this.config.store.get(nodeId)
        if (!existing) {
          throw new Error(`Node not found: ${nodeId}`)
        }

        const node = await this.config.store.update(nodeId, { properties })
        result = node
        break
      }

      case 'xnet_delete': {
        const nodeId = toolArgs.nodeId as string

        const existing = await this.config.store.get(nodeId)
        if (!existing) {
          throw new Error(`Node not found: ${nodeId}`)
        }

        await this.config.store.delete(nodeId)
        result = { success: true, nodeId }
        break
      }

      case 'xnet_schemas': {
        const iris = this.config.schemas.getAllIRIs()
        const schemas = await Promise.all(
          iris.map(async (iri) => {
            const schema = await this.config.schemas.get(iri)
            return schema
              ? {
                  iri,
                  name: schema.name,
                  properties: schema.properties
                }
              : null
          })
        )
        result = { schemas: schemas.filter(Boolean) }
        break
      }

      default:
        if (this.aiToolNames.has(name)) {
          result = await this.config.aiSurface.callTool(name, toolArgs)
          break
        }
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: this.config.aiSurface.toJsonText(result) }]
    }
  }

  // ─── Resource Handling ─────────────────────────────────────────────────────

  private async handleResourceRead(params: {
    uri: string
  }): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
    const { uri } = params

    const content = await this.config.aiSurface.readResource(uri)

    return {
      contents: [
        {
          uri: content.uri,
          mimeType: content.mimeType,
          text: content.text
        }
      ]
    }
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create an MCP server for xNet.
 *
 * @example
 * ```typescript
 * const server = createMCPServer({
 *   store: nodeStore,
 *   schemas: schemaRegistry
 * })
 *
 * // Handle individual requests
 * const response = await server.handleRequest(request)
 *
 * // Or start as a stdio server
 * await server.startStdio()
 * ```
 */
export function createMCPServer(config: MCPServerConfig): MCPServer {
  return new MCPServer(config)
}

// ─── Adapter Helpers ────────────────────────────────────────────────────────

function toMCPTool(tool: AiToolDefinition): MCPTool {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    risk: tool.risk,
    requiredScopes: [...tool.requiredScopes],
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties).map(([name, schema]) => [
          name,
          toMCPPropertySchema(schema)
        ])
      ),
      ...(tool.inputSchema.required ? { required: [...tool.inputSchema.required] } : {})
    }
  }
}

function toMCPPropertySchema(schema: AiJsonSchema): MCPPropertySchema {
  return {
    type: schema.type,
    description: schema.description,
    enum: schema.enum,
    ...(schema.properties
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([name, property]) => [
              name,
              toMCPPropertySchema(property)
            ])
          )
        }
      : {}),
    ...(schema.required ? { required: [...schema.required] } : {}),
    ...(schema.items ? { items: toMCPPropertySchema(schema.items) } : {}),
    ...(schema.additionalProperties !== undefined
      ? {
          additionalProperties:
            typeof schema.additionalProperties === 'boolean'
              ? schema.additionalProperties
              : toMCPPropertySchema(schema.additionalProperties)
        }
      : {})
  }
}

function toMCPResource(resource: AiResource): MCPResource {
  return {
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
    mimeType: resource.mimeType,
    risk: resource.risk,
    requiredScopes: [...resource.requiredScopes],
    dynamic: resource.dynamic
  }
}
