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
import { type LocalAPIServer, createLocalAPI, type NodeStoreAPI } from '@xnetjs/plugins/node'
import { ipcMain } from 'electron'
import { DEFAULT_LOCAL_API_PORT, resolveLocalAPIPort } from './local-api-config'
import {
  createNodeStoreProxy,
  createSchemaRegistryProxy,
  setupStoreResponseHandler,
  type SchemaRegistryProxy
} from './renderer-store-proxy'

// ─── Module State ────────────────────────────────────────────────────────────

let apiServer: LocalAPIServer | null = null
let nodeStoreProxy: NodeStoreAPI | null = null
let schemaRegistryProxy: SchemaRegistryProxy | null = null
let configuredPort = DEFAULT_LOCAL_API_PORT

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

  // Create proxies over the renderer's real store and schema registry.
  nodeStoreProxy = createNodeStoreProxy()
  schemaRegistryProxy = createSchemaRegistryProxy()
  // Not awaited: this runs before `createWindow()`, and priming needs the
  // renderer. It retries in the background until the window answers.
  void schemaRegistryProxy.ensurePrimed().catch(() => undefined)

  // SEC-04: Enable token authentication by default
  const token = getOrCreateApiToken()
  configuredPort = resolveLocalAPIPort()

  // Create and start server
  apiServer = createLocalAPI({
    port: configuredPort,
    host: '127.0.0.1',
    store: nodeStoreProxy,
    schemas: schemaRegistryProxy,
    token // SEC-04: Authentication required
  })

  try {
    await apiServer.start()
    console.log(`[LocalAPI] Server started on http://127.0.0.1:${configuredPort}`)
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
  return apiServer?.port ?? configuredPort
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
  setupStoreResponseHandler()
}
