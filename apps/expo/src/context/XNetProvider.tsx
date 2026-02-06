/**
 * XNetProvider for Expo/React Native
 *
 * Provides xNet context with NativeBridge for data access.
 * Uses expo-sqlite for storage and expo-crypto for cryptographic operations.
 */

import type { NodeState, DefinedSchema, PropertyBuilder, InferCreateProps } from '@xnet/data'
import type { DataBridge, QueryOptions } from '@xnet/data-bridge'
import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'
import { createNativeBridge } from '@xnet/data-bridge'
import * as SecureStore from 'expo-secure-store'
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { ExpoSQLiteAdapter } from '../storage/ExpoSQLiteAdapter'
import 'react-native-get-random-values' // Polyfill crypto.getRandomValues

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XNetConfig {
  /** Database name for SQLite storage */
  dbName?: string
  /** Author DID (optional - will be generated if not provided) */
  authorDID?: string
  /** Signing key as hex string (optional - will be generated if not provided) */
  signingKeyHex?: string
  /** Signaling server URL for sync (optional) */
  signalingUrl?: string
  /** Enable debug logging */
  debug?: boolean
}

export interface XNetContextValue {
  /** The DataBridge for data operations */
  bridge: DataBridge | null
  /** The NodeStore (for direct access when needed) */
  store: NodeStore | null
  /** Whether the context is ready */
  isReady: boolean
  /** The current user's DID */
  authorDID: string | null
  /** Error during initialization */
  error: Error | null
  /** Storage adapter for direct SQLite access */
  storage: ExpoSQLiteAdapter | null
}

// ─── Context ──────────────────────────────────────────────────────────────────

const XNetContext = createContext<XNetContextValue | null>(null)

// ─── Identity Management ──────────────────────────────────────────────────────

const IDENTITY_KEY = 'xnet:identity'
const SIGNING_KEY = 'xnet:signingKey'

interface StoredIdentity {
  did: string
  signingKeyHex: string
}

/**
 * Generate a random Ed25519 keypair.
 * For now, we use a simple random key. In production, use expo-crypto.
 */
function generateSigningKey(): Uint8Array {
  const key = new Uint8Array(32)
  crypto.getRandomValues(key)
  return key
}

/**
 * Convert Uint8Array to hex string.
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Convert hex string to Uint8Array.
 */
function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Generate a DID:key from a public key.
 * Simplified version - in production use @xnet/identity.
 */
function generateDID(publicKey: Uint8Array): string {
  // Simple DID format for now
  const keyHex = toHex(publicKey.slice(0, 16)) // Use first 16 bytes
  return `did:key:z${keyHex}`
}

/**
 * Load or create identity from secure storage.
 */
async function loadOrCreateIdentity(): Promise<StoredIdentity> {
  try {
    // Try to load existing identity
    const storedDID = await SecureStore.getItemAsync(IDENTITY_KEY)
    const storedKey = await SecureStore.getItemAsync(SIGNING_KEY)

    if (storedDID && storedKey) {
      return { did: storedDID, signingKeyHex: storedKey }
    }
  } catch (err) {
    console.warn('[XNetProvider] Failed to load identity:', err)
  }

  // Generate new identity
  const signingKey = generateSigningKey()
  const signingKeyHex = toHex(signingKey)
  const did = generateDID(signingKey)

  // Store identity
  try {
    await SecureStore.setItemAsync(IDENTITY_KEY, did)
    await SecureStore.setItemAsync(SIGNING_KEY, signingKeyHex)
  } catch (err) {
    console.warn('[XNetProvider] Failed to store identity:', err)
  }

  return { did, signingKeyHex }
}

// ─── Provider Component ───────────────────────────────────────────────────────

export interface XNetProviderProps {
  children: React.ReactNode
  config?: XNetConfig
}

