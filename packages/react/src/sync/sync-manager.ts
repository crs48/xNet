/**
 * Sync Manager - Top-level orchestrator for Background Sync
 *
 * Wires together Node Pool, Registry, and Connection Manager into a cohesive
 * sync service. Handles the Yjs sync protocol (state vectors, diffs, incremental
 * updates) for each tracked Node.
 *
 * Components acquire Y.Docs via the SyncManager (through useNode). When released,
 * docs stay alive in the pool and continue syncing in the background.
 */

// Module loaded indicator - only shown in debug mode
if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
  console.log('[SyncManager] Module loaded from source!')
}

import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import type { ContentId } from '@xnet/core'
import type { NodeStore, NodeStorageAdapter } from '@xnet/data'
import { createMetaBridge, type MetaBridge } from './meta-bridge'
import { createNodePool, type NodePool } from './node-pool'
import { createRegistry, type Registry, type RegistryStorage } from './registry'
import {
  createConnectionManager,
  type ConnectionManager,
  type ConnectionStatus
} from './connection-manager'
import { createOfflineQueue, type OfflineQueue } from './offline-queue'
import { createBlobSyncProvider, type BlobSyncProvider, type BlobStoreForSync } from './blob-sync'

// Debug logging - enable via localStorage.setItem('xnet:sync:debug', 'true')
function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[SyncManager]', ...args)
  }
}

export type SyncStatus = ConnectionStatus

export interface SyncManagerConfig {
  /** NodeStore for meta bridge */
  nodeStore: NodeStore
  /** Storage adapter for pool persistence (Y.Doc content) */
  storage: NodeStorageAdapter
  /** Signaling/hub WebSocket URL */
  signalingUrl: string
  /** Max Y.Docs in memory (default: 50) */
  poolSize?: number
  /** TTL for tracked Nodes in ms (default: 7 days) */
  trackTTL?: number
  /** Author DID for awareness */
  authorDID?: string
  /** Blob store for P2P blob sync (optional — if omitted, blob sync is disabled) */
  blobStore?: BlobStoreForSync
  /** Optional UCAN token for hub auth */
  ucanToken?: string
  /** Optional UCAN token provider for hub auth */
  getUCANToken?: () => Promise<string>
  /** Optional pool update callback */
  onDocUpdate?: (nodeId: string, doc: Y.Doc) => void
  /** Optional pool eviction callback */
  onDocEvict?: (nodeId: string, doc: Y.Doc) => void
}

export interface SyncManager {
  /** Start the sync manager (connect, load registry, sync tracked Nodes) */
  start(): Promise<void>
  /** Stop (disconnect, flush, save registry) */
  stop(): Promise<void>

  /** Track a Node for background sync */
  track(nodeId: string, schemaId: string): void
  /** Stop tracking a Node */
  untrack(nodeId: string): void

  /** Acquire a Y.Doc (used by useNode) */
  acquire(nodeId: string): Promise<Y.Doc>
  /** Release a Y.Doc (component unmounted) */
  release(nodeId: string): void

  /** Get awareness for a Node (for cursor presence) */
  getAwareness(nodeId: string): Awareness | null

  /** Request blobs from peers by CID (no-op if blob sync is disabled) */
  requestBlobs(cids: string[]): Promise<void>
  /** Announce blob CIDs to peers (no-op if blob sync is disabled) */
  announceBlobs(cids: string[]): void

  /** Connection status */
  readonly status: SyncStatus
  /** Pool stats */
  readonly poolSize: number
  /** Tracked count */
  readonly trackedCount: number
  /** Offline queue size */
  readonly queueSize: number
  /** Pending blob requests */
  readonly pendingBlobCount: number

  /** Listen for events */
  on(event: 'status', handler: (status: SyncStatus) => void): () => void
  /** Underlying ConnectionManager (if available) */
  readonly connection?: ConnectionManager
}

/**
 * Adapt a NodeStorageAdapter to the RegistryStorage interface.
 * Stores the tracked-node set as a JSON-encoded document content blob.
 */
function createRegistryStorageAdapter(storage: NodeStorageAdapter): RegistryStorage {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return {
    async get(key) {
      try {
        const content = await storage.getDocumentContent(key)
        if (!content || content.length === 0) return null
        const json = decoder.decode(content)
        return JSON.parse(json)
      } catch {
        return null
      }
    },
    async set(key, entries) {
      const json = JSON.stringify(entries)
      const bytes = encoder.encode(json)
      await storage.setDocumentContent(key, bytes)
    }
  }
}

