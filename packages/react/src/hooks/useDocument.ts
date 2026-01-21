/**
 * useDocument - The unified hook for working with a single Node
 *
 * This is the primary hook for editing documents. It provides:
 * - Node properties (flattened for ergonomic access)
 * - Y.Doc for collaborative rich text (if schema specifies document: 'yjs')
 * - Auto-sync via y-webrtc
 * - Type-safe mutations (update, remove)
 * - Presence awareness (remote users)
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
 *   remoteUsers,    // Users currently viewing
 *   loading,
 *   error
 * } = useDocument(PageSchema, pageId, {
 *   createIfMissing: { title: 'Untitled' }
 * })
 *
 * // Update is type-safe!
 * update({ title: 'New Title' })  // OK
 * update({ typo: 'x' })           // Type error!
 * ```
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import type { DefinedSchema, PropertyBuilder, InferCreateProps } from '@xnet/data'
import { useNodeStore } from './useNodeStore'
import { flattenNode, type FlatNode } from '../utils/flattenNode'

// =============================================================================
// Types
// =============================================================================

/**
 * Sync connection status
 */
export type SyncStatus = 'offline' | 'connecting' | 'connected'

/**
 * Remote user presence
 */
export interface RemoteUser {
  /** Client ID */
  id: number
  /** Display name */
  name: string
  /** User color for cursors/selections */
  color: string
  /** Whether currently active */
  isActive: boolean
}

/**
 * Options for useDocument
 */
export interface UseDocumentOptions<P extends Record<string, PropertyBuilder>> {
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
   * User info for presence (optional)
   */
  user?: {
    name: string
    color?: string
  }
}

/**
 * Result from useDocument hook
 */
export interface UseDocumentResult<P extends Record<string, PropertyBuilder>> {
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
  /** Connected peer count */
  peerCount: number

  // === Presence ===
  /** Remote users currently viewing this document */
  remoteUsers: RemoteUser[]

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
 * Generate a consistent color from a string
 */
function generateColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash % 360)
  return `hsl(${hue}, 70%, 50%)`
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Load a Node with its CRDT document.
 *
 * This is the primary hook for editing content. It combines:
 * - Data loading (with FlatNode for ergonomic access)
 * - Y.Doc for collaborative rich text
 * - Type-safe mutations
 * - Real-time sync and presence
 */
