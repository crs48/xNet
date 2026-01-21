/**
 * useDocument - Load a Node with its CRDT document
 *
 * This hook loads a Node's properties (via NodeStore) and its
 * associated Yjs document (if the schema specifies document: 'yjs').
 *
 * Features:
 * - Auto-sync via y-webrtc
 * - Debounced persistence
 * - Dirty state tracking
 * - Last saved timestamp
 *
 * @example
 * ```tsx
 * const { data, doc, isDirty, lastSavedAt, syncStatus } = useDocument(PageSchema, pageId)
 *
 * // data.properties.title - LWW synced metadata
 * // doc - Y.Doc instance for collaborative editing
 * ```
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import type { DefinedSchema, PropertyBuilder, NodeState } from '@xnet/data'
import { useNodeStore } from './useNodeStore'
import type { TypedNode } from './useQuery'

// =============================================================================
// Types
// =============================================================================

/**
 * Sync connection status
 */
export type SyncStatus = 'offline' | 'connecting' | 'connected'

/**
 * Options for useDocument
 */
export interface UseDocumentOptions {
  /** Signaling servers for y-webrtc (default: localhost for dev) */
  signalingServers?: string[]
  /** Disable auto-sync (default: false) */
  disableSync?: boolean
  /** Debounce persistence delay in ms (default: 1000) */
  persistDebounce?: number
}

/**
 * Result from useDocument hook
 */
export interface UseDocumentResult<P extends Record<string, PropertyBuilder>> {
  /** Node properties (LWW synced) */
  data: TypedNode<P> | null
  /** Yjs document instance (null if schema has no document type) */
  doc: Y.Doc | null
  /** Whether currently loading */
  loading: boolean
  /** Any error that occurred */
  error: Error | null
  /** Whether document has unsaved changes */
  isDirty: boolean
  /** Last persistence timestamp */
  lastSavedAt: number | null
  /** Sync connection status */
  syncStatus: SyncStatus
  /** Connected peer count */
  peerCount: number
  /** Manually trigger save */
  save: () => Promise<void>
  /** Reload from storage */
  reload: () => Promise<void>
}

// Default signaling servers (localhost for dev)
const DEFAULT_SIGNALING_SERVERS = ['ws://localhost:4444']

// Default debounce delay for persistence
const DEFAULT_PERSIST_DEBOUNCE = 1000

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * Load a Node with its CRDT document.
 *
 * This is the primary hook for editing content that has rich text
 * or other collaborative CRDT data.
 */
export function useDocument<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  id: string | null,
  options: UseDocumentOptions = {}
): UseDocumentResult<P> {
  const {
    signalingServers = DEFAULT_SIGNALING_SERVERS,
    disableSync = false,
    persistDebounce = DEFAULT_PERSIST_DEBOUNCE
  } = options

  const { store, isReady } = useNodeStore()
  const schemaId = schema._schemaId
  const hasDocument = schema.schema.document === 'yjs'

  // State
  const [data, setData] = useState<TypedNode<P> | null>(null)
  const [doc, setDoc] = useState<Y.Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline')
  const [peerCount, setPeerCount] = useState(0)

  // Refs
  const providerRef = useRef<WebrtcProvider | null>(null)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docRef = useRef<Y.Doc | null>(null)

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

    try {
      // Load node properties
      const node = await store.get(id)

      if (!node || node.schemaId !== schemaId) {
        setData(null)
        setDoc(null)
        setLoading(false)
        return
      }

      setData(node as TypedNode<P>)

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
  }, [store, isReady, id, schemaId, hasDocument])

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

  // Initial load
  useEffect(() => {
    load()
  }, [load])

  // Set up Y.Doc update listener and y-webrtc provider
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

      return () => {
        doc.off('update', updateHandler)
        provider.off('status', statusHandler)
        provider.off('peers', peersHandler)
        provider.destroy()
        providerRef.current = null
        setSyncStatus('offline')
        setPeerCount(0)
      }
    }

    return () => {
      doc.off('update', updateHandler)
    }
  }, [doc, id, hasDocument, disableSync, signalingServers, scheduleSave])

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
        setData(event.node as TypedNode<P>)
      }
    })

    return unsubscribe
  }, [store, id, schemaId])

  return {
    data,
    doc,
    loading,
    error,
    isDirty,
    lastSavedAt,
    syncStatus,
    peerCount,
    save,
    reload: load
  }
}
