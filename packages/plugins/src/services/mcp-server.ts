/**
 * MCP Server for xNet
 *
 * Exposes xNet data to AI agents via the Model Context Protocol.
 * Provides tools for querying, creating, and updating nodes.
 *
 * This runs as a stdio-based MCP server, typically spawned by an MCP client.
 */

import type { NodeStoreAPI, SchemaRegistryAPI } from './local-api'
import type { AISignalProvenanceInput } from '@xnetjs/abuse'
import { agentToolsAsExtraTools, type AgentToolContribution } from '../agent-tools'
import {
  AiSurfaceService,
  createAiSurfaceService,
  type AiExtraTool,
  type AiJsonSchema,
  type AiResource,
  type AiSurfaceLimits,
  type AiToolDefinition
} from '../ai-surface'
import { AgentAuditRecorder, type AgentAuditContext } from '../ai-surface/agent-audit'
import {
  createAgentCeremonyTools,
  createAgentNotificationTools
} from '../ai-surface/agent-ceremony-tools'
import { McpWriteGuardrail, type McpWriteRequest } from './mcp-guardrail'

/** Schema IRIs for the first-class write tools (exploration 0174/0175). */
const TASK_SCHEMA_IRI = 'xnet://xnet.fyi/Task@1.0.0'
const PAGE_SCHEMA_IRI = 'xnet://xnet.fyi/Page@1.0.0'
const CHAT_MESSAGE_SCHEMA_IRI = 'xnet://xnet.fyi/ChatMessage@1.0.0'

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
  /**
   * Tool Search Tool hint (advanced-tool-use): deferred tools are discovered
   * on demand instead of paying their definition tokens on every turn.
   */
  defer_loading?: boolean
  inputSchema: {
    type: 'object'
    properties: Record<string, MCPPropertySchema>
    required?: string[]
  }
}

/**
 * Tools loaded into context on every turn. Everything else is deferred and
 * discovered on demand (~85% standing-definition reduction per Anthropic's
 * Tool Search Tool measurements). Keep this list stable across releases so
 * prompt caching amortizes the definitions.
 */
