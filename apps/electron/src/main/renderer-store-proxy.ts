/**
 * The main process's view of the renderer's live NodeStore and SchemaRegistry.
 *
 * Only the renderer holds the real store (it owns the `XNetProvider` runtime),
 * so anything in the main process that wants workspace data — the local API
 * (`local-api.ts`) and the agent MCP server (`agent-mcp-server.ts`) — asks for
 * it over one structured IPC channel: `xnet:localapi:store-request` out,
 * `xnet:localapi:store-response` back.
 *
 * SEC-03: parameters travel as structured data and are never interpolated into
 * code, so a hostile local API caller cannot inject script into the renderer.
 */

import type { NodeData, NodeStoreAPI, SchemaData, SchemaRegistryAPI } from '@xnetjs/plugins/node'
import { BrowserWindow, ipcMain } from 'electron'

/** How long a single renderer round trip may take before we give up on it. */
const REQUEST_TIMEOUT_MS = 30_000

let requestId = 0
const pendingRequests = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()

/**
 * Send one operation to the renderer and await its reply.
 *
 * Rejects rather than resolving to a placeholder: a timed-out or window-less
 * request means "unreadable", which callers must be able to tell apart from
 * "absent".
 */
export async function sendStoreRequest<T>(
  operation: string,
  params: Record<string, unknown>
): Promise<T> {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('No window available')

  const id = ++requestId
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error(`Store request timed out: ${operation}`))
    }, REQUEST_TIMEOUT_MS)

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

    win.webContents.send('xnet:localapi:store-request', { id, operation, params })
  })
}

let responseHandlerInstalled = false

/**
 * Register the single IPC listener that resolves in-flight store requests.
 *
 * Idempotent: both the local API and the agent MCP server depend on the
 * channel, and either may be the first to need it.
 */
export function setupStoreResponseHandler(): void {
  if (responseHandlerInstalled) return
  responseHandlerInstalled = true
  ipcMain.on(
    'xnet:localapi:store-response',
    (_, response: { id: number; result?: unknown; error?: string }) => {
      const pending = pendingRequests.get(response.id)
      if (!pending) return
      if (response.error) pending.reject(new Error(response.error))
      else pending.resolve(response.result)
    }
  )
}

/** A NodeStoreAPI backed by the renderer's real store. */
export function createNodeStoreProxy(): NodeStoreAPI {
  const listeners = new Set<
    (event: { change: { type: string }; node: NodeData | null; isRemote: boolean }) => void
  >()

  return {
    get: (id: string) => sendStoreRequest<NodeData | null>('get', { id }),

    list: (options?: { schemaId?: string; limit?: number; offset?: number }) =>
      sendStoreRequest<NodeData[]>('list', {
        schemaId: options?.schemaId,
        limit: options?.limit ?? 50,
        offset: options?.offset ?? 0
      }),

    create: (options: { schemaId: string; properties: Record<string, unknown> }) =>
      sendStoreRequest<NodeData>('create', {
        schemaId: options.schemaId,
        properties: options.properties
      }),

    update: (id: string, options: { properties: Record<string, unknown> }) =>
      sendStoreRequest<NodeData>('update', { id, properties: options.properties }),

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
 * A SchemaRegistryAPI backed by the renderer's real `schemaRegistry`.
 *
 * `getAllIRIs()` is synchronous in the API but the registry lives an IPC hop
 * away, so the IRI list is cached. {@link SchemaRegistryProxy.prime} fills the
 * cache before the proxy is served to anyone; until then `getAllIRIs()`
 * **throws** rather than returning `[]`, because an empty array here would be
 * indistinguishable from a workspace that genuinely has no schemas.
 */
export interface SchemaRegistryProxy extends SchemaRegistryAPI {
  /**
   * Start filling the IRI cache, retrying until the renderer answers. Safe to
   * call before the window exists — callers need not await it, and both
   * subsystems start well before `createWindow()`.
   */
  ensurePrimed(): Promise<void>
}

/** How long to keep waiting for the renderer before giving up on priming. */
const PRIME_TIMEOUT_MS = 60_000
const PRIME_RETRY_MS = 500

export function createSchemaRegistryProxy(): SchemaRegistryProxy {
  let cachedIris: string[] | null = null
  let priming: Promise<void> | undefined

  const primeWithRetry = async (): Promise<void> => {
    const deadline = Date.now() + PRIME_TIMEOUT_MS
    for (;;) {
      try {
        cachedIris = await sendStoreRequest<string[]>('schemas.list', {})
        return
      } catch (err) {
        // Expected until the window exists and its store handler has mounted.
        if (Date.now() >= deadline) throw err
        await new Promise((resolve) => setTimeout(resolve, PRIME_RETRY_MS))
      }
    }
  }

  return {
    ensurePrimed() {
      priming ??= primeWithRetry()
      return priming
    },

    getAllIRIs() {
      // Never []: an empty list would be indistinguishable from a workspace
      // that genuinely has no schemas, so an unprimed cache fails loudly.
      if (cachedIris === null) {
        throw new Error(
          'Schema registry not primed: the renderer has not reported its schemas yet.'
        )
      }
      return cachedIris
    },

    async get(iri: string) {
      return sendStoreRequest<SchemaData | null>('schemas.get', { iri })
    }
  }
}
