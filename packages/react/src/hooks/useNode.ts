/**
 * useNode - The unified hook for working with a single Node
 *
 * This is the primary hook for editing Nodes. It provides:
 * - Node properties (flattened for ergonomic access)
 * - Y.Doc for collaborative rich text (if schema specifies document: 'yjs')
 * - Auto-sync via WebSocket
 * - Type-safe mutations (update, remove)
 * - Presence awareness (live + hub snapshot)
 * - Auto-create with createIfMissing
 *
 * @example
 * ```tsx
 * const {
 *   data,           // FlatNode - access data.title directly!
 *   doc,            // Y.Doc for rich text
 *   update,         // Type-safe update function
 *   remove,         // Soft delete
 *   syncStatus,     // 'offline' | 'connecting' | 'connected'
 *   peerCount,      // Number of connected peers
 *   presence,       // Presence list (live + hub snapshot)
 *   loading,
 *   error
 * } = useNode(PageSchema, pageId, {
 *   createIfMissing: { title: 'Untitled' }
 * })
 *
 * // Update is type-safe!
 * update({ title: 'New Title' })  // OK
 * update({ typo: 'x' })           // Type error!
 * ```
 */
import type { DefinedSchema, PropertyBuilder, InferCreateProps } from '@xnet/data'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { useInstrumentation } from '../instrumentation'
import { METABRIDGE_ORIGIN, METABRIDGE_SEED_ORIGIN } from '../sync/meta-bridge'
import { WebSocketSyncProvider } from '../sync/WebSocketSyncProvider'
import { flattenNode, type FlatNode } from '../utils/flattenNode'
import { useNodeStore } from './useNodeStore'
import { useSyncManager } from './useSyncManager'

// Debug logging - enable via localStorage.setItem('xnet:sync:debug', 'true')
function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[useNode]', ...args)
  }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Sync connection status
 */
export type SyncStatus = 'offline' | 'connecting' | 'connected' | 'error'

export interface PresenceUser {
  did: string
  name?: string
  color?: string
  lastSeen?: number
  isStale?: boolean
}

/**
 * Options for useNode
 */
export interface UseNodeOptions<P extends Record<string, PropertyBuilder>> {
  /** Signaling servers for y-webrtc (default: localhost for dev) */
  signalingServers?: string[]
  /** Disable auto-sync (default: false) */
  disableSync?: boolean
  /** Debounce persistence delay in ms (default: 1000) */
  persistDebounce?: number
  /**
   * Auto-create the node if it doesn't exist.
   * Provide the default properties to use for creation.
   */
  createIfMissing?: InferCreateProps<P>
  /**
   * User's DID for presence/cursors. If provided, broadcasts awareness state.
   */
  did?: string
}

/**
 * Result from useNode hook
 */
export interface UseNodeResult<P extends Record<string, PropertyBuilder>> {
  // === Data ===
  /** Node properties (flattened - access directly: data.title) */
  data: FlatNode<P> | null
  /** Yjs document instance (null if schema has no document type) */
  doc: Y.Doc | null

  // === Mutations ===
  /**
   * Update node properties (type-safe).
   * Only properties defined in the schema are allowed.
   */
  update: (properties: Partial<InferCreateProps<P>>) => Promise<void>
  /**
   * Soft-delete the node.
   */
  remove: () => Promise<void>

  // === State ===
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Whether document has unsaved changes */
  isDirty: boolean
  /** Last persistence timestamp */
  lastSavedAt: number | null
  /** Whether the node was auto-created (via createIfMissing) */
  wasCreated: boolean

  // === Sync ===
  /** Sync connection status */
  syncStatus: SyncStatus
  /** Sync error message (if syncStatus is 'error') */
  syncError: string | null
  /** Connected peer count */
  peerCount: number

  // === Presence ===
  /** Presence list (live awareness + hub snapshot) */
  presence: PresenceUser[]
  /** Yjs Awareness instance (for TipTap CollaborationCursor) */
  awareness: Awareness | null

