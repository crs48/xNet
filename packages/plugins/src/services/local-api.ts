/**
 * Local HTTP API Server
 *
 * Provides a REST API for external integrations (N8N, MCP, etc.) to interact
 * with xNet data. Runs on localhost only (port 31415 by default).
 *
 * This is designed to run in the Electron main process.
 */

import { timingSafeEqual } from 'crypto'
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { URL } from 'url'

/**
 * Constant-time string comparison to prevent timing attacks on token validation.
 * Returns false if strings have different lengths (revealed by timing, but acceptable for auth tokens).
 */
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return timingSafeEqual(bufA, bufB)
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Node store interface (minimal subset needed by API)
 */
export interface NodeStoreAPI {
  get(id: string): Promise<NodeData | null>
  list(options?: { schemaId?: string; limit?: number; offset?: number }): Promise<NodeData[]>
  create(options: { schemaId: string; properties: Record<string, unknown> }): Promise<NodeData>
  update(id: string, options: { properties: Record<string, unknown> }): Promise<NodeData>
  delete(id: string): Promise<void>
  subscribe(listener: (event: NodeChangeEventData) => void): () => void
}

/**
 * Schema registry interface (minimal subset needed by API)
 */
export interface SchemaRegistryAPI {
  getAllIRIs(): string[]
  get(iri: string): Promise<SchemaData | null>
}

/**
 * Node data returned by API
 */
export interface NodeData {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Schema data returned by API
 */
export interface SchemaData {
  iri: string
  name: string
  properties: Record<string, unknown>
}

/**
 * Node change event data
 */
export interface NodeChangeEventData {
  change: { type: string }
  node: NodeData | null
  isRemote: boolean
}

/**
 * API configuration
 */
export interface LocalAPIConfig {
  /** Port to listen on (default: 31415) */
  port?: number
  /** Host to bind to (default: '127.0.0.1') */
  host?: string
  /** API token for authentication (optional) */
  token?: string
  /** NodeStore instance */
  store: NodeStoreAPI
  /** SchemaRegistry instance */
  schemas: SchemaRegistryAPI
}

/**
 * Event stored in the event buffer for polling
 */
interface BufferedEvent {
  type: 'created' | 'updated' | 'deleted'
  node: NodeData | null
  timestamp: number
}

// ─── Event Buffer ────────────────────────────────────────────────────────────

/**
 * Circular buffer for storing recent events.
 * Used by the /api/v1/events endpoint for polling.
 */
class EventBuffer {
  private events: BufferedEvent[] = []
  private maxEvents: number

  constructor(maxEvents = 1000) {
    this.maxEvents = maxEvents
  }

  push(event: BufferedEvent): void {
    this.events.push(event)
    if (this.events.length > this.maxEvents) {
      this.events.shift()
    }
  }

  getSince(timestamp: number, schemaId?: string): BufferedEvent[] {
    return this.events.filter((e) => {
      if (e.timestamp <= timestamp) return false
      if (schemaId && e.node?.schemaId !== schemaId) return false
      return true
    })
  }
}

// ─── Local API Server ────────────────────────────────────────────────────────

/**
 * Local HTTP API server for xNet integrations.
 */
export class LocalAPIServer {
  private server: Server | null = null
  private config: Required<Omit<LocalAPIConfig, 'token'>> & { token?: string }
  private eventBuffer: EventBuffer
  private unsubscribe?: () => void

  constructor(config: LocalAPIConfig) {
    this.config = {
      port: config.port ?? 31415,
      host: config.host ?? '127.0.0.1',
      token: config.token,
      store: config.store,
      schemas: config.schemas
    }
    this.eventBuffer = new EventBuffer()
  }