export const MCP_CORE_TOOL_NAMES: readonly string[] = [
  'xnet_search',
  'xnet_read_page_markdown',
  'xnet_plan_page_patch',
  'xnet_apply_page_markdown',
  'xnet_database_query'
]

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
  /**
   * Plugin/connector agent tools to expose (exploration 0196). Folded into the
   * default AI surface's `extraTools`, so they appear in `tools/list` (deferred,
   * since not in {@link MCP_CORE_TOOL_NAMES}) and dispatch through `tools/call`.
   * Ignored when a pre-built `aiSurface` is supplied — wire `extraTools` there.
   */
  agentTools?: AgentToolContribution[]
  /**
   * Pre-shaped AI tools to expose beside the built-ins — the `lab_*`
   * (`labAgentToolsToAiTools`) and `plugin_*` (0331,
   * `createWorkspacePluginAgentTools`) surfaces plug in here. Like
   * `agentTools`, ignored when a pre-built `aiSurface` is supplied.
   */
  extraTools?: AiExtraTool[]
  /**
   * Write guardrail for the generic + first-class write tools. A default
   * guardrail (delete/outward writes need confirmation, cost budget, audit) is
   * created when omitted. Pass a configured instance to tune it.
   */
  guardrail?: McpWriteGuardrail
  /** Server name (default: 'xnet') */
  name?: string
  /** Server version (default: '1.0.0') */
  version?: string
  /**
   * Agent-scoped session (exploration 0337). When set, every AI-surface tool
   * call routes through an {@link AgentAuditRecorder}: it lands as an
   * `AgentAction` node and medium+ risk calls park behind the risk-tiered
   * approval ceremony. Also exposes the ceremony (`xnet_approve`,
   * `xnet_deny`, `xnet_pending_approvals`, `xnet_undo`) and outbox
   * (`xnet_poll_notifications`) tools. The store this server was built with
   * should be signing as the enrolled agent's DID — that is what makes the
   * kernel change log the tamper-evident half of the trail.
   */
  agentAudit?: AgentAuditContext & { approvalTtlMs?: number }
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
    guardrail: McpWriteGuardrail
    name: string
    version: string
  }
  private tools: Map<string, MCPTool> = new Map()
  private aiToolNames: Set<string> = new Set()
  private running = false
  /** Present when `agentAudit` is configured (exploration 0337). */
  private recorder: AgentAuditRecorder | null = null
  private agentExtraTools: Map<string, AiExtraTool> = new Map()

  constructor(config: MCPServerConfig) {
    const aiSurface =
      config.aiSurface ??
      createAiSurfaceService({
        store: config.store,
        schemas: config.schemas,
        limits: config.aiLimits,
        extraTools: [
          ...agentToolsAsExtraTools(config.agentTools ?? []),
          ...(config.extraTools ?? [])
        ]
      })

    this.config = {
      store: config.store,
      schemas: config.schemas,
      aiSurface,
      guardrail: config.guardrail ?? new McpWriteGuardrail(),
      name: config.name ?? 'xnet',
      version: config.version ?? '1.0.0'
    }

    if (config.agentAudit) {
      const { approvalTtlMs, ...context } = config.agentAudit
      this.recorder = new AgentAuditRecorder({
        surface: aiSurface,
        store: config.store,
        context,
        approvalTtlMs
      })
      for (const tool of [
        ...createAgentCeremonyTools(this.recorder),
        ...createAgentNotificationTools(config.store)
      ]) {
        this.agentExtraTools.set(tool.name, tool)
      }
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
      await this.handleStdioLine(line)
    }
  }

  /** Parse one stdin line as a JSON-RPC request and write the response. */
  private async handleStdioLine(line: string): Promise<void> {
    try {
      const response = await this.handleRequest(JSON.parse(line) as MCPRequest)
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
      description:
        'Create a new node with the given schema and properties. Outward-facing creates (e.g. chat messages) return needs-confirmation until re-called with confirm: true.',
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
          },
          confirm: CONFIRM_SCHEMA,
          provenance: PROVENANCE_SCHEMA
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
          },
          confirm: CONFIRM_SCHEMA,
          provenance: PROVENANCE_SCHEMA
        },
        required: ['nodeId', 'properties']
      }
    })

    this.tools.set('xnet_delete', {
      name: 'xnet_delete',
      description:
        'Delete a node by its ID. High-risk: returns needs-confirmation until re-called with confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'ID of the node to delete'
          },
          confirm: CONFIRM_SCHEMA,
          provenance: PROVENANCE_SCHEMA
        },
        required: ['nodeId']
      }
    })

    this.tools.set('xnet_create_task', {
      name: 'xnet_create_task',
      description: 'Create a Task. Convenience wrapper over xnet_create with the Task schema.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task title (required)' },
          status: { type: 'string', description: 'Status (e.g. todo, in_progress, done)' },
          priority: { type: 'string', description: 'Priority (e.g. low, medium, high)' },
          dueDate: { type: 'string', description: 'Due date (ISO 8601)' },
          properties: { type: 'object', description: 'Additional Task properties' },
          confirm: CONFIRM_SCHEMA,
          provenance: PROVENANCE_SCHEMA
        },
        required: ['title']
      }
    })

    this.tools.set('xnet_create_page', {
      name: 'xnet_create_page',
      description: 'Create a Page. Convenience wrapper over xnet_create with the Page schema.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Page title (required)' },
          icon: { type: 'string', description: 'Optional icon' },
          properties: { type: 'object', description: 'Additional Page properties' },
          confirm: CONFIRM_SCHEMA,
          provenance: PROVENANCE_SCHEMA
        },
        required: ['title']
      }
    })

    this.tools.set('xnet_send_message', {
      name: 'xnet_send_message',
      description:
        'Send a chat message to a channel. Outward-facing: returns needs-confirmation until re-called with confirm: true.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: { type: 'string', description: 'Target channel node id (required)' },
          content: { type: 'string', description: 'Message content, GFM markdown (required)' },
          inReplyTo: { type: 'string', description: 'Optional id of the message being replied to' },
          confirm: CONFIRM_SCHEMA,
          provenance: PROVENANCE_SCHEMA
        },
        required: ['channel', 'content']
      }
    })

    this.tools.set('xnet_get_write_audit', {
      name: 'xnet_get_write_audit',
      description: 'List recent guardrail-recorded writes (kind, risk, provenance) for review.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max events to return (default 50)' }
        }
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

    for (const tool of this.agentExtraTools.values()) {
      // AiExtraTool extends AiToolDefinition; toMCPTool reads definition fields only.
      this.tools.set(tool.name, toMCPTool(tool))
    }

    for (const [name, tool] of this.tools) {
      tool.defer_loading = !MCP_CORE_TOOL_NAMES.includes(name)
      tool.inputSchema.properties.response_format = RESPONSE_FORMAT_SCHEMA
      if (this.recorder && this.aiToolNames.has(name)) {
        tool.inputSchema.properties._instruction = INSTRUCTION_SCHEMA
      }
    }
  }

  // ─── Tool Execution ────────────────────────────────────────────────────────

  private async handleToolCall(params: {
    name: string
    arguments?: unknown
  }): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
    const { name, arguments: args } = params
    const { response_format: responseFormatArg, ...toolArgs } = (args ?? {}) as Record<
      string,
      unknown
    >
    const responseFormat = responseFormatArg === 'detailed' ? 'detailed' : 'concise'

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
        result = await this.guardedWrite(
          { kind: 'create', schemaId: schema, ...readWriteGate(toolArgs) },
          () => this.config.store.create({ schemaId: schema, properties }),
          nodeIdOf
        )
        break
      }

      case 'xnet_create_task': {
        result = await this.createNode(TASK_SCHEMA_IRI, taskProperties(toolArgs), toolArgs)
        break
      }

      case 'xnet_create_page': {
        result = await this.createNode(PAGE_SCHEMA_IRI, pageProperties(toolArgs), toolArgs)
        break
      }

      case 'xnet_send_message': {
        result = await this.createNode(
          CHAT_MESSAGE_SCHEMA_IRI,
          messageProperties(toolArgs),
          toolArgs
        )
        break
      }

      case 'xnet_update': {
        const nodeId = toolArgs.nodeId as string
        const properties = toolArgs.properties as Record<string, unknown>

        const existing = await this.config.store.get(nodeId)
        if (!existing) {
          throw new Error(`Node not found: ${nodeId}`)
        }

        result = await this.guardedWrite(
          { kind: 'update', nodeId, ...readWriteGate(toolArgs) },
          () => this.config.store.update(nodeId, { properties })
        )
        break
      }

      case 'xnet_delete': {
        const nodeId = toolArgs.nodeId as string

        const existing = await this.config.store.get(nodeId)
        if (!existing) {
          throw new Error(`Node not found: ${nodeId}`)
        }

        result = await this.guardedWrite(
          { kind: 'delete', nodeId, ...readWriteGate(toolArgs) },
          async () => {
            await this.config.store.delete(nodeId)
            return { success: true, nodeId }
          }
        )
        break
      }

      case 'xnet_get_write_audit': {
        const limit = (toolArgs.limit as number) ?? 50
        result = { events: this.config.guardrail.getAuditLog(limit) }
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
        if (this.agentExtraTools.has(name)) {
          result = await this.agentExtraTools.get(name)!.invoke(toolArgs)
          break
        }
        if (this.aiToolNames.has(name)) {
          if (this.recorder) {
            const { _instruction, ...rest } = toolArgs
            const outcome = await this.recorder.callTool(
              name,
              rest,
              typeof _instruction === 'string' ? _instruction : undefined
            )
            result = outcome.pending ? outcome : outcome.result
          } else {
            result = await this.config.aiSurface.callTool(name, toolArgs)
          }
          break
        }
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: this.config.aiSurface.toJsonText(result, responseFormat) }]
    }
  }

  // ─── Guarded Writes ──────────────────────────────────────────────────────────

  /**
   * Route a write through the guardrail. Returns a gate result
   * (`requiresConfirmation` / `blocked`) without mutating, or applies + records
   * an audit entry and returns the applied value.
   */
  private async guardedWrite(
    req: McpWriteRequest,
    apply: () => Promise<unknown>,
    nodeIdFrom?: (applied: unknown) => string | undefined
  ): Promise<unknown> {
    const verdict = this.config.guardrail.evaluate(req)
    if (verdict.decision === 'blocked') {
      return { blocked: true, risk: verdict.risk, reason: verdict.reason }
    }
    if (verdict.decision === 'needs-confirmation') {
      return {
        requiresConfirmation: true,
        risk: verdict.risk,
        outwardFacing: verdict.outwardFacing,
        reason: verdict.reason
      }
    }
    const applied = await apply()
    this.config.guardrail.recordApplied(req, verdict, nodeIdFrom ? nodeIdFrom(applied) : req.nodeId)
    return applied
  }

  /** Shared create path for the first-class write tools. */
  private createNode(
    schemaId: string,
    properties: Record<string, unknown>,
    toolArgs: Record<string, unknown>
  ): Promise<unknown> {
    return this.guardedWrite(
      { kind: 'create', schemaId, ...readWriteGate(toolArgs) },
      () => this.config.store.create({ schemaId, properties }),
      nodeIdOf
    )
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

const RESPONSE_FORMAT_SCHEMA: MCPPropertySchema = {
  type: 'string',
  enum: ['concise', 'detailed'],
  description: 'Response verbosity. Defaults to concise (compact JSON).'
}

/** Injected on AI tools when an agent-audit session is active (0337). */
const INSTRUCTION_SCHEMA: MCPPropertySchema = {
  type: 'string',
  description:
    "The operator's instruction that triggered this call, verbatim — recorded in the AgentAction audit trail."
}

const CONFIRM_SCHEMA: MCPPropertySchema = {
  type: 'boolean',
  description:
    'Set true (after the user approves) to apply a high-risk or outward-facing write. Omitted/false returns needs-confirmation without mutating.'
}

const PROVENANCE_SCHEMA: MCPPropertySchema = {
  type: 'object',
  description:
    'Optional AI provenance for the write: { sourceType: "local-ai"|"cloud-ai", modelProvider, modelName }.'
}

/** Read the shared write-gate args (confirm + provenance) off a tool call. */
function readWriteGate(args: Record<string, unknown>): {
  confirm: boolean
  provenance?: AISignalProvenanceInput
} {
  const provenance = isPlainRecord(args.provenance)
    ? (args.provenance as AISignalProvenanceInput)
    : undefined
  return { confirm: args.confirm === true, ...(provenance ? { provenance } : {}) }
}

const nodeIdOf = (applied: unknown): string | undefined =>
  isPlainRecord(applied) && typeof applied.id === 'string' ? applied.id : undefined

function taskProperties(args: Record<string, unknown>): Record<string, unknown> {
  return {
    title: args.title,
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.priority !== undefined ? { priority: args.priority } : {}),
    ...(args.dueDate !== undefined ? { dueDate: args.dueDate } : {}),
    ...(isPlainRecord(args.properties) ? args.properties : {})
  }
}

function pageProperties(args: Record<string, unknown>): Record<string, unknown> {
  return {
    title: args.title,
    ...(args.icon !== undefined ? { icon: args.icon } : {}),
    ...(isPlainRecord(args.properties) ? args.properties : {})
  }
}

function messageProperties(args: Record<string, unknown>): Record<string, unknown> {
  return {
    channel: args.channel,
    content: args.content,
    ...(args.inReplyTo !== undefined ? { inReplyTo: args.inReplyTo } : {})
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