export function useDocument<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  id: string | null,
  options: UseDocumentOptions<P> = {}
): UseDocumentResult<P> {
  const {
    signalingServers = DEFAULT_SIGNALING_SERVERS,
    disableSync = false,
    persistDebounce = DEFAULT_PERSIST_DEBOUNCE,
    createIfMissing,
    user
  } = options

  // Memoize user info to prevent unnecessary effect re-runs
  // (user object is a new reference on each render)
  const userName = user?.name
  const userColor = user?.color

  const { store, isReady } = useNodeStore()
  const schemaId = schema._schemaId
  const hasDocument = schema.schema.document === 'yjs'

  // State
  const [data, setData] = useState<FlatNode<P> | null>(null)
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const [peerCount, setPeerCount] = useState(0)
  const [wasCreated, setWasCreated] = useState(false)
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([])

  // Refs
  const providerRef = useRef<WebrtcProvider | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const creatingRef = useRef(false)

  // Load node and document
  const load = useCallback(async () => {
    if (!store || !isReady || !id) {
      setData(null)
      setDoc(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setWasCreated(false)

    try {
      // Load node properties
      let node = await store.get(id)

      // Auto-create if not found and createIfMissing is provided
      if (!node && createIfMissing && !creatingRef.current) {
        creatingRef.current = true
        try {
          node = await store.create({
            id,
            schemaId,
            properties: createIfMissing as Record<string, unknown>
          })
          setWasCreated(true)
        } finally {
          creatingRef.current = false
        }
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
        const ydoc = new Y.Doc({ guid: id })
        docRef.current = ydoc

        // Load stored content
        const storedContent = await store.getDocumentContent(id)
        if (storedContent && storedContent.length > 0) {
          Y.applyUpdate(ydoc, storedContent)
        }

        setDoc(ydoc)
        setLastSavedAt(node.updatedAt)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [store, isReady, id, schemaId, hasDocument, createIfMissing])

  // Save document content
  const save = useCallback(async () => {
    if (!store || !id || !docRef.current) return

    try {
      const content = Y.encodeStateAsUpdate(docRef.current)
      await store.setDocumentContent(id, content)
      setIsDirty(false)
      setLastSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    }
  }, [store, id])

  // Debounced save
  const scheduleSave = useCallback(() => {
    setIsDirty(true)

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      save()
    }, persistDebounce)
  }, [save, persistDebounce])

  // === Mutations ===

  // Type-safe update
  const update = useCallback(
    async (properties: Partial<InferCreateProps<P>>): Promise<void> => {
      if (!store || !isReady || !id) return

      try {
        const node = await store.update(id, {
          properties: properties as Record<string, unknown>
        })
        setData(flattenNode<P>(node))
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

  // Set up Y.Doc update listener, y-webrtc provider, and presence
  useEffect(() => {
    if (!doc || !id || !hasDocument) return

    // Listen for local updates
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      // Only schedule save for local changes (not from sync)
      if (origin !== providerRef.current) {
        scheduleSave()
      }
    }
    doc.on('update', updateHandler)

    // Set up y-webrtc sync
    if (!disableSync && signalingServers.length > 0) {
      setSyncStatus('connecting')

      const provider = new WebrtcProvider(`xnet-doc-${id}`, doc, {
        signaling: signalingServers,
        maxConns: 20
      })
      providerRef.current = provider

      // Track connection status
      const statusHandler = (event: { connected: boolean }) => {
        setSyncStatus(event.connected ? 'connected' : 'connecting')
      }
      provider.on('status', statusHandler)

      // Track peers
      const peersHandler = (event: { webrtcPeers: string[] }) => {
        setPeerCount(event.webrtcPeers?.length ?? 0)
      }
      provider.on('peers', peersHandler)

      // Set up presence if user info provided
      let awarenessHandler: (() => void) | null = null
      if (userName) {
        const awareness = provider.awareness
        awareness.setLocalState({
          user: {
            name: userName,
            color: userColor || generateColor(userName)
          }
        })

        // Track remote users
        awarenessHandler = () => {
          const states = awareness.getStates()
          const remote: RemoteUser[] = []

          states.forEach((state, clientId) => {
            if (clientId === awareness.clientID) return
            if (state?.user) {
              remote.push({
                id: clientId,
                name: state.user.name || 'Anonymous',
                color: state.user.color || generateColor(String(clientId)),
                isActive: true
              })
            }
          })

          setRemoteUsers(remote)
        }

        awareness.on('change', awarenessHandler)
        awarenessHandler() // Initial sync
      }

      return () => {
        doc.off('update', updateHandler)
        provider.off('status', statusHandler)
        provider.off('peers', peersHandler)
        if (awarenessHandler) {
          provider.awareness.off('change', awarenessHandler)
        }
        provider.destroy()
        providerRef.current = null
        setSyncStatus('offline')
        setPeerCount(0)
        setRemoteUsers([])
      }
    }

    return () => {
      doc.off('update', updateHandler)
    }
  }, [doc, id, hasDocument, disableSync, signalingServers, scheduleSave, userName, userColor])

  // Cleanup on unmount - save any pending changes
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        // Flush pending save synchronously (best effort)
        if (isDirty && docRef.current && store && id) {
          const content = Y.encodeStateAsUpdate(docRef.current)
          store.setDocumentContent(id, content).catch(() => {
            // Silent fail on unmount
          })
        }
      }
    }
  }, [isDirty, store, id])

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
    peerCount,

    // Presence
    remoteUsers,

    // Actions
    save,
    reload: load
  }
}