/**
 * Extract blob CIDs from a Y.Doc by scanning the XmlFragment for nodes
 * with cid attributes (images, files, etc.)
 */
function extractBlobCids(doc: Y.Doc): string[] {
  const cids: string[] = []
  const seen = new Set<string>()

  // The editor stores content in a Y.XmlFragment named 'default' or 'prosemirror'
  // Try known fragment names
  for (const name of ['default', 'prosemirror', '']) {
    let fragment: Y.XmlFragment | undefined
    try {
      fragment = doc.getXmlFragment(name)
    } catch {
      continue
    }
    if (!fragment || fragment.length === 0) continue
    walkXmlFragment(fragment, (node) => {
      if (node instanceof Y.XmlElement) {
        const cid = node.getAttribute('cid')
        if (typeof cid === 'string' && cid.length > 0 && !seen.has(cid)) {
          seen.add(cid)
          cids.push(cid)
        }
      }
    })
  }

  // Also check the meta map for FileRef properties (structured data)
  const meta = doc.getMap('meta')
  if (meta) {
    walkYMap(meta, (value) => {
      if (typeof value === 'object' && value !== null && 'cid' in value) {
        const cid = (value as { cid: string }).cid
        if (typeof cid === 'string' && cid.length > 0 && !seen.has(cid)) {
          seen.add(cid)
          cids.push(cid)
        }
      }
    })
  }

  return cids
}

/** Recursively walk a Y.XmlFragment/XmlElement tree */
function walkXmlFragment(
  node: Y.XmlFragment | Y.XmlElement,
  visitor: (n: Y.XmlElement | Y.XmlText) => void
): void {
  for (let i = 0; i < node.length; i++) {
    const child = node.get(i)
    if (child instanceof Y.XmlElement) {
      visitor(child)
      walkXmlFragment(child, visitor)
    } else if (child instanceof Y.XmlText) {
      visitor(child)
    }
  }
}

/** Recursively walk a Y.Map looking for objects with cid fields */
function walkYMap(map: Y.Map<unknown>, visitor: (value: unknown) => void): void {
  map.forEach((value) => {
    if (value instanceof Y.Map) {
      walkYMap(value, visitor)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        visitor(item)
      }
    } else {
      visitor(value)
    }
  })
}

