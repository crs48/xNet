/**
 * Preload script - exposes xNet API to renderer
 */
import { contextBridge, ipcRenderer } from 'electron'

// Expose xNet API to renderer
contextBridge.exposeInMainWorld('xnet', {
  getProfile: () => ipcRenderer.invoke('xnet:getProfile'),
  init: () => ipcRenderer.invoke('xnet:init'),
  createDocument: (options: { workspace: string; type: string; title: string }) =>
    ipcRenderer.invoke('xnet:createDocument', options),
  getDocument: (id: string) => ipcRenderer.invoke('xnet:getDocument', id),
  listDocuments: (workspace?: string) => ipcRenderer.invoke('xnet:listDocuments', workspace),
  deleteDocument: (id: string) => ipcRenderer.invoke('xnet:deleteDocument', id),
  query: (query: unknown) => ipcRenderer.invoke('xnet:query', query),
  search: (text: string, limit?: number) => ipcRenderer.invoke('xnet:search', text, limit),
  getSyncStatus: () => ipcRenderer.invoke('xnet:getSyncStatus'),
  stop: () => ipcRenderer.invoke('xnet:stop'),

  // Menu events
  onNewPage: (callback: () => void) => {
    ipcRenderer.on('menu:new-page', callback)
    return () => ipcRenderer.removeListener('menu:new-page', callback)
  },

  // DevTools toggle from menu
  onDevToolsToggle: (callback: () => void) => {
    ipcRenderer.on('devtools:toggle', callback)
    return () => ipcRenderer.removeListener('devtools:toggle', callback)
  }
})

// Expose BSM API for background sync
// MessagePorts can't cross contextBridge, so we manage them here in preload
const bsmPorts = new Map<string, MessagePort>()
const bsmPortReadyCallbacks = new Map<string, Set<() => void>>()
const bsmMessageHandlers = new Map<string, (data: unknown) => void>()

ipcRenderer.on('xnet:bsm:port', (event, { nodeId }: { nodeId: string }) => {
  const [port] = event.ports
  if (!port) return

  // Set up message forwarding to renderer
  port.onmessage = (msgEvent) => {
    const handler = bsmMessageHandlers.get(nodeId)
    if (handler) handler(msgEvent.data)
  }
  port.start()
  bsmPorts.set(nodeId, port)

  // Notify any waiting callbacks that port is ready
  const callbacks = bsmPortReadyCallbacks.get(nodeId)
  if (callbacks) {
    for (const cb of callbacks) cb()
    bsmPortReadyCallbacks.delete(nodeId)
  }
})

