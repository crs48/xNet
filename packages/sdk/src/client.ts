/**
 * XNet client - unified API for all xNet operations
 */
import type { StorageAdapter, DocumentData } from '@xnet/storage'
import { MemoryAdapter } from '@xnet/storage'
import { generateKeyBundle, type Identity, type KeyBundle } from '@xnet/identity'
import type { NetworkNode, NetworkConfig } from '@xnet/network'
import {
  createDocument,
  loadDocument,
  getDocumentState,
  type XDocument,
  type DocumentType
} from '@xnet/data'
import {
  createLocalQueryEngine,
  createSearchIndex,
  type Query,
  type QueryResult
} from '@xnet/query'

/**
 * XNet client configuration
 */
export interface XNetClientConfig {
  /** Storage adapter (default: Memory for now) */
  storage?: StorageAdapter
  /** Network configuration */
  network?: Partial<NetworkConfig>
  /** Enable P2P networking (default: false for now) */
  enableNetwork?: boolean
  /** Existing identity to use */
  identity?: Identity
  /** Existing key bundle */
  keyBundle?: KeyBundle
}

/**
 * Options for creating a document
 */
export interface CreateDocOptions {
  workspace: string
  type: DocumentType
  title: string
  parent?: string
}

/**
 * XNet client interface
 */
export interface XNetClient {
  // Lifecycle
  readonly isReady: boolean
  readonly identity: Identity
  start(): Promise<void>
  stop(): Promise<void>

  // Documents
  createDocument(options: CreateDocOptions): Promise<XDocument>
  getDocument(id: string): Promise<XDocument | null>
  deleteDocument(id: string): Promise<void>
  listDocuments(prefix?: string): Promise<string[]>

  // Queries
  query<T>(query: Query): Promise<QueryResult<T>>
  search(text: string, limit?: number): Promise<{ id: string; title: string; score: number }[]>

  // Network
  readonly peers: string[]
  readonly syncStatus: 'offline' | 'connecting' | 'synced'
  connectToPeer(multiaddr: string): Promise<void>

  // Events
  on(event: string, handler: (arg: string) => void): () => void
}

/**
 * Create an XNet client
 */
export async function createXNetClient(config: XNetClientConfig = {}): Promise<XNetClient> {
  // Initialize storage
  const storage = config.storage ?? new MemoryAdapter()
  await storage.open()

  // Initialize identity
  const keyBundle = config.keyBundle ?? generateKeyBundle()
  const identity = config.identity ?? keyBundle.identity

  // Initialize search index
  const searchIndex = createSearchIndex()

  // Initialize network (optional, lazy-loaded to avoid bundling native deps)
  let networkNode: NetworkNode | null = null
  if (config.enableNetwork === true) {
    try {
      const { createNode } = await import('@xnet/network')
      networkNode = await createNode({
        did: identity.did,
        privateKey: keyBundle.signingKey,
        config: config.network
      })
    } catch (e) {
      console.warn('Failed to start network:', e)
    }
  }

  // Document cache
  const documentCache = new Map<string, XDocument>()

  // Event handlers
  const eventHandlers = new Map<string, Set<(arg: unknown) => void>>()

  // Query engine
  const queryEngine = createLocalQueryEngine(storage, async (id) => {
    return documentCache.get(id) ?? null
  })

  let isReady = true
  let syncStatus: 'offline' | 'connecting' | 'synced' = networkNode ? 'connecting' : 'offline'

  function emit(event: string, ...args: unknown[]) {
    eventHandlers.get(event)?.forEach((h) => h(args[0]))
  }

  function generateId(): string {
    return Math.random().toString(36).substring(2, 15)
  }

  const client: XNetClient = {
    get isReady() {
      return isReady
    },
    get identity() {
      return identity
    },
    get peers() {
      return []
    },
    get syncStatus() {
      return syncStatus
    },

    async start(): Promise<void> {
      if (networkNode) {
        syncStatus = 'synced'
        emit('sync:status', syncStatus)
      }
    },

    async stop(): Promise<void> {
      if (networkNode) {
        await networkNode.libp2p.stop()
        networkNode = null
      }
      await storage.close()
      isReady = false
    },

    async createDocument(options: CreateDocOptions): Promise<XDocument> {
      const id = `${options.workspace}/${generateId()}`
      const doc = createDocument({
        id,
        workspace: options.workspace,
        type: options.type,
        title: options.title,
        createdBy: identity.did,
        signingKey: keyBundle.signingKey
      })

      // Save to storage
      const state = getDocumentState(doc)
      const docData: DocumentData = {
        id,
        content: state,
        metadata: {
          created: Date.now(),
          updated: Date.now(),
          type: options.type,
          workspace: options.workspace
        },
        version: 1
      }
      await storage.setDocument(id, docData)

      // Add to cache and search index
      documentCache.set(id, doc)
      searchIndex.add(doc)

      return doc
    },

    async getDocument(id: string): Promise<XDocument | null> {
      // Check cache
      if (documentCache.has(id)) {
        return documentCache.get(id)!
      }

      // Load from storage
      const stored = await storage.getDocument(id)
      if (!stored) return null

      const doc = loadDocument(
        id,
        stored.metadata.workspace ?? '',
        stored.metadata.type as DocumentType,
        stored.content
      )
      documentCache.set(id, doc)
      searchIndex.add(doc)

      return doc
    },

    async deleteDocument(id: string): Promise<void> {
      await storage.deleteDocument(id)
      documentCache.delete(id)
      searchIndex.remove(id)
    },

    async listDocuments(prefix?: string): Promise<string[]> {
      return storage.listDocuments(prefix)
    },

    async query<T>(query: Query): Promise<QueryResult<T>> {
      return queryEngine.query<T>(query)
    },

    async search(text: string, limit = 20) {
      const results = searchIndex.search({ text, limit })
      return results.map((r) => ({ id: r.id, title: r.title, score: r.score }))
    },

    async connectToPeer(_multiaddr: string): Promise<void> {
      if (!networkNode) throw new Error('Network not enabled')
      // Would connect to peer via libp2p multiaddr
      // Implementation deferred until network is stable
    },

    on(event: string, handler: (arg: string) => void): () => void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler as (arg: unknown) => void)
      return () => eventHandlers.get(event)?.delete(handler as (arg: unknown) => void)
    }
  }

  return client
}