  // === Actions ===
  /** Manually trigger save */
  save: () => Promise<void>
  /** Reload from storage */
  reload: () => Promise<void>
}

// Default signaling servers (localhost for dev)
const DEFAULT_SIGNALING_SERVERS = ['ws://localhost:4444']

// Default debounce delay for persistence
const DEFAULT_PERSIST_DEBOUNCE = 1000

/**
 * Generate a consistent hex color from a string.
 * Returns a 6-digit hex color (#rrggbb) as required by y-prosemirror's yCursorPlugin.
 */
function generateColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  // HSL to RGB: s=70%, l=50%
  const s = 0.7
  const l = 0.5
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0,
    g = 0,
    b = 0
  if (hue < 60) {
    r = c
    g = x
    b = 0
  } else if (hue < 120) {
    r = x
    g = c
    b = 0
  } else if (hue < 180) {
    r = 0
    g = c
    b = x
  } else if (hue < 240) {
    r = 0
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    g = 0
    b = c
  } else {
    r = c
    g = 0
    b = x
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Module-level map tracking in-flight save promises by document ID.
 * When a useNode instance unmounts, it stores its flush promise here.
 * The next useNode instance loading the same doc awaits this before reading,
 * ensuring content survives navigation.
 */
const pendingFlushes = new Map<string, Promise<void>>()

/**
 * Load a Node with its CRDT document.
 *
 * This is the primary hook for editing content. It combines:
 * - Data loading (with FlatNode for ergonomic access)
 * - Y.Doc for collaborative rich text
 * - Type-safe mutations
 * - Real-time sync and presence
 */
export function useNode<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  id: string | null,
  options: UseNodeOptions<P> = {}
): UseNodeResult<P> {
  const {
    signalingServers = DEFAULT_SIGNALING_SERVERS,
    disableSync = false,
    persistDebounce = DEFAULT_PERSIST_DEBOUNCE,
    createIfMissing,
    did
  } = options

  // Memoize createIfMissing to prevent unnecessary effect re-runs
  // (options object is a new reference on each render)
  const createIfMissingRef = useRef(createIfMissing)
  createIfMissingRef.current = createIfMissing

  const { store, isReady } = useNodeStore()
  const syncManager = useSyncManager()
  log('syncManager from context:', syncManager ? 'present' : 'null', 'status:', syncManager?.status)
  const instrumentation = useInstrumentation()
  const schemaId = schema._schemaId
  const hasDocument = schema.schema.document === 'yjs'
  // Track whether this instance is using the SyncManager (for cleanup)
  const usingSyncManagerRef = useRef(false)

  // State
  const [data, setData] = useState<FlatNode<P> | null>(null)
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const [syncError, setSyncError] = useState<string | null>(null)
  const [peerCount, setPeerCount] = useState(0)
  const [wasCreated, setWasCreated] = useState(false)
  const [livePresence, setLivePresence] = useState<PresenceUser[]>([])
  const [snapshotPresence, setSnapshotPresence] = useState<PresenceUser[]>([])
  const [awareness, setAwareness] = useState<Awareness | null>(null)

  const presence = useMemo(() => {
    if (livePresence.length === 0 && snapshotPresence.length === 0) return []
    const liveByDid = new Map(livePresence.map((user) => [user.did, user]))
    const snapshotByDid = new Map(snapshotPresence.map((user) => [user.did, user]))

    const mergedLive = livePresence.map((user) => ({
      ...snapshotByDid.get(user.did),
      ...user,
      isStale: false
    }))
    const mergedSnapshot = snapshotPresence.filter((user) => !liveByDid.has(user.did))
    return [...mergedLive, ...mergedSnapshot]
  }, [livePresence, snapshotPresence])

  // Refs
  const providerRef = useRef<WebSocketSyncProvider | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const creatingRef = useRef(false)
  const storeRef = useRef(store)
  storeRef.current = store
  const dataRef = useRef<FlatNode<P> | null>(null)
  dataRef.current = data

  // Query tracking for devtools
  const queryIdRef = useRef(
    `useNode-${schemaId}-${id || 'null'}-${Math.random().toString(36).slice(2, 8)}`
  )
  useEffect(() => {
    if (!instrumentation?.queryTracker || !id) return
    instrumentation.queryTracker.register(queryIdRef.current, {
      type: 'useNode',
      schemaId,
      mode: 'document',
      nodeId: id
    })
    return () => {
      instrumentation.queryTracker.unregister(queryIdRef.current)
    }
  }, [instrumentation, schemaId, id])

  // Load node and document
  const load = useCallback(async () => {
    if (!store || !isReady || !id) {
      setData(null)
      setDoc(null)
      setLoading(false)
      return
    }

    // If sync is enabled but SyncManager isn't ready yet, wait for it.
    // This prevents creating a local Y.Doc that gets orphaned when SyncManager arrives.
    if (hasDocument && !disableSync && !syncManager) {
      log('Waiting for SyncManager before loading document')
      setLoading(true)
      return
    }

    log('Loading node:', id, 'schemaId:', schemaId)
    setLoading(true)
    setError(null)
    setWasCreated(false)
    setSyncError(null)

    try {
      // Await any in-flight flush from a previous unmount to ensure
      // we read the latest persisted content (race condition on navigation)
      const pendingFlush = pendingFlushes.get(id)
      if (pendingFlush) {
        log('Awaiting pending flush for:', id)
        await pendingFlush
      }

      // Load node properties
      let node = await store.get(id)
      log('Node from store:', node ? 'found' : 'not found')
      let justCreated = false // Track if we just created this node (joining shared doc)

      // Auto-create if not found and createIfMissing is provided
      // Use ref to avoid dependency on createIfMissing object reference
      if (!node && createIfMissingRef.current && !creatingRef.current) {
        log('Node not found, creating with createIfMissing')
        creatingRef.current = true
        try {
          node = await store.create({
            id,
            schemaId,
            properties: createIfMissingRef.current as Record<string, unknown>
          })
          justCreated = true
          setWasCreated(true)
          log('Node created, justCreated=true')
        } finally {
          creatingRef.current = false
        }
      }

      // If node was deleted, restore it (e.g., when opening a shared doc)
      if (node?.deleted && createIfMissingRef.current) {
        node = await store.restore(id)
      }

      if (!node || node.schemaId !== schemaId) {
        setData(null)
        setDoc(null)
        setLoading(false)
        return
      }

      setData(flattenNode<P>(node))

      // Load document if schema has one
      if (hasDocument) {
        // If we already have a Y.Doc for this id, reuse it (don't recreate).
        // Recreating would discard any in-memory edits and orphan the editor's reference.
        if (docRef.current && docRef.current.guid === id) {
          // Doc already loaded for this id - just update the state reference
          setDoc(docRef.current)
          setLastSavedAt(node.updatedAt)
        } else {
          // Destroy previous provider and Y.Doc if switching to a different document.
          if (docRef.current) {
            instrumentation?.yDocRegistry.unregister(docRef.current.guid)
            if (!usingSyncManagerRef.current) {
              // Only destroy if we own the doc (not borrowed from SyncManager)
              if (providerRef.current) {
                providerRef.current.destroy()
                providerRef.current = null
              }
              docRef.current.destroy()
            } else if (docRef.current.guid) {
              // Release back to SyncManager
              syncManager?.release(docRef.current.guid)
            }
            docRef.current = null
            setDoc(null)
            usingSyncManagerRef.current = false
          }

          let ydoc: Y.Doc

          if (syncManager && !disableSync) {
            // === SyncManager path: borrow Y.Doc from the pool ===
            log('Using SyncManager path')
            log('About to call syncManager.acquire for:', id)
            ydoc = await syncManager.acquire(id)
            log('syncManager.acquire returned doc:', ydoc?.guid)
            usingSyncManagerRef.current = true

            // Load stored content into the doc (the SyncManager may return an empty doc)
            const storedContent = await store.getDocumentContent(id)
            log('Stored content size:', storedContent?.length ?? 0)
            if (storedContent && storedContent.length > 0) {
              Y.applyUpdate(ydoc, storedContent, 'storage')
              log('Applied stored content to Y.Doc')
            }

            // Track this Node for background sync
            syncManager.track(id, schemaId)
            log('Tracking node for background sync')
          } else {
            // === Fallback path: create our own Y.Doc (backwards compat) ===
            log('Using fallback WebSocketSyncProvider path')
            ydoc = new Y.Doc({ guid: id, gc: false })
            usingSyncManagerRef.current = false

            // Load stored content
            const storedContent = await store.getDocumentContent(id)
            log('Stored content size:', storedContent?.length ?? 0)
            if (storedContent && storedContent.length > 0) {
              Y.applyUpdate(ydoc, storedContent)
              log('Applied stored content to Y.Doc')
            }
          }

          docRef.current = ydoc

          // Initialize meta map with current node properties so they sync to peers.
          // When justCreated (via createIfMissing), only write non-empty values to avoid
          // placeholder data conflicting with the real creator's values during CRDT merge.
          const metaMap = ydoc.getMap('meta')
          log(
            'Meta map size:',
            metaMap.size,
            'node.properties:',
            Object.keys(node.properties || {})
          )

          if (metaMap.size === 0 && node.properties) {
            const entries = Object.entries(node.properties)
            const hasContent = entries.some(([, v]) => v !== '' && v !== null && v !== undefined)

            if (hasContent || !justCreated) {
              log('Initializing meta map with node properties')
              ydoc.transact(() => {
                metaMap.set('_schemaId', schemaId)
                for (const [key, value] of entries) {
                  if (!justCreated || (value !== '' && value !== null && value !== undefined)) {
                    metaMap.set(key, value)
                  }
                }
              }, 'local') // Mark as local to avoid triggering metaObserver
            } else {
              log('Skipping meta map init: justCreated=true and no content')
            }
          }

          // Register with devtools if available
          instrumentation?.yDocRegistry.register(id, ydoc)

          setDoc(ydoc)
          setLastSavedAt(node.updatedAt)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, isReady, id, schemaId, hasDocument, syncManager, disableSync])

  // Save document content
  const save = useCallback(async () => {
    if (!store || !id || !docRef.current) return

    // Clear the timeout ref since we're about to save
    saveTimeoutRef.current = null

    try {
      const content = Y.encodeStateAsUpdate(docRef.current)
      await store.setDocumentContent(id, content)
      setIsDirty(false)
      setLastSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [store, id])

  // Ref for save function to avoid effect re-runs
  const saveRef = useRef(save)
  saveRef.current = save

  // Debounced save - use ref to avoid dependency changes
  const scheduleSave = useCallback(() => {
    setIsDirty(true)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveRef.current()
    }, persistDebounce)
  }, [persistDebounce])

  // === Mutations ===

  // Type-safe update
  // Updates both local NodeStore AND Y.Doc meta map for sync
  const update = useCallback(
    async (properties: Partial<InferCreateProps<P>>): Promise<void> => {
      if (!store || !isReady || !id) return

      try {
        const node = await store.update(id, {
          properties: properties as Record<string, unknown>
        })
        setData(flattenNode<P>(node))

        // Also update Y.Doc meta map so properties sync via y-webrtc
        if (docRef.current) {
          const metaMap = docRef.current.getMap('meta')
          docRef.current.transact(() => {
            metaMap.set('_schemaId', schemaId)
            for (const [key, value] of Object.entries(properties)) {
              metaMap.set(key, value)
            }
          }, 'local') // Mark as local to avoid triggering metaObserver on this peer
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    },
    [store, isReady, id]
  )

  // Soft delete
  const remove = useCallback(async (): Promise<void> => {
    if (!store || !isReady || !id) return

    try {
      await store.delete(id)
      setData(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [store, isReady, id])

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Set up Y.Doc update listener, sync provider, and presence
  useEffect(() => {
    if (!doc || !id || !hasDocument) return

    // CRITICAL: Verify the doc matches the current id.
    // When switching documents, React may run this effect with the new id
    // but the old doc state (which hasn't been updated yet).
    if (doc.guid !== id) {
      return
    }

    // === SyncManager path: sync is handled internally by the manager ===
    if (usingSyncManagerRef.current && syncManager) {
      log('Using SyncManager path for sync')

      // Track whether we received any sync data
      let receivedSyncData = false
      let syncTimeoutId: ReturnType<typeof setTimeout> | null = null

      // Listen for updates to trigger local persistence (SyncManager pool handles this,
      // but we still track dirty state for the UI)
      const updateHandler = (_update: Uint8Array, origin: unknown) => {
        // If update came from remote, we've received sync data
        if (origin === 'remote') {
          log('Received remote update via SyncManager')
          receivedSyncData = true
          if (syncTimeoutId) {
            clearTimeout(syncTimeoutId)
            syncTimeoutId = null
          }
          setSyncError(null)
        }
        scheduleSave()
      }
      doc.on('update', updateHandler)

      // Listen for remote meta changes (synced properties like title)
      const metaMap = doc.getMap('meta')

      // Helper to apply meta map values to NodeStore
      // Only updates if values actually changed to avoid unnecessary re-renders
      const applyMetaToNodeStore = () => {
        if (metaMap.size === 0 || !storeRef.current || !id) return

        const remoteProps: Record<string, unknown> = {}
        metaMap.forEach((value, key) => {
          // Skip internal keys - _schemaId is stored in meta for sync
          // but is a system field on NodeState, not a property
          if (key.startsWith('_')) return
          remoteProps[key] = value
        })

        if (Object.keys(remoteProps).length === 0) return

        // Compare against current data via ref (avoids stale closure)
        const currentData = dataRef.current
        if (currentData) {
          // Check if any property actually changed
          let hasChanges = false
          for (const [key, value] of Object.entries(remoteProps)) {
            if ((currentData as Record<string, unknown>)[key] !== value) {
              hasChanges = true
              break
            }
          }
          if (!hasChanges) return
        }

        log('Applying changed meta to NodeStore:', Object.keys(remoteProps))
        storeRef.current
          .update(id, { properties: remoteProps })
          .then((node) => {
            if (node) setData(flattenNode<P>(node))
          })
          .catch((err) => {
            console.warn('[useNode] Failed to apply remote meta to NodeStore:', err)
          })
      }

      const metaObserver = (event: Y.YMapEvent<unknown>) => {
        const origin = event.transaction.origin
        // Only process genuine remote changes (from sync provider).
        // Ignore: null (local Y.Doc init), 'local' (our own edits),
        // METABRIDGE_ORIGIN/SEED (NodeStore→meta writes from MetaBridge).
        // Without this filter, a feedback loop occurs:
        //   remote meta → applyMetaToNodeStore → NodeStore event →
        //   MetaBridge.observe → writePropertiesToMeta → metaObserver fires again
        if (
          origin === null ||
          origin === 'local' ||
          origin === 'storage' ||
          origin === METABRIDGE_ORIGIN ||
          origin === METABRIDGE_SEED_ORIGIN
        ) {
          return
        }
        log('Meta map changed from remote (origin:', origin, '), applying to NodeStore')
        applyMetaToNodeStore()
      }
      metaMap.observe(metaObserver)

      // Apply meta on initial load in case we joined and got synced data
      // Do it immediately since we already check for changes
      if (metaMap.size > 0) {
        log('Applying initial meta map')
        applyMetaToNodeStore()
      }

      // Track connection status from SyncManager
      const statusUnsub = syncManager.on('status', (status) => {
        log('SyncManager status changed:', status)
        setSyncStatus(
          status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : 'offline'
        )
      })
      // Set initial status
      setSyncStatus(
        syncManager.status === 'connected'
          ? 'connected'
          : syncManager.status === 'connecting'
            ? 'connecting'
            : 'offline'
      )

      // Get awareness from SyncManager
      const awareness = syncManager.getAwareness(id)
      setAwareness(awareness)

      // Set local awareness state with DID, name, and hex color
      if (awareness && did) {
        awareness.setLocalStateField('user', {
          did,
          name: `${did.slice(8, 16)}...`,
          color: generateColor(did)
        })
      }

      // Listen for remote awareness changes to update live presence
      let awarenessCleanup: (() => void) | null = null
      if (awareness) {
        const awarenessHandler = () => {
          const states = awareness.getStates()
          const nextPresence: PresenceUser[] = []

          states.forEach((state: Record<string, unknown>, clientId: number) => {
            if (clientId === awareness.clientID) return
            const user = state.user as { did?: string; color?: string; name?: string } | undefined
            if (user?.did) {
              nextPresence.push({
                did: user.did,
                name: user.name,
                color: user.color || generateColor(user.did),
                isStale: false
              })
            }
          })

          setLivePresence(nextPresence)
        }
        awareness.on('change', awarenessHandler)
        awarenessHandler() // Initial population
        awarenessCleanup = () => awareness.off('change', awarenessHandler)
      }

      const snapshotUnsub = syncManager.onAwarenessSnapshot(id, (users) => {
        const mapped: PresenceUser[] = users.map((user) => ({
          did: user.did,
          name: user.state.user?.name,
          color: user.state.user?.color ?? generateColor(user.did),
          lastSeen: user.lastSeen,
          isStale: user.isStale
        }))
        setSnapshotPresence(mapped)
      })

      // If we just created this node (joining a shared doc), set a timeout
      // to detect if sync fails to deliver any content
      if (wasCreated) {
        log('Node was just created (SyncManager path), starting sync timeout')
        syncTimeoutId = setTimeout(() => {
          // Check if the doc is still empty
          const fragment = doc.getXmlFragment('default')
          const metaMap = doc.getMap('meta')
          const hasContent = (fragment?.length ?? 0) > 0 || metaMap.size > 1

          log(
            'Sync timeout fired (SyncManager). receivedSyncData:',
            receivedSyncData,
            'hasContent:',
            hasContent
          )

          if (!receivedSyncData && !hasContent) {
            const errorMsg =
              'Sync timeout: No content received from peers. The shared document may not exist or peers may be offline.'
            log('Setting sync error:', errorMsg)
            setSyncStatus('error')
            setSyncError(errorMsg)
          }
        }, 10000)
      }

      return () => {
        log('Cleaning up SyncManager sync')
        if (syncTimeoutId) {
          clearTimeout(syncTimeoutId)
        }
        doc.off('update', updateHandler)
        metaMap.unobserve(metaObserver)
        statusUnsub()
        if (awarenessCleanup) awarenessCleanup()
        snapshotUnsub()
        setAwareness(null)
        setSyncStatus('offline')
        setSyncError(null)
        setPeerCount(0)
        setLivePresence([])
        setSnapshotPresence([])
      }
    }

    // === Fallback path: create our own WebSocketSyncProvider ===

    // Listen for updates (both local and remote) to trigger persistence
    const updateHandler = (_update: Uint8Array, _origin: unknown) => {
      scheduleSave()
    }
    doc.on('update', updateHandler)

    // Set up WebSocket sync
    if (!disableSync && signalingServers.length > 0) {
      log('Setting up WebSocketSyncProvider for room:', `xnet-doc-${id}`)
      setSyncStatus('connecting')
      const provider = new WebSocketSyncProvider(doc, {
        url: signalingServers[0],
        room: `xnet-doc-${id}`
      })
      providerRef.current = provider

      // Track whether we received any sync data
      let receivedSyncData = false
      let syncTimeoutId: ReturnType<typeof setTimeout> | null = null

      // Track connection status
      const statusHandler = (event: unknown) => {
        const { connected } = event as { connected: boolean }
        log('Connection status changed:', connected ? 'connected' : 'disconnected')
        setSyncStatus(connected ? 'connected' : 'connecting')
      }
      provider.on('status', statusHandler)

      // Listen for remote meta changes (synced properties)
      const metaMap = doc.getMap('meta')

      // Helper to apply meta map values to NodeStore
      const applyMetaToNodeStore = () => {
        if (metaMap.size === 0) return

        const props: Record<string, unknown> = {}
        metaMap.forEach((value, key) => {
          // Skip internal keys - _schemaId is stored in meta for sync
          // but is a system field on NodeState, not a property
          if (key.startsWith('_')) return
          props[key] = value
        })

        if (Object.keys(props).length > 0 && storeRef.current && id) {
          storeRef.current
            .update(id, { properties: props })
            .then((node) => {
              if (node) setData(flattenNode<P>(node))
            })
            .catch((err) => {
              console.warn('[useDocument] Failed to apply remote meta to NodeStore:', err)
            })
        }
      }

      const metaObserver = (event: Y.YMapEvent<unknown>) => {
        const origin = event.transaction.origin
        // Only process genuine remote changes. Ignore MetaBridge origins
        // to prevent feedback loops (see SyncManager path comment above).
        if (
          origin === null ||
          origin === 'local' ||
          origin === 'storage' ||
          origin === METABRIDGE_ORIGIN ||
          origin === METABRIDGE_SEED_ORIGIN
        ) {
          return
        }
        applyMetaToNodeStore()
      }
      metaMap.observe(metaObserver)

      // Also check meta map when sync first connects (handles initial sync)
      const syncedHandler = (event: unknown) => {
        const { synced } = event as { synced: boolean }
        log('Synced event received:', synced)
        if (synced) {
          receivedSyncData = true
          if (syncTimeoutId) {
            clearTimeout(syncTimeoutId)
            syncTimeoutId = null
          }
          // Clear any previous sync error
          setSyncError(null)
          applyMetaToNodeStore()
        }
      }
      provider.on('synced', syncedHandler)

      // If we just created this node (joining a shared doc), set a timeout
      // to detect if sync fails to deliver any content
      if (wasCreated) {
        log('Node was just created (joining shared doc), starting sync timeout')
        syncTimeoutId = setTimeout(() => {
          // Check if the doc is still empty
          const fragment = doc.getXmlFragment('default')
          const metaMap = doc.getMap('meta')
          const hasContent = (fragment?.length ?? 0) > 0 || metaMap.size > 1 // >1 because _schemaId might be there

          log(
            'Sync timeout fired. receivedSyncData:',
            receivedSyncData,
            'hasContent:',
            hasContent,
            'fragment.length:',
            fragment?.length,
            'metaMap.size:',
            metaMap.size
          )

          if (!receivedSyncData && !hasContent) {
            const errorMsg =
              'Sync timeout: No content received from peers. The shared document may not exist or peers may be offline.'
            log('Setting sync error:', errorMsg)
            setSyncStatus('error')
            setSyncError(errorMsg)
          }
        }, 10000) // 10 second timeout
      }

      // Track peer count
      const peersHandler = (event: unknown) => {
        const { count } = event as { count: number }
        setPeerCount(count)
      }
      provider.on('peers', peersHandler)

      // Set up awareness (presence/cursors)
      const { awareness: providerAwareness } = provider
      setAwareness(providerAwareness)

      // Set local awareness state with DID, name, and hex color
      // The 'name' and 'color' fields are required by y-prosemirror's yCursorPlugin
      if (did) {
        providerAwareness.setLocalStateField('user', {
          did,
          name: `${did.slice(8, 16)}...`,
          color: generateColor(did)
        })
      }

      // Listen for remote awareness changes
      const awarenessHandler = () => {
        const states = providerAwareness.getStates()
        const nextPresence: PresenceUser[] = []

        states.forEach((state: Record<string, unknown>, clientId: number) => {
          if (clientId === providerAwareness.clientID) return
          const user = state.user as { did?: string; color?: string; name?: string } | undefined
          if (user?.did) {
            nextPresence.push({
              did: user.did,
              name: user.name,
              color: user.color || generateColor(user.did),
              isStale: false
            })
          }
        })

        setLivePresence(nextPresence)
      }
      providerAwareness.on('change', awarenessHandler)

      const snapshotHandler = (users: unknown) => {
        if (!Array.isArray(users)) return
        const mapped = users
          .filter(
            (
              user
            ): user is {
              did: string
              state: { user?: { name?: string; color?: string } }
              lastSeen: number
              isStale: boolean
            } =>
              Boolean(
                user &&
                typeof user === 'object' &&
                typeof (user as { did?: unknown }).did === 'string'
              )
          )
          .map(
            (user): PresenceUser => ({
              did: user.did,
              name: user.state.user?.name,
              color: user.state.user?.color ?? generateColor(user.did),
              lastSeen: user.lastSeen,
              isStale: user.isStale
            })
          )
        setSnapshotPresence(mapped)
      }
      provider.on('awareness-snapshot', snapshotHandler)

      return () => {
        log('Cleaning up sync provider')
        if (syncTimeoutId) {
          clearTimeout(syncTimeoutId)
        }
        doc.off('update', updateHandler)
        metaMap.unobserve(metaObserver)
        providerAwareness.off('change', awarenessHandler)
        provider.off('awareness-snapshot', snapshotHandler)
        provider.off('synced', syncedHandler)
        provider.off('status', statusHandler)
        provider.off('peers', peersHandler)
        provider.destroy()
        providerRef.current = null
        setAwareness(null)
        setSyncStatus('offline')
        setSyncError(null)
        setPeerCount(0)
        setLivePresence([])
        setSnapshotPresence([])
      }
    }

    return () => {
      doc.off('update', updateHandler)
    }
    // Note: store is accessed via storeRef to avoid re-creating provider on store changes
    // wasCreated is included to trigger sync timeout logic when joining a shared doc
  }, [
    doc,
    id,
    hasDocument,
    disableSync,
    signalingServers,
    scheduleSave,
    did,
    syncManager,
    wasCreated
  ])

  // Cleanup on unmount - always persist Y.Doc content and release doc
  useEffect(() => {
    return () => {
      // Cancel any pending debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }

      // Always flush current Y.Doc state to storage on unmount.
      // This ensures content survives navigation regardless of sync mode.
      if (docRef.current && store && id) {
        const content = Y.encodeStateAsUpdate(docRef.current)
        const flushPromise = store
          .setDocumentContent(id, content)
          .catch(() => {
            // Silent fail on unmount
          })
          .finally(() => {
            pendingFlushes.delete(id)
          })
        // Store the flush promise so the next load() can await it
        pendingFlushes.set(id, flushPromise)
      }

      // Release doc back to SyncManager on unmount
      if (usingSyncManagerRef.current && id && syncManager) {
        syncManager.release(id)
        usingSyncManagerRef.current = false
      }
    }
  }, [store, id, syncManager])

  // Subscribe to property changes
  useEffect(() => {
    if (!store || !id) return

    const unsubscribe = store.subscribe((event) => {
      if (event.change.payload.nodeId !== id) return
      if (event.node && event.node.schemaId === schemaId) {
        setData(flattenNode<P>(event.node))
      }
    })

    return unsubscribe
  }, [store, id, schemaId])

  // Report updates to devtools whenever data changes
  useEffect(() => {
    if (!instrumentation?.queryTracker || !id || loading) return
    instrumentation.queryTracker.recordUpdate(queryIdRef.current, data ? 1 : 0, 0)
  }, [data, instrumentation, id, loading])

  return {
    // Data
    data,
    doc,

    // Mutations
    update,
    remove,

    // State
    loading,
    error,
    isDirty,
    lastSavedAt,
    wasCreated,

    // Sync
    syncStatus,
    syncError,
    peerCount,

    // Presence
    presence,
    awareness,

    // Actions
    save,
    reload: load
  }
}
