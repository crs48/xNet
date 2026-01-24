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
const bsmPortListeners = new Map<string, Set<(port: MessagePort) => void>>()

ipcRenderer.on('xnet:bsm:port', (event, { nodeId }: { nodeId: string }) => {
  const [port] = event.ports
  if (!port) return

  // Notify any waiting listeners
  const listeners = bsmPortListeners.get(nodeId)
  if (listeners) {
    for (const cb of listeners) cb(port)
    bsmPortListeners.delete(nodeId)
  }
})

contextBridge.exposeInMainWorld('xnetBSM', {
  start: (opts: { signalingUrl: string; authorDID?: string }) =>
    ipcRenderer.invoke('xnet:bsm:start', opts),
  stop: () => ipcRenderer.invoke('xnet:bsm:stop'),
  acquire: (nodeId: string, schemaId: string): Promise<MessagePort> => {
    return new Promise((resolve) => {
      // Register listener for incoming port BEFORE invoking acquire
      const listeners = bsmPortListeners.get(nodeId) ?? new Set()
      listeners.add(resolve)
      bsmPortListeners.set(nodeId, listeners)

      ipcRenderer.invoke('xnet:bsm:acquire', { nodeId, schemaId })
    })
  },
  release: (nodeId: string) => ipcRenderer.invoke('xnet:bsm:release', { nodeId }),
  track: (nodeId: string, schemaId: string) =>
    ipcRenderer.invoke('xnet:bsm:track', { nodeId, schemaId }),
  untrack: (nodeId: string) => ipcRenderer.invoke('xnet:bsm:untrack', { nodeId }),
  getStatus: () => ipcRenderer.invoke('xnet:bsm:status'),
  onStatusChange: (callback: (status: string) => void) => {
    const handler = (_: unknown, data: { status: string }) => callback(data.status)
    ipcRenderer.on('xnet:bsm:status-change', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:bsm:status-change', handler as (...args: unknown[]) => void)
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
  start(opts: { signalingUrl: string; authorDID?: string }): Promise<void>
  stop(): Promise<void>
  acquire(nodeId: string, schemaId: string): Promise<MessagePort>
  release(nodeId: string): Promise<void>
  track(nodeId: string, schemaId: string): Promise<void>
  untrack(nodeId: string): Promise<void>
  getStatus(): Promise<{
    status: string
    poolSize: number
    trackedCount: number
    queueSize: number
  }>
  onStatusChange(callback: (status: string) => void): () => void
}

declare global {
  interface Window {
    xnet: XNetAPI
    xnetStorage: XNetStorageAPI
    xnetBSM: XNetBSMAPI
  }
}