  /**
   * Start the API server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Server already running')
    }

    // Subscribe to store changes for event buffer
    this.unsubscribe = this.config.store.subscribe((event) => {
      const type = this.getEventType(event.change.type)
      if (type) {
        this.eventBuffer.push({
          type,
          node: event.node,
          timestamp: Date.now()
        })
      }
    })

    // Create HTTP server
    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error('[LocalAPI] Request error:', err)
        this.sendError(res, 500, 'Internal server error')
      })
    })

    // Start listening
    return new Promise((resolve, reject) => {
      this.server!.listen(this.config.port, this.config.host, () => {
        console.log(`[LocalAPI] Server listening on http://${this.config.host}:${this.config.port}`)
        resolve()
      })
      this.server!.on('error', reject)
    })
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = undefined
    }

    if (!this.server) return

    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log('[LocalAPI] Server stopped')
        this.server = null
        resolve()
      })
    })
  }

  /**
   * Get the server port
   */
  get port(): number {
    return this.config.port
  }

  /**
   * Check if server is running
   */
  get isRunning(): boolean {
    return this.server !== null
  }

  // ─── Request Handling ────────────────────────────────────────────────────────

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS headers for local development
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Check authentication if token is configured (using constant-time comparison)
    if (this.config.token) {
      const auth = req.headers.authorization
      const expected = `Bearer ${this.config.token}`
      if (!auth || !constantTimeCompare(auth, expected)) {
        this.sendError(res, 401, 'Unauthorized')
        return
      }
    }

    // Parse URL
    const url = new URL(req.url ?? '/', `http://${this.config.host}:${this.config.port}`)
    const pathname = url.pathname
    const method = req.method ?? 'GET'

    // Route to handler
    try {
      // Health check
      if (pathname === '/health' && method === 'GET') {
        return this.handleHealth(res)
      }

      // API v1 routes
      if (pathname.startsWith('/api/v1/')) {
        const path = pathname.slice('/api/v1'.length)

        // Nodes CRUD
        if (path === '/nodes' && method === 'GET') {
          return await this.handleListNodes(url, res)
        }
        if (path === '/nodes' && method === 'POST') {
          return await this.handleCreateNode(req, res)
        }
        if (path.match(/^\/nodes\/[^/]+$/) && method === 'GET') {
          const id = path.slice('/nodes/'.length)
          return await this.handleGetNode(id, res)
        }
        if (path.match(/^\/nodes\/[^/]+$/) && method === 'PATCH') {
          const id = path.slice('/nodes/'.length)
          return await this.handleUpdateNode(id, req, res)
        }
        if (path.match(/^\/nodes\/[^/]+$/) && method === 'DELETE') {
          const id = path.slice('/nodes/'.length)
          return await this.handleDeleteNode(id, res)
        }

        // Query endpoint
        if (path === '/query' && method === 'POST') {
          return await this.handleQuery(req, res)
        }

        // Events endpoint (for polling)
        if (path === '/events' && method === 'GET') {
          return this.handleGetEvents(url, res)
        }

        // Schemas endpoint
        if (path === '/schemas' && method === 'GET') {
          return await this.handleListSchemas(res)
        }
        if (path.match(/^\/schemas\//) && method === 'GET') {
          const iri = decodeURIComponent(path.slice('/schemas/'.length))
          return await this.handleGetSchema(iri, res)
        }
      }

      this.sendError(res, 404, 'Not found')
    } catch (err) {
      console.error('[LocalAPI] Handler error:', err)
      this.sendError(res, 500, err instanceof Error ? err.message : 'Internal server error')
    }
  }

  // ─── Health ──────────────────────────────────────────────────────────────────

  private handleHealth(res: ServerResponse): void {
    this.sendJSON(res, 200, {
      status: 'ok',
      version: '1.0.0',
      timestamp: Date.now()
    })
  }

  // ─── Nodes ───────────────────────────────────────────────────────────────────

  private async handleListNodes(url: URL, res: ServerResponse): Promise<void> {
    const schemaId = url.searchParams.get('schema') ?? undefined
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

    const nodes = await this.config.store.list({ schemaId, limit, offset })
    this.sendJSON(res, 200, { nodes, count: nodes.length, limit, offset })
  }

  private async handleGetNode(id: string, res: ServerResponse): Promise<void> {
    const node = await this.config.store.get(id)
    if (!node) {
      this.sendError(res, 404, `Node not found: ${id}`)
      return
    }
    this.sendJSON(res, 200, node)
  }