export function XNetProvider({ children, config = {} }: XNetProviderProps) {
  const [bridge, setBridge] = useState<DataBridge | null>(null)
  const [store, setStore] = useState<NodeStore | null>(null)
  const [storage, setStorage] = useState<ExpoSQLiteAdapter | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [authorDID, setAuthorDID] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const { dbName = 'xnet.db', debug = false } = config

  // Initialize xNet
  useEffect(() => {
    let mounted = true
    let cleanupBridge: DataBridge | null = null
    let cleanupStorage: ExpoSQLiteAdapter | null = null

    async function init() {
      try {
        if (debug) console.log('[XNetProvider] Initializing...')

        // Load or create identity
        const identity =
          config.authorDID && config.signingKeyHex
            ? { did: config.authorDID, signingKeyHex: config.signingKeyHex }
            : await loadOrCreateIdentity()

        if (!mounted) return

        if (debug) console.log('[XNetProvider] Identity loaded:', identity.did)

        // Create SQLite storage adapter
        const sqliteAdapter = new ExpoSQLiteAdapter(dbName)
        await sqliteAdapter.open()
        cleanupStorage = sqliteAdapter

        if (!mounted) {
          await sqliteAdapter.close()
          return
        }

        if (debug) console.log('[XNetProvider] Storage opened')

        // Create NodeStore with memory adapter
        // In the future, we'll integrate SQLite-backed adapter
        const signingKey = fromHex(identity.signingKeyHex)
        const nodeStore = new NodeStore({
          authorDID: identity.did as `did:key:${string}`,
          signingKey,
          storage: new MemoryNodeStorageAdapter()
        })
        await nodeStore.initialize()

        if (!mounted) {
          await sqliteAdapter.close()
          return
        }

        if (debug) console.log('[XNetProvider] NodeStore created')

        // Create NativeBridge
        const nativeBridge = createNativeBridge({
          store: nodeStore
        })
        cleanupBridge = nativeBridge

        if (!mounted) {
          nativeBridge.destroy()
          await sqliteAdapter.close()
          return
        }

        if (debug) console.log('[XNetProvider] NativeBridge created')

        // Update state
        setStorage(sqliteAdapter)
        setStore(nodeStore)
        setBridge(nativeBridge)
        setAuthorDID(identity.did)
        setIsReady(true)

        if (debug) console.log('[XNetProvider] Ready!')
      } catch (err) {
        console.error('[XNetProvider] Initialization failed:', err)
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }

    init()

    return () => {
      mounted = false
      if (cleanupBridge) {
        cleanupBridge.destroy()
      }
      if (cleanupStorage) {
        cleanupStorage.close().catch(console.error)
      }
    }
  }, [dbName, config.authorDID, config.signingKeyHex, debug])

  // Memoize context value
  const contextValue = useMemo<XNetContextValue>(
    () => ({
      bridge,
      store,
      isReady,
      authorDID,
      error,
      storage
    }),
    [bridge, store, isReady, authorDID, error, storage]
  )

  return <XNetContext.Provider value={contextValue}>{children}</XNetContext.Provider>
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Access the xNet context.
 */
export function useXNetContext(): XNetContextValue {
  const context = useContext(XNetContext)
  if (!context) {
    throw new Error('useXNetContext must be used within an XNetProvider')
  }
  return context
}

/**
 * Access the DataBridge.
 */
export function useDataBridge(): DataBridge | null {
  const { bridge } = useXNetContext()
  return bridge
}

/**
 * Access the NodeStore directly.
 */
export function useNodeStore(): NodeStore | null {
  const { store } = useXNetContext()
  return store
}

/**
 * Check if xNet is ready.
 */
export function useIsReady(): boolean {
  const { isReady } = useXNetContext()
  return isReady
}

/**
 * Get the current user's DID.
 */
export function useAuthorDID(): string | null {
  const { authorDID } = useXNetContext()
  return authorDID
}

// ─── Query Hook ───────────────────────────────────────────────────────────────

export interface UseQueryResult<T> {
  data: T[] | null
  loading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Query nodes from the store.
 */
export function useQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  options?: QueryOptions<P>
): UseQueryResult<NodeState> {
  const { bridge, isReady } = useXNetContext()
  const [data, setData] = useState<NodeState[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  const refetch = useCallback(() => {
    setRefetchTrigger((t) => t + 1)
  }, [])

  useEffect(() => {
    if (!bridge || !isReady) {
      setLoading(true)
      return
    }

    setLoading(true)
    setError(null)

    const subscription = bridge.query(schema, options)

    // Poll for updates (subscription pattern)
    const checkSnapshot = () => {
      const snapshot = subscription.getSnapshot()
      if (snapshot !== null) {
        setData(snapshot)
        setLoading(false)
      }
    }

    // Initial check
    checkSnapshot()

    // Subscribe to updates
    const unsubscribe = subscription.subscribe(checkSnapshot)

    return () => {
      unsubscribe()
    }
  }, [bridge, isReady, schema, options, refetchTrigger])

  return { data, loading, error, refetch }
}

// ─── Mutation Hook ────────────────────────────────────────────────────────────

export interface UseMutateResult<P extends Record<string, PropertyBuilder>> {
  create: (data: InferCreateProps<P>, id?: string) => Promise<NodeState>
  update: (nodeId: string, changes: Partial<InferCreateProps<P>>) => Promise<NodeState>
  remove: (nodeId: string) => Promise<void>
  restore: (nodeId: string) => Promise<NodeState>
}

/**
 * Mutation functions for a schema.
 */
export function useMutate<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>
): UseMutateResult<P> {
  const { bridge, isReady } = useXNetContext()

  const create = useCallback(
    async (data: InferCreateProps<P>, id?: string): Promise<NodeState> => {
      if (!bridge || !isReady) {
        throw new Error('xNet is not ready')
      }
      return bridge.create(schema, data, id)
    },
    [bridge, isReady, schema]
  )

  const update = useCallback(
    async (nodeId: string, changes: Partial<InferCreateProps<P>>): Promise<NodeState> => {
      if (!bridge || !isReady) {
        throw new Error('xNet is not ready')
      }
      return bridge.update(nodeId, changes as Record<string, unknown>)
    },
    [bridge, isReady]
  )

  const remove = useCallback(
    async (nodeId: string): Promise<void> => {
      if (!bridge || !isReady) {
        throw new Error('xNet is not ready')
      }
      return bridge.delete(nodeId)
    },
    [bridge, isReady]
  )

  const restore = useCallback(
    async (nodeId: string): Promise<NodeState> => {
      if (!bridge || !isReady) {
        throw new Error('xNet is not ready')
      }
      return bridge.restore(nodeId)
    },
    [bridge, isReady]
  )

  return { create, update, remove, restore }
}
