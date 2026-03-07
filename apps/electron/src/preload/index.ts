/**
 * Preload script - exposes xNet API to renderer
 */
import type { SyncReplicationConfig } from '@xnetjs/sync'
import { contextBridge, ipcRenderer } from 'electron'

// Expose xNet API to renderer
contextBridge.exposeInMainWorld('xnet', {
  getProfile: () => ipcRenderer.invoke('xnet:getProfile'),
  setSeedPhrase: (mnemonic: string) => ipcRenderer.invoke('xnet:seed:set', { mnemonic }),
  getSeedPhrase: () => ipcRenderer.invoke('xnet:seed:get'),
  clearSeedPhrase: () => ipcRenderer.invoke('xnet:seed:clear'),

  // Menu events
  onNewPage: (callback: () => void) => {
    ipcRenderer.on('menu:new-page', callback)
    return () => ipcRenderer.removeListener('menu:new-page', callback)
  },

  // DevTools toggle from menu
  onDevToolsToggle: (callback: () => void) => {
    ipcRenderer.on('devtools:toggle', callback)
    return () => ipcRenderer.removeListener('devtools:toggle', callback)
  },

  onSharePayload: (callback: (payload: string) => void) => {
    const handler = (_: unknown, data: { payload: string }) => callback(data.payload)
    ipcRenderer.on('xnet:share-payload', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:share-payload', handler as (...args: unknown[]) => void)
  }
})

// Expose BSM API for background sync
// MessagePorts can't cross contextBridge, so we manage them here in preload

// Data channel: single MessagePort to data utility process (multiplexed)
let dataChannel: MessagePort | null = null
const dataChannelReadyCallbacks = new Set<() => void>()

// Per-node state management
const acquiredNodes = new Set<string>()
const bsmPortReadyCallbacks = new Map<string, Set<() => void>>()
const bsmMessageHandlers = new Map<string, (data: unknown) => void>()

// Handle data-channel setup from main process
ipcRenderer.on('data-channel', (event, _payload: { windowId: number }) => {
  const [port] = event.ports
  if (!port) return

  // Close existing channel if any
  if (dataChannel) {
    dataChannel.close()
  }

  dataChannel = port

  // Set up message routing from data process to appropriate handlers
  dataChannel.onmessage = (msgEvent) => {
    const { type, nodeId, ...rest } = msgEvent.data as {
      type: string
      nodeId?: string
      [key: string]: unknown
    }

    if (!nodeId) return

    // Route to the appropriate handler based on message type
    const handler = bsmMessageHandlers.get(nodeId)
    if (handler) {
      if (type === 'update') {
        // Forward Yjs updates to renderer
        handler({ type: 'update', update: rest.update })
      } else if (type === 'awareness') {
        handler({ type: 'awareness', update: rest.update })
      } else if (type === 'awareness-snapshot') {
        handler({ type: 'awareness-snapshot', users: rest.users })
      } else if (type === 'request-awareness') {
        handler({ type: 'request-awareness' })
      }
    }
  }

  dataChannel.start()

  // Notify any waiting callbacks that channel is ready
  for (const cb of dataChannelReadyCallbacks) cb()
  dataChannelReadyCallbacks.clear()
})

// Legacy per-node port handler (for backward compatibility during transition)
ipcRenderer.on('xnet:bsm:port', (_event, { nodeId }: { nodeId: string }) => {
  // Mark this node as acquired (port setup happens via data-channel now)
  acquiredNodes.add(nodeId)

  // Notify any waiting callbacks that port is ready
  const callbacks = bsmPortReadyCallbacks.get(nodeId)
  if (callbacks) {
    for (const cb of callbacks) cb()
    bsmPortReadyCallbacks.delete(nodeId)
  }
})

contextBridge.exposeInMainWorld('xnetBSM', {
  start: (opts: {
    signalingUrl: string
    authorDID?: string
    signingKey?: number[]
    replication?: SyncReplicationConfig
    ucanToken?: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }) => ipcRenderer.invoke('xnet:bsm:start', opts),
  reconfigure: (opts: {
    signalingUrl: string
    authorDID?: string
    signingKey?: number[]
    replication?: SyncReplicationConfig
    ucanToken?: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }) => ipcRenderer.invoke('xnet:bsm:reconfigure', opts),
  stop: () => ipcRenderer.invoke('xnet:bsm:stop'),
  acquire: (nodeId: string, schemaId: string): Promise<void> => {
    return new Promise((resolve) => {
      // If already acquired, resolve immediately
      if (acquiredNodes.has(nodeId)) {
        resolve()
        return
      }

      // Register callback for when node is ready
      const callbacks = bsmPortReadyCallbacks.get(nodeId) ?? new Set()
      callbacks.add(resolve)
      bsmPortReadyCallbacks.set(nodeId, callbacks)

      ipcRenderer.invoke('xnet:bsm:acquire', { nodeId, schemaId })
    })
  },
  release: (nodeId: string) => {
    acquiredNodes.delete(nodeId)
    bsmMessageHandlers.delete(nodeId)
    return ipcRenderer.invoke('xnet:bsm:release', { nodeId })
  },
  // Send a message to the data process for this node via the shared channel
  postMessage: (nodeId: string, data: unknown) => {
    if (dataChannel && acquiredNodes.has(nodeId)) {
      // Include nodeId in the message so data process can route it
      const payload = typeof data === 'object' && data !== null ? data : { value: data }
      dataChannel.postMessage({ ...payload, nodeId })
    }
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
  onTransportFallback: (
    callback: (payload: { from: string; to: string; reason: string }) => void
  ) => {
    const handler = (_: unknown, payload: { from: string; to: string; reason: string }) =>
      callback(payload)
    ipcRenderer.on('xnet:bsm:transport-fallback', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener(
        'xnet:bsm:transport-fallback',
        handler as (...args: unknown[]) => void
      )
  },
  onUnauthorizedUpdate: (
    callback: (payload: {
      code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED'
      resource: string | null
      action: string
      scorerAction: 'allow' | 'warn' | 'throttle' | 'block'
    }) => void
  ) => {
    const handler = (
      _: unknown,
      payload: {
        code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED'
        resource: string | null
        action: string
        scorerAction: 'allow' | 'warn' | 'throttle' | 'block'
      }
    ) => callback(payload)
    ipcRenderer.on('xnet:bsm:unauthorized-update', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener(
        'xnet:bsm:unauthorized-update',
        handler as (...args: unknown[]) => void
      )
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
  'xnet:service:list'
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

// Expose Local API status/control for renderer
contextBridge.exposeInMainWorld('xnetLocalAPI', {
  status: () => ipcRenderer.invoke('xnet:localapi:status'),
  start: () => ipcRenderer.invoke('xnet:localapi:start'),
  stop: () => ipcRenderer.invoke('xnet:localapi:stop'),
  // SEC-03: Register store request handler for Local API
  // This enables secure IPC-based store access instead of executeJavaScript
  onStoreRequest: (
    handler: (request: {
      id: number
      operation: string
      params: Record<string, unknown>
    }) => Promise<unknown>
  ) => {
    const listener = async (
      _: unknown,
      request: { id: number; operation: string; params: Record<string, unknown> }
    ) => {
      try {
        const result = await handler(request)
        ipcRenderer.send('xnet:localapi:store-response', { id: request.id, result })
      } catch (err) {
        ipcRenderer.send('xnet:localapi:store-response', {
          id: request.id,
          error: err instanceof Error ? err.message : String(err)
        })
      }
    }
    ipcRenderer.on('xnet:localapi:store-request', listener as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener(
        'xnet:localapi:store-request',
        listener as (...args: unknown[]) => void
      )
  }
})

contextBridge.exposeInMainWorld('xnetTunnel', {
  start: (options?: {
    mode?: 'temporary' | 'persistent'
    targetUrl?: string
    tunnelName?: string
    hostname?: string
    token?: string
  }) => ipcRenderer.invoke('xnet:tunnel:start', options),
  stop: () => ipcRenderer.invoke('xnet:tunnel:stop'),
  status: () => ipcRenderer.invoke('xnet:tunnel:status'),
  onHealthChange: (
    callback: (status: {
      health: 'starting' | 'ready' | 'degraded' | 'stopped'
      mode: 'temporary' | 'persistent' | null
      endpoint: string | null
      pid: number | null
      startedAt: number | null
      message: string | null
    }) => void
  ) => {
    const handler = (_: unknown, status: unknown) => callback(status as never)
    ipcRenderer.on('xnet:tunnel:health', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:tunnel:health', handler as (...args: unknown[]) => void)
  }
})

// ─── Node Storage IPC API ────────────────────────────────────────────────────
// Routes NodeStore operations to the data process SQLite database via IPC.
// This enables persistent node storage in Electron (replacing MemoryNodeStorageAdapter).

contextBridge.exposeInMainWorld('xnetNodes', {
  // Change log operations
  appendChange: (change: unknown) => ipcRenderer.invoke('xnet:nodes:appendChange', { change }),
  getChanges: (nodeId: string) => ipcRenderer.invoke('xnet:nodes:getChanges', { nodeId }),
  getAllChanges: () => ipcRenderer.invoke('xnet:nodes:getAllChanges'),
  getChangesSince: (sinceLamport: number) =>
    ipcRenderer.invoke('xnet:nodes:getChangesSince', { sinceLamport }),
  getChangeByHash: (hash: string) => ipcRenderer.invoke('xnet:nodes:getChangeByHash', { hash }),
  getLastChange: (nodeId: string) => ipcRenderer.invoke('xnet:nodes:getLastChange', { nodeId }),

  // Materialized state operations
  getNode: (id: string) => ipcRenderer.invoke('xnet:nodes:getNode', { id }),
  setNode: (node: unknown) => ipcRenderer.invoke('xnet:nodes:setNode', { node }),
  deleteNode: (id: string) => ipcRenderer.invoke('xnet:nodes:deleteNode', { id }),
  listNodes: (options?: unknown) => ipcRenderer.invoke('xnet:nodes:listNodes', options ?? {}),
  countNodes: (options?: unknown) => ipcRenderer.invoke('xnet:nodes:countNodes', options ?? {}),

  // Sync state
  getLastLamportTime: () => ipcRenderer.invoke('xnet:nodes:getLastLamportTime'),
  setLastLamportTime: (time: number) =>
    ipcRenderer.invoke('xnet:nodes:setLastLamportTime', { time }),

  // Document content operations
  getDocumentContent: (nodeId: string) =>
    ipcRenderer.invoke('xnet:nodes:getDocumentContent', { nodeId }),
  setDocumentContent: (nodeId: string, content: number[]) =>
    ipcRenderer.invoke('xnet:nodes:setDocumentContent', { nodeId, content }),

  // Change subscription
  onChange: (callback: (event: { changes: unknown[] }) => void) => {
    const handler = (_: unknown, event: { changes: unknown[] }) => callback(event)
    ipcRenderer.on('xnet:nodes:change', handler as (...args: unknown[]) => void)
    return () =>
      ipcRenderer.removeListener('xnet:nodes:change', handler as (...args: unknown[]) => void)
  }
})

// Type declaration for renderer
export interface XNetAPI {
  getProfile(): Promise<string>
  setSeedPhrase(mnemonic: string): Promise<{ ok: true }>
  getSeedPhrase(): Promise<{ mnemonic: string | null }>
  clearSeedPhrase(): Promise<{ ok: true }>
  onNewPage(callback: () => void): () => void
  onDevToolsToggle(callback: () => void): () => void
  onSharePayload(callback: (payload: string) => void): () => void
}

export interface XNetBSMAPI {
  start(opts: {
    signalingUrl: string
    authorDID?: string
    signingKey?: number[]
    replication?: SyncReplicationConfig
    ucanToken?: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }): Promise<void>
  reconfigure(opts: {
    signalingUrl: string
    authorDID?: string
    signingKey?: number[]
    replication?: SyncReplicationConfig
    ucanToken?: string
    transport?: 'ws' | 'webrtc' | 'auto'
    iceServers?: Array<{ urls: string[]; username?: string; credential?: string }>
  }): Promise<void>
  stop(): Promise<void>
  acquire(nodeId: string, schemaId: string): Promise<void>
  release(nodeId: string): Promise<void>
  postMessage(nodeId: string, data: unknown): void
  onMessage(nodeId: string, handler: (data: unknown) => void): () => void
  track(nodeId: string, schemaId: string): Promise<void>
  untrack(nodeId: string): Promise<void>
  getStatus(): Promise<{
    status: string
    transport: 'ws' | 'webrtc' | 'auto'
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
  onTransportFallback(
    callback: (payload: { from: string; to: string; reason: string }) => void
  ): () => void
  onUnauthorizedUpdate(
    callback: (payload: {
      code: 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED'
      resource: string | null
      action: string
      scorerAction: 'allow' | 'warn' | 'throttle' | 'block'
    }) => void
  ): () => void
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
  token: string | null // SEC-04: API authentication token
}

export interface LocalAPIStoreRequest {
  id: number
  operation: string
  params: Record<string, unknown>
}

export interface XNetLocalAPIAPI {
  status(): Promise<XNetLocalAPIStatus>
  start(): Promise<XNetLocalAPIStatus>
  stop(): Promise<{ running: boolean }>
  /** SEC-03: Register handler for Local API store requests */
  onStoreRequest(handler: (request: LocalAPIStoreRequest) => Promise<unknown>): () => void
}

export interface XNetTunnelStatus {
  health: 'starting' | 'ready' | 'degraded' | 'stopped'
  mode: 'temporary' | 'persistent' | null
  endpoint: string | null
  pid: number | null
  startedAt: number | null
  message: string | null
}

export interface XNetTunnelAPI {
  start(options?: {
    mode?: 'temporary' | 'persistent'
    targetUrl?: string
    tunnelName?: string
    hostname?: string
    token?: string
  }): Promise<XNetTunnelStatus>
  stop(): Promise<XNetTunnelStatus>
  status(): Promise<XNetTunnelStatus>
  onHealthChange(callback: (status: XNetTunnelStatus) => void): () => void
}

// Node Storage API types (for IPC-based NodeStorageAdapter)
export interface XNetNodesAPI {
  // Change log operations
  appendChange(change: unknown): Promise<void>
  getChanges(nodeId: string): Promise<unknown[]>
  getAllChanges(): Promise<unknown[]>
  getChangesSince(sinceLamport: number): Promise<unknown[]>
  getChangeByHash(hash: string): Promise<unknown | null>
  getLastChange(nodeId: string): Promise<unknown | null>

  // Materialized state operations
  getNode(id: string): Promise<unknown | null>
  setNode(node: unknown): Promise<void>
  deleteNode(id: string): Promise<void>
  listNodes(options?: unknown): Promise<unknown[]>
  countNodes(options?: unknown): Promise<number>

  // Sync state
  getLastLamportTime(): Promise<number>
  setLastLamportTime(time: number): Promise<void>

  // Document content operations
  getDocumentContent(nodeId: string): Promise<number[] | null>
  setDocumentContent(nodeId: string, content: number[]): Promise<void>

  // Change subscription
  onChange(callback: (event: { changes: unknown[] }) => void): () => void
}

declare global {
  interface Window {
    xnet: XNetAPI
    xnetBSM: XNetBSMAPI
    xnetServices: XNetServicesAPI
    xnetLocalAPI: XNetLocalAPIAPI
    xnetTunnel: XNetTunnelAPI
    xnetNodes: XNetNodesAPI
  }
}
