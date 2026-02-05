/**
 * Local API Server setup for Electron
 *
 * Starts the LocalAPIServer in the main process to expose xNet data
 * to external integrations like N8N, MCP clients, and webhooks.
 */

import { ipcMain, BrowserWindow } from 'electron'
import {
  type LocalAPIServer,
  createLocalAPI,
  type NodeStoreAPI,
  type SchemaRegistryAPI,
  type NodeData
} from '@xnet/plugins/node'

// ─── Module State ────────────────────────────────────────────────────────────

let apiServer: LocalAPIServer | null = null
let nodeStoreProxy: NodeStoreAPI | null = null
let schemaRegistryProxy: SchemaRegistryAPI | null = null

// ─── IPC-based Store Proxy ───────────────────────────────────────────────────

/**
 * Creates a NodeStoreAPI that proxies calls to the renderer process.
 * This allows the main process LocalAPIServer to access data managed by React.
 */
function createNodeStoreProxy(): NodeStoreAPI {
  const getWindow = () => BrowserWindow.getAllWindows()[0]

  // Listeners for store changes - will be populated by subscribe()
  const listeners = new Set<
    (event: { change: { type: string }; node: NodeData | null; isRemote: boolean }) => void
  >()

  return {
    get: async (id: string) => {
      const win = getWindow()
      if (!win) return null
      return win.webContents.executeJavaScript(`
        (async () => {
          const store = window.__xnetNodeStore;
          if (!store) return null;
          const node = await store.get('${id}');
          if (!node) return null;
          return {
            id: node.id,
            schemaId: node.schemaId,
            properties: node.properties,
            deleted: node.deleted,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
          };
        })()
      `)
    },

    list: async (options?: { schemaId?: string; limit?: number; offset?: number }) => {
      const win = getWindow()
      if (!win) return []
      const schemaId = options?.schemaId ?? ''
      const limit = options?.limit ?? 50
      const offset = options?.offset ?? 0
      return win.webContents.executeJavaScript(`
        (async () => {
          const store = window.__xnetNodeStore;
          if (!store) return [];
          const nodes = await store.list({
            schemaId: '${schemaId}' || undefined,
            limit: ${limit},
            offset: ${offset}
          });
          return nodes.map(n => ({
            id: n.id,
            schemaId: n.schemaId,
            properties: n.properties,
            deleted: n.deleted,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt
          }));
        })()
      `)
    },

    create: async (options: { schemaId: string; properties: Record<string, unknown> }) => {
      const win = getWindow()
      if (!win) throw new Error('No window available')
      const propsJson = JSON.stringify(options.properties)
      const node = await win.webContents.executeJavaScript(`
        (async () => {
          const store = window.__xnetNodeStore;
          if (!store) throw new Error('NodeStore not available');
          const node = await store.create({
            schemaId: '${options.schemaId}',
            properties: ${propsJson}
          });
          return {
            id: node.id,
            schemaId: node.schemaId,
            properties: node.properties,
            deleted: node.deleted,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
          };
        })()
      `)
      return node
    },

    update: async (id: string, options: { properties: Record<string, unknown> }) => {
      const win = getWindow()
      if (!win) throw new Error('No window available')
      const propsJson = JSON.stringify(options.properties)
      const node = await win.webContents.executeJavaScript(`
        (async () => {
          const store = window.__xnetNodeStore;
          if (!store) throw new Error('NodeStore not available');
          const node = await store.update('${id}', { properties: ${propsJson} });
          return {
            id: node.id,
            schemaId: node.schemaId,
            properties: node.properties,
            deleted: node.deleted,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
          };
        })()
      `)
      return node
    },

    delete: async (id: string) => {
      const win = getWindow()
      if (!win) throw new Error('No window available')
      await win.webContents.executeJavaScript(`
        (async () => {
          const store = window.__xnetNodeStore;
          if (!store) throw new Error('NodeStore not available');
          await store.delete('${id}');
        })()
      `)
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

  // Create and start server
  apiServer = createLocalAPI({
    port: 31415,
    host: '127.0.0.1',
    store: nodeStoreProxy,
    schemas: schemaRegistryProxy
    // token: process.env.XNET_API_TOKEN // Optional auth
  })

  try {
    await apiServer.start()
    console.log('[LocalAPI] Server started on http://127.0.0.1:31415')
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

// ─── IPC Handlers for Renderer Access ────────────────────────────────────────

/**
 * Setup IPC handlers for the Local API.
 * This allows the renderer to check status and control the API server.
 */
export function setupLocalAPIIPC(): void {
  ipcMain.handle('xnet:localapi:status', () => ({
    running: isLocalAPIRunning(),
    port: getLocalAPIPort()
  }))

  ipcMain.handle('xnet:localapi:start', async () => {
    await startLocalAPI()
    return { running: isLocalAPIRunning(), port: getLocalAPIPort() }
  })

  ipcMain.handle('xnet:localapi:stop', async () => {
    await stopLocalAPI()
    return { running: isLocalAPIRunning() }
  })
}
