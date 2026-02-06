/**
 * Local API Server setup for Electron
 *
 * Starts the LocalAPIServer in the main process to expose xNet data
 * to external integrations like N8N, MCP clients, and webhooks.
 *
 * SEC-03: Uses IPC instead of executeJavaScript to prevent code injection.
 * All parameters are passed as structured data, never interpolated into code.
 */

import crypto from 'node:crypto'
import {
  type LocalAPIServer,
  createLocalAPI,
  type NodeStoreAPI,
  type SchemaRegistryAPI,
  type NodeData
} from '@xnet/plugins/node'
import { ipcMain, BrowserWindow } from 'electron'

// ─── Module State ────────────────────────────────────────────────────────────

let apiServer: LocalAPIServer | null = null
let nodeStoreProxy: NodeStoreAPI | null = null
let schemaRegistryProxy: SchemaRegistryAPI | null = null

// Pending request callbacks - used to receive responses from renderer
let requestId = 0
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()

// ─── IPC-based Store Proxy ───────────────────────────────────────────────────

/**
 * Send a request to the renderer and wait for response.
 * SEC-03: All parameters passed as structured data via IPC, no code injection possible.
 */
async function sendStoreRequest<T>(operation: string, params: Record<string, unknown>): Promise<T> {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) {
    throw new Error('No window available')
  }

  const id = ++requestId
  return new Promise<T>((resolve, reject) => {
    // Set timeout to avoid hanging forever
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Store request timed out: ${operation}`))
    }, 30000)

    pendingRequests.set(id, {
      resolve: (value) => {
        clearTimeout(timeout)
        pendingRequests.delete(id)
        resolve(value as T)
      },
      reject: (error) => {
        clearTimeout(timeout)
        pendingRequests.delete(id)
        reject(error)
      }
    })

    // Send request to renderer via IPC
    win.webContents.send('xnet:localapi:store-request', { id, operation, params })
  })
}

/**
 * Creates a NodeStoreAPI that proxies calls to the renderer process via IPC.
 * SEC-03: Replaces executeJavaScript with structured IPC to prevent code injection.
 */
function createNodeStoreProxy(): NodeStoreAPI {
  // Listeners for store changes - will be populated by subscribe()
  const listeners = new Set<
    (event: { change: { type: string }; node: NodeData | null; isRemote: boolean }) => void
  >()

  return {
    get: async (id: string) => {
      return sendStoreRequest<NodeData | null>('get', { id })
    },

    list: async (options?: { schemaId?: string; limit?: number; offset?: number }) => {
      return sendStoreRequest<NodeData[]>('list', {
        schemaId: options?.schemaId,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0
      })
    },

    create: async (options: { schemaId: string; properties: Record<string, unknown> }) => {
      return sendStoreRequest<NodeData>('create', {
        schemaId: options.schemaId,
        properties: options.properties
      })
    },

    update: async (id: string, options: { properties: Record<string, unknown> }) => {
      return sendStoreRequest<NodeData>('update', {
        id,
        properties: options.properties
      })
    },

    delete: async (id: string) => {
      await sendStoreRequest<void>('delete', { id })
    },

    subscribe: (
      listener: (event: {
        change: { type: string }
        node: NodeData | null
        isRemote: boolean
      }) => void
    ) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

/**
 * Creates a SchemaRegistryAPI that returns core schemas.
 * In the future, this could also proxy to the renderer for dynamic schemas.
 */
function createSchemaRegistryProxy(): SchemaRegistryAPI {
  // Core schemas that are always available
  const coreSchemas = new Map([
    ['xnet://xnet.dev/Schema', { iri: 'xnet://xnet.dev/Schema', name: 'Schema', properties: {} }],
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
    ],
    [
      'xnet://xnet.dev/Note',
      {
        iri: 'xnet://xnet.dev/Note',
        name: 'Note',
        properties: { title: { type: 'text' }, content: { type: 'richtext' } }
      }
    ]
  ])

  return {
    getAllIRIs: () => Array.from(coreSchemas.keys()),
    get: async (iri: string) => coreSchemas.get(iri) ?? null
  }
}

// ─── API Server Lifecycle ────────────────────────────────────────────────────

// SEC-04: API authentication token
// Generated once per session if not provided via environment
let apiToken: string | null = null

/**
 * Get or generate the API token for authentication.
 * SEC-04: Token is required by default for security.
 */
function getOrCreateApiToken(): string {
  if (apiToken) return apiToken

  // Use environment variable if provided
  if (process.env.XNET_API_TOKEN) {
    apiToken = process.env.XNET_API_TOKEN
    return apiToken
  }

  // Generate a random token for this session
  apiToken = crypto.randomUUID()
  return apiToken
}

/**
 * Start the Local API server.
 * Call this after the app is ready.
 */
export async function startLocalAPI(): Promise<void> {
  if (apiServer) {
    console.log('[LocalAPI] Server already running')
    return
  }

  // Create proxies
  nodeStoreProxy = createNodeStoreProxy()
  schemaRegistryProxy = createSchemaRegistryProxy()

  // SEC-04: Enable token authentication by default
  const token = getOrCreateApiToken()

  // Create and start server
  apiServer = createLocalAPI({
    port: 31415,
    host: '127.0.0.1',
    store: nodeStoreProxy,
    schemas: schemaRegistryProxy,
    token // SEC-04: Authentication required
  })

  try {
    await apiServer.start()
    console.log('[LocalAPI] Server started on http://127.0.0.1:31415')
    console.log('[LocalAPI] API Token:', token)
  } catch (err) {
    console.error('[LocalAPI] Failed to start server:', err)
    apiServer = null
  }
}

/**
 * Stop the Local API server.
 * Call this before app quit.
 */
export async function stopLocalAPI(): Promise<void> {
  if (apiServer) {
    await apiServer.stop()
    apiServer = null
    nodeStoreProxy = null
    schemaRegistryProxy = null
    console.log('[LocalAPI] Server stopped')
  }
}

/**
 * Check if the API server is running.
 */
export function isLocalAPIRunning(): boolean {
  return apiServer?.isRunning ?? false
}

/**
 * Get the API server port.
 */
export function getLocalAPIPort(): number {
  return apiServer?.port ?? 31415
}

/**
 * Get the API token (SEC-04).
 * Returns null if server is not running.
 */
export function getLocalAPIToken(): string | null {
  return apiServer?.isRunning ? apiToken : null
}

// ─── IPC Handlers for Renderer Access ────────────────────────────────────────

/**
 * Setup IPC handlers for the Local API.
 * This allows the renderer to check status and control the API server.
 *
 * SEC-03: Also sets up the IPC response handler for store operations,
 * enabling secure communication without executeJavaScript.
 */
export function setupLocalAPIIPC(): void {
  ipcMain.handle('xnet:localapi:status', () => ({
    running: isLocalAPIRunning(),
    port: getLocalAPIPort(),
    token: getLocalAPIToken() // SEC-04: Include token in status
  }))

  ipcMain.handle('xnet:localapi:start', async () => {
    await startLocalAPI()
    return { running: isLocalAPIRunning(), port: getLocalAPIPort(), token: getLocalAPIToken() }
  })

  ipcMain.handle('xnet:localapi:stop', async () => {
    await stopLocalAPI()
    return { running: isLocalAPIRunning() }
  })

  // SEC-03: Handle store operation responses from renderer
  // This replaces the vulnerable executeJavaScript approach
  ipcMain.on(
    'xnet:localapi:store-response',
    (_, response: { id: number; result?: unknown; error?: string }) => {
      const pending = pendingRequests.get(response.id)
      if (!pending) return

      if (response.error) {
        pending.reject(new Error(response.error))
      } else {
        pending.resolve(response.result)
      }
    }
  )
}