export function createSyncManager(config: SyncManagerConfig): SyncManager {
  const metaBridge = createMetaBridge(config.nodeStore)
  const pool = createNodePool({
    storage: config.storage,
    metaBridge,
    maxWarm: config.poolSize ?? 50,
    onDocUpdate: config.onDocUpdate,
    onDocEvict: config.onDocEvict
  })
  const registry = createRegistry({
    storage: createRegistryStorageAdapter(config.storage),
    trackTTL: config.trackTTL
  })
  const connection = createConnectionManager({
    url: config.signalingUrl,
    ucanToken: config.ucanToken,
    getUCANToken: config.getUCANToken
  })
  const offlineQueue = createOfflineQueue({
    storage: config.storage
  })
  // Wrap blobStore to auto-announce new blobs to peers on put()
  let blobSync: BlobSyncProvider | null = null
  if (config.blobStore) {
    const underlyingStore = config.blobStore
    const announcingStore: BlobStoreForSync = {
      get: (cid) => underlyingStore.get(cid),
      has: (cid) => underlyingStore.has(cid),
      async put(data) {
        const cid = await underlyingStore.put(data)
        // Auto-announce newly stored blobs to peers
        if (blobSync) {
          blobSync.announceHave([cid])
        }
        return cid
      }
    }
    blobSync = createBlobSyncProvider({
      blobStore: announcingStore,
      connection
    })
  }

  // Room cleanup functions per nodeId
  const roomCleanups = new Map<string, () => void>()
  // Awareness instances per nodeId
  const awarenessMap = new Map<string, Awareness>()
  // Track which docs have broadcast listeners set up
  const broadcastDocs = new Set<string>()
  // Peer ID for deduplication
  const peerId = Math.random().toString(36).slice(2, 10)

  function toBase64(data: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    return btoa(binary)
  }

  function fromBase64(str: string): Uint8Array {
    const binary = atob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  function joinNodeRoom(nodeId: string): void {
    if (roomCleanups.has(nodeId)) {
      log('Already joined room for node:', nodeId)
      return
    }

    const room = `xnet-doc-${nodeId}`
    log('Joining room:', room)

    const cleanup = connection.joinRoom(room, (data) => {
      handleSyncMessage(nodeId, data)
    })

    roomCleanups.set(nodeId, cleanup)

    // Send initial sync-step1 if we have a doc in the pool
    if (pool.has(nodeId)) {
      log('Doc already in pool, sending initial sync-step1')
      pool.acquire(nodeId).then((doc) => {
        const sv = Y.encodeStateVector(doc)
        log('Sending sync-step1 for node:', nodeId, 'SV size:', sv.length)
        connection.publish(room, {
          type: 'sync-step1',
          from: peerId,
          sv: toBase64(sv)
        })
        pool.release(nodeId)
      })
    } else {
      log('Doc not in pool yet for node:', nodeId)
    }
  }

  function leaveNodeRoom(nodeId: string): void {
    const cleanup = roomCleanups.get(nodeId)
    if (cleanup) {
      cleanup()
      roomCleanups.delete(nodeId)
    }
    awarenessMap.delete(nodeId)
    broadcastDocs.delete(nodeId)
  }

  async function handleSyncMessage(nodeId: string, data: Record<string, unknown>): Promise<void> {
    if (data.from === peerId) {
      log('Ignoring own message')
      return
    }

    log('Received message for node:', nodeId, 'type:', data.type, 'from:', data.from)
    const doc = await pool.acquire(nodeId)
    const room = `xnet-doc-${nodeId}`

    try {
      switch (data.type) {
        case 'sync-step1': {
          // Peer wants our updates since their state vector
          const remoteSV = fromBase64(data.sv as string)
          const diff = Y.encodeStateAsUpdate(doc, remoteSV)
          log(
            'Received sync-step1, remote SV size:',
            remoteSV.length,
            'sending diff size:',
            diff.length
          )
          connection.publish(room, {
            type: 'sync-step2',
            from: peerId,
            to: data.from,
            update: toBase64(diff)
          })
          // DON'T send sync-step1 back here - that causes an infinite loop.
          // If we need content from them, we'll get it from our initial sync-step1
          // that we send when joining the room.
          break
        }

        case 'sync-step2': {
          // Response to our sync-step1 — apply their diff
          if (data.to && data.to !== peerId) {
            log('Ignoring sync-step2 addressed to different peer:', data.to)
            break
          }
          const update = fromBase64(data.update as string)
          log('Received sync-step2, applying update size:', update.length)
          log('Doc state before update - meta keys:', doc.getMap('meta').size)
          Y.applyUpdate(doc, update, 'remote')
          log('Doc state after update - meta keys:', doc.getMap('meta').size)
          registry.markSynced(nodeId)
          log('Marked node as synced:', nodeId)
          break
        }

        case 'sync-update': {
          // Incremental update from a peer
          const update = fromBase64(data.update as string)
          log('Received sync-update, size:', update.length)
          Y.applyUpdate(doc, update, 'remote')
          break
        }
      }
    } finally {
      pool.release(nodeId)
    }
  }

  /** Set up broadcasting local Y.Doc updates to the network */
  function setupDocBroadcast(nodeId: string, doc: Y.Doc): void {
    if (broadcastDocs.has(nodeId)) return
    broadcastDocs.add(nodeId)

    const room = `xnet-doc-${nodeId}`
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return // Don't re-broadcast remote updates

      if (connection.status === 'connected') {
        // Online: broadcast immediately
        connection.publish(room, {
          type: 'sync-update',
          from: peerId,
          update: toBase64(update)
        })
      } else {
        // Offline: queue for later
        offlineQueue.enqueue(nodeId, update)
      }
    })
  }

  /** Drain the offline queue by broadcasting all queued updates */
  async function drainOfflineQueue(): Promise<void> {
    if (offlineQueue.size === 0) return

    await offlineQueue.drain(async (entry) => {
      const room = `xnet-doc-${entry.nodeId}`
      connection.publish(room, {
        type: 'sync-update',
        from: peerId,
        update: entry.update // Already base64 encoded
      })
    })
  }

  /** Send sync-step1 for a node (initiate sync handshake) */
  function sendSyncStep1(nodeId: string, doc: Y.Doc): void {
    const room = `xnet-doc-${nodeId}`
    const sv = Y.encodeStateVector(doc)
    log(
      'sendSyncStep1 for node:',
      nodeId,
      'SV size:',
      sv.length,
      'connection status:',
      connection.status
    )
    connection.publish(room, {
      type: 'sync-step1',
      from: peerId,
      sv: toBase64(sv)
    })
  }

  return {
    async start() {
      log('Starting SyncManager...')
      await registry.load()
      log('Registry loaded, tracked nodes:', registry.getTracked().length)
      await offlineQueue.load()
      log('Offline queue loaded, size:', offlineQueue.size)
      log('Connecting to signaling server...')
      connection.connect()

      // Start blob sync if configured
      blobSync?.start()

      // When connection is established, drain offline queue and initiate sync
      connection.onStatus((s) => {
        log('Connection status changed in start():', s)
        if (s === 'connected') {
          // Drain any queued offline updates first
          drainOfflineQueue()

          // Re-send sync-step1 for all docs in pool
          for (const nodeId of roomCleanups.keys()) {
            if (pool.has(nodeId)) {
              pool.acquire(nodeId).then((doc) => {
                sendSyncStep1(nodeId, doc)
                pool.release(nodeId)
              })
            }
          }
        }
      })

      // Join rooms for all tracked Nodes
      const tracked = registry.getTracked()
      log('Joining rooms for', tracked.length, 'tracked nodes')
      for (const entry of tracked) {
        joinNodeRoom(entry.nodeId)
      }
      log('SyncManager started')
    },

    async stop() {
      // Stop blob sync
      blobSync?.stop()

      // Leave all rooms
      for (const nodeId of Array.from(roomCleanups.keys())) {
        leaveNodeRoom(nodeId)
      }

      connection.disconnect()
      await pool.flushAll()
      registry.prune()
      await registry.save()
      await offlineQueue.save()
      await pool.destroy()
    },

    track(nodeId, schemaId) {
      registry.track(nodeId, schemaId)
      joinNodeRoom(nodeId)
    },

    untrack(nodeId) {
      registry.untrack(nodeId)
      leaveNodeRoom(nodeId)
    },

    async acquire(nodeId) {
      console.log('[SyncManager] acquire() called for:', nodeId)
      log('Acquiring doc for node:', nodeId)
      registry.touch(nodeId)

      const doc = await pool.acquire(nodeId)
      log('Doc acquired from pool, guid:', doc.guid, 'meta keys:', doc.getMap('meta').size)

      // Set up broadcast if not already done
      setupDocBroadcast(nodeId, doc)

      // Join room if not already joined
      if (!roomCleanups.has(nodeId)) {
        joinNodeRoom(nodeId)
      }

      // Send sync-step1 to get any updates we missed
      if (connection.status === 'connected') {
        log('Connection is connected, sending sync-step1')
        sendSyncStep1(nodeId, doc)
      } else {
        log('Connection not connected, status:', connection.status)
      }

      // Eager blob sync: scan Y.Doc for CID references and request missing ones
      if (blobSync) {
        const cids = extractBlobCids(doc)
        if (cids.length > 0) {
          blobSync.requestBlobs(cids as ContentId[])
        }
      }

      return doc
    },

    release(nodeId) {
      pool.release(nodeId)
      // Note: don't leave the room — keep syncing in background
    },

    getAwareness(nodeId) {
      return awarenessMap.get(nodeId) ?? null
    },

    async requestBlobs(cids) {
      if (blobSync) {
        await blobSync.requestBlobs(cids as ContentId[])
      }
    },

    announceBlobs(cids) {
      if (blobSync) {
        blobSync.announceHave(cids as ContentId[])
      }
    },

    get status() {
      return connection.status
    },
    get connection() {
      return connection
    },
    get poolSize() {
      return pool.size
    },
    get trackedCount() {
      return registry.getTracked().length
    },
    get queueSize() {
      return offlineQueue.size
    },
    get pendingBlobCount() {
      return blobSync?.pendingCount ?? 0
    },

    on(event, handler) {
      if (event === 'status') {
        return connection.onStatus(handler)
      }
      return () => {}
    }
  }
}