  private async handleCreateNode(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseBody(req)
    if (!body.schema || typeof body.schema !== 'string') {
      this.sendError(res, 400, 'Missing required field: schema')
      return
    }
    if (!body.properties || typeof body.properties !== 'object') {
      this.sendError(res, 400, 'Missing required field: properties')
      return
    }

    const node = await this.config.store.create({
      schemaId: body.schema,
      properties: body.properties as Record<string, unknown>
    })
    this.sendJSON(res, 201, node)
  }

  private async handleUpdateNode(
    id: string,
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const existing = await this.config.store.get(id)
    if (!existing) {
      this.sendError(res, 404, `Node not found: ${id}`)
      return
    }

    const body = await this.parseBody(req)
    if (!body || typeof body !== 'object') {
      this.sendError(res, 400, 'Request body must be an object')
      return
    }

    const node = await this.config.store.update(id, {
      properties: body as Record<string, unknown>
    })
    this.sendJSON(res, 200, node)
  }

  private async handleDeleteNode(id: string, res: ServerResponse): Promise<void> {
    const existing = await this.config.store.get(id)
    if (!existing) {
      this.sendError(res, 404, `Node not found: ${id}`)
      return
    }

    await this.config.store.delete(id)
    this.sendJSON(res, 200, { success: true })
  }

  // ─── Query ───────────────────────────────────────────────────────────────────

  private async handleQuery(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await this.parseBody(req)
    if (!body.schema || typeof body.schema !== 'string') {
      this.sendError(res, 400, 'Missing required field: schema')
      return
    }

    const limit = typeof body.limit === 'number' ? body.limit : 50
    const offset = typeof body.offset === 'number' ? body.offset : 0

    // Note: Full filter support would require query engine
    // For now, we just support schema filtering
    const nodes = await this.config.store.list({
      schemaId: body.schema,
      limit,
      offset
    })

    this.sendJSON(res, 200, { nodes, count: nodes.length })
  }

  // ─── Events ──────────────────────────────────────────────────────────────────

  private handleGetEvents(url: URL, res: ServerResponse): void {
    const since = parseInt(url.searchParams.get('since') ?? '0', 10)
    const schemaId = url.searchParams.get('schema') ?? undefined

    const events = this.eventBuffer.getSince(since, schemaId)

    this.sendJSON(res, 200, {
      events,
      timestamp: Date.now()
    })
  }

  // ─── Schemas ─────────────────────────────────────────────────────────────────

  private async handleListSchemas(res: ServerResponse): Promise<void> {
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

    this.sendJSON(res, 200, {
      schemas: schemas.filter(Boolean)
    })
  }

  private async handleGetSchema(iri: string, res: ServerResponse): Promise<void> {
    const schema = await this.config.schemas.get(iri)
    if (!schema) {
      this.sendError(res, 404, `Schema not found: ${iri}`)
      return
    }

    this.sendJSON(res, 200, schema)
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {}
          resolve(parsed as Record<string, unknown>)
        } catch {
          reject(new Error('Invalid JSON body'))
        }
      })
      req.on('error', reject)
    })
  }

  private sendJSON(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(data))
  }

  private sendError(res: ServerResponse, status: number, message: string): void {
    this.sendJSON(res, status, { error: message })
  }

  private getEventType(changeType: string): 'created' | 'updated' | 'deleted' | null {
    // Change types map to event types
    if (changeType === 'node-change') {
      // We'd need to inspect the payload to differentiate, but for simplicity
      // we'll use 'updated' as a catch-all. In practice, the payload would
      // have a 'deleted' flag we could check.
      return 'updated'
    }
    return null
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create a local API server.
 *
 * @example
 * ```typescript
 * const api = createLocalAPI({
 *   port: 31415,
 *   store: nodeStore,
 *   schemas: schemaRegistry
 * })
 *
 * await api.start()
 * // Server is now listening on http://127.0.0.1:31415
 *
 * await api.stop()
 * ```
 */
export function createLocalAPI(config: LocalAPIConfig): LocalAPIServer {
  return new LocalAPIServer(config)
}