contextBridge.exposeInMainWorld('xnetBSM', {
  start: (opts: { signalingUrl: string; authorDID?: string; signingKey?: number[] }) =>
    ipcRenderer.invoke('xnet:bsm:start', opts),
  stop: () => ipcRenderer.invoke('xnet:bsm:stop'),
  acquire: (nodeId: string, schemaId: string): Promise<void> => {
    return new Promise((resolve) => {
      // If port already exists, resolve immediately
      if (bsmPorts.has(nodeId)) {
        resolve()
        return
      }

      // Register callback for when port is ready
      const callbacks = bsmPortReadyCallbacks.get(nodeId) ?? new Set()
      callbacks.add(resolve)
      bsmPortReadyCallbacks.set(nodeId, callbacks)

      ipcRenderer.invoke('xnet:bsm:acquire', { nodeId, schemaId })
    })
  },
  release: (nodeId: string) => {
    const port = bsmPorts.get(nodeId)
    if (port) {
      port.close()
      bsmPorts.delete(nodeId)
    }
    bsmMessageHandlers.delete(nodeId)
    return ipcRenderer.invoke('xnet:bsm:release', { nodeId })
  },
  // Send a message to the main process for this node
  postMessage: (nodeId: string, data: unknown) => {
    const port = bsmPorts.get(nodeId)
    if (port) port.postMessage(data)
  },
  // Set up a message handler for this node
  onMessage: (nodeId: string, handler: (data: unknown) => void) => {
    bsmMessageHandlers.set(nodeId, handler)
    return () => bsmMessageHandlers.delete(nodeId)
  },
  track: (nodeId: string, schemaId: string) =>
    ipcRenderer.invoke('xnet:bsm:track', { nodeId, schemaId }),
  untrack: (nodeId: string) => ipcRenderer.invoke('xnet:bsm:untrack', { nodeId }),
  getStatus: () => ipcRenderer.invoke('xnet:bsm:status'),
  onStatusChange: (callback: (status: string) => void) => {
    const handler = (_: unknown, data: { status: string }) => callback(data.status)
    ipcRenderer.on('xnet:bsm:status-change', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:bsm:status-change', handler as (...args: unknown[]) => void)
  },
  onPeerConnected: (callback: (peerId: string, room: string, totalPeers: number) => void) => {
    const handler = (_: unknown, data: { peerId: string; room: string; totalPeers: number }) =>
      callback(data.peerId, data.room, data.totalPeers)
    ipcRenderer.on('xnet:bsm:peer-connected', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:bsm:peer-connected', handler as (...args: unknown[]) => void)
  },
  onPeerDisconnected: (callback: (peerId: string, reason: string, totalPeers: number) => void) => {
    const handler = (_: unknown, data: { peerId: string; reason: string; totalPeers: number }) =>
      callback(data.peerId, data.reason, data.totalPeers)
    ipcRenderer.on('xnet:bsm:peer-disconnected', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener(
        'xnet:bsm:peer-disconnected',
        handler as (...args: unknown[]) => void
      )
  },
  // Blob sync methods
  requestBlobs: (cids: string[]) => ipcRenderer.invoke('xnet:bsm:request-blobs', { cids }),
  announceBlobs: (cids: string[]) => ipcRenderer.invoke('xnet:bsm:announce-blobs', { cids }),
  // Blob storage methods (for renderer to access main process blob storage)
  getBlob: (cid: string) => ipcRenderer.invoke('xnet:bsm:get-blob', { cid }),
  putBlob: (data: number[]) => ipcRenderer.invoke('xnet:bsm:put-blob', { data }),
  hasBlob: (cid: string) => ipcRenderer.invoke('xnet:bsm:has-blob', { cid }),
  // Subscribe to blob received events
  onBlobReceived: (callback: (cid: string) => void) => {
    const handler = (_: unknown, data: { cid: string }) => callback(data.cid)
    ipcRenderer.on('xnet:bsm:blob-received', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:bsm:blob-received', handler as (...args: unknown[]) => void)
  },
  // Debug logging control
  setDebug: (enabled: boolean) => ipcRenderer.invoke('xnet:bsm:set-debug', enabled),
  getDebug: () => ipcRenderer.invoke('xnet:bsm:get-debug')
})

// Allowed IPC channels for xnetServices (SEC-02: prevent arbitrary IPC access)
const ALLOWED_SERVICE_CHANNELS = new Set([
  // Plugin service channels
  'xnet:service:start',
  'xnet:service:stop',
  'xnet:service:status',
  'xnet:service:list',
  // Node operations
  'xnet:node:create',
  'xnet:node:get',
  'xnet:node:update',
  'xnet:node:delete',
  'xnet:node:list',
  // Schema operations
  'xnet:schema:get',
  'xnet:schema:list',
  // Query operations
  'xnet:query:execute'
])

// Expose service API for plugin background processes
contextBridge.exposeInMainWorld('xnetServices', {
  invoke: <T>(channel: string, ...args: unknown[]): Promise<T> => {
    if (!ALLOWED_SERVICE_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, handler: (...args: unknown[]) => void): void => {
    if (!ALLOWED_SERVICE_CHANNELS.has(channel)) {
      console.warn(`IPC channel not allowed for subscription: ${channel}`)
      return
    }
    ipcRenderer.on(channel, (_event, ...args) => handler(...args))
  },
  off: (channel: string, handler: (...args: unknown[]) => void): void => {
    ipcRenderer.removeListener(channel, handler)
  }
})

// Expose storage API for @xnet/react integration
contextBridge.exposeInMainWorld('xnetStorage', {
  getDocument: (id: string) => ipcRenderer.invoke('xnet:storage:getDocument', id),
  setDocument: (id: string, data: unknown) =>
    ipcRenderer.invoke('xnet:storage:setDocument', id, data),
  deleteDocument: (id: string) => ipcRenderer.invoke('xnet:storage:deleteDocument', id),
  listDocuments: (prefix?: string) => ipcRenderer.invoke('xnet:storage:listDocuments', prefix)
})

// Expose Local API status/control for renderer
contextBridge.exposeInMainWorld('xnetLocalAPI', {
  status: () => ipcRenderer.invoke('xnet:localapi:status'),
  start: () => ipcRenderer.invoke('xnet:localapi:start'),
  stop: () => ipcRenderer.invoke('xnet:localapi:stop')
})

// Type declaration for renderer
export interface XNetAPI {
  getProfile(): Promise<string>
  init(): Promise<{ did: string }>
  createDocument(options: {
    workspace: string
    type: string
    title: string
  }): Promise<{ id: string; title: string }>
  getDocument(id: string): Promise<{
    id: string
    type: string
    workspace: string
    title: string
    content: string
  } | null>
  listDocuments(workspace?: string): Promise<string[]>
  deleteDocument(id: string): Promise<void>
  query(query: unknown): Promise<unknown>
  search(text: string, limit?: number): Promise<{ id: string; title: string; score: number }[]>
  getSyncStatus(): Promise<{ status: string; peers: string[] }>
  stop(): Promise<void>
  onNewPage(callback: () => void): () => void
  onDevToolsToggle(callback: () => void): () => void
}

export interface DocumentData {
  id: string
  content: Uint8Array
  metadata: {
    created: number
    updated: number
    type?: string
    workspace?: string
  }
  version: number
}

export interface XNetStorageAPI {
  getDocument(id: string): Promise<DocumentData | null>
  setDocument(id: string, data: DocumentData): Promise<void>
  deleteDocument(id: string): Promise<void>
  listDocuments(prefix?: string): Promise<string[]>
}

export interface XNetBSMAPI {
  start(opts: { signalingUrl: string; authorDID?: string; signingKey?: number[] }): Promise<void>
  stop(): Promise<void>
  acquire(nodeId: string, schemaId: string): Promise<void>
  release(nodeId: string): Promise<void>
  postMessage(nodeId: string, data: unknown): void
  onMessage(nodeId: string, handler: (data: unknown) => void): () => void
  track(nodeId: string, schemaId: string): Promise<void>
  untrack(nodeId: string): Promise<void>
  getStatus(): Promise<{
    status: string
    poolSize: number
    trackedCount: number
    queueSize: number
  }>
  onStatusChange(callback: (status: string) => void): () => void
  onPeerConnected(callback: (peerId: string, room: string, totalPeers: number) => void): () => void
  onPeerDisconnected(
    callback: (peerId: string, reason: string, totalPeers: number) => void
  ): () => void
  // Blob sync
  requestBlobs(cids: string[]): Promise<void>
  announceBlobs(cids: string[]): Promise<void>
  // Blob storage
  getBlob(cid: string): Promise<number[] | null>
  putBlob(data: number[]): Promise<string>
  hasBlob(cid: string): Promise<boolean>
  onBlobReceived(callback: (cid: string) => void): () => void
  // Debug logging control
  setDebug(enabled: boolean): Promise<void>
  getDebug(): Promise<boolean>
}

export interface XNetServicesAPI {
  invoke<T>(channel: string, ...args: unknown[]): Promise<T>
  on(channel: string, handler: (...args: unknown[]) => void): void
  off(channel: string, handler: (...args: unknown[]) => void): void
}

export interface XNetLocalAPIStatus {
  running: boolean
  port: number
}

export interface XNetLocalAPIAPI {
  status(): Promise<XNetLocalAPIStatus>
  start(): Promise<XNetLocalAPIStatus>
  stop(): Promise<{ running: boolean }>
}

declare global {
  interface Window {
    xnet: XNetAPI
    xnetStorage: XNetStorageAPI
    xnetBSM: XNetBSMAPI
    xnetServices: XNetServicesAPI
    xnetLocalAPI: XNetLocalAPIAPI
  }
}
