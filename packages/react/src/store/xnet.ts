/**
 * Zustand store for xNet state management
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import * as Y from 'yjs'
import type { XDocument } from '@xnet/data'
import type { StorageAdapter } from '@xnet/storage'

/**
 * Document state in the store
 */
export interface DocumentState {
  doc: XDocument | null
  loading: boolean
  error?: Error
  dirty: boolean
}

/**
 * XNet store state
 */
export interface XNetState {
  documents: Map<string, DocumentState>
  syncStatus: 'offline' | 'connecting' | 'synced'
  peers: string[]
}

/**
 * Options for creating a document
 */
export interface CreateDocumentOptions {
  workspace?: string
  type?: 'page' | 'task' | 'database' | 'canvas'
  title?: string
}

/**
 * XNet store actions
 */
export interface XNetActions {
  loadDocument: (id: string) => Promise<XDocument | null>
  createDocument: (id: string, options?: CreateDocumentOptions) => Promise<XDocument>
  updateDocument: (id: string, updater: (doc: XDocument) => void) => void
  setDocument: (id: string, doc: XDocument) => void
  setSyncStatus: (status: XNetState['syncStatus']) => void
  setPeers: (peers: string[]) => void
}

/**
 * Combined XNet store type
 */
export type XNetStore = UseBoundStore<StoreApi<XNetState & XNetActions>>

/**
 * Store configuration
 */
export interface StoreConfig {
  storage: StorageAdapter
}

/**
 * Create an XNet store instance
 */
export function createXNetStore(config: StoreConfig): XNetStore {
  return create<XNetState & XNetActions>((set, get) => ({
    documents: new Map(),
    syncStatus: 'offline',
    peers: [],

    async loadDocument(id: string): Promise<XDocument | null> {
      const existing = get().documents.get(id)
      if (existing && !existing.loading && existing.doc) {
        return existing.doc
      }

      // Mark as loading
      set((state) => {
        const docs = new Map(state.documents)
        docs.set(id, { doc: null, loading: true, dirty: false })
        return { documents: docs }
      })

      try {
        // Load from storage
        const stored = await config.storage.getDocument(id)
        if (!stored) {
          // Mark as not found (loading: false, doc: null) to prevent infinite loops
          set((state) => {
            const docs = new Map(state.documents)
            docs.set(id, { doc: null, loading: false, dirty: false })
            return { documents: docs }
          })
          return null
        }

        // Create Yjs document and load state
        const ydoc = new Y.Doc({ guid: id })
        if (stored.content && stored.content.length > 0) {
          Y.applyUpdate(ydoc, stored.content)
        }

        const doc: XDocument = {
          id,
          ydoc,
          workspace: stored.metadata.workspace ?? '',
          type: stored.metadata.type as 'page' | 'task' | 'database' | 'canvas',
          metadata: {
            title: (ydoc.getMap('metadata').get('title') as string) ?? 'Untitled',
            created: stored.metadata.created,
            updated: stored.metadata.updated,
            createdBy: '',
            archived: false
          }
        }

        set((state) => {
          const docs = new Map(state.documents)
          docs.set(id, { doc, loading: false, dirty: false })
          return { documents: docs }
        })

        return doc
      } catch (error) {
        set((state) => {
          const docs = new Map(state.documents)
          docs.set(id, { doc: null, loading: false, error: error as Error, dirty: false })
          return { documents: docs }
        })
        return null
      }
    },

    async createDocument(id: string, options: CreateDocumentOptions = {}): Promise<XDocument> {
      const { workspace = 'default', type = 'page', title = 'Untitled' } = options
      const now = Date.now()

      // Create a real Yjs document
      const ydoc = new Y.Doc({ guid: id })

      // Initialize metadata
      const meta = ydoc.getMap('metadata')
      meta.set('title', title)
      meta.set('created', now)
      meta.set('updated', now)
      meta.set('createdBy', '')
      meta.set('archived', false)

      // Initialize content text for the Editor
      ydoc.getText('content')

      const doc: XDocument = {
        id,
        ydoc,
        workspace,
        type,
        metadata: {
          title,
          created: now,
          updated: now,
          createdBy: '',
          archived: false
        }
      }

      // Save to storage
      await config.storage.setDocument(id, {
        id,
        content: Y.encodeStateAsUpdate(ydoc),
        metadata: {
          created: now,
          updated: now,
          type,
          workspace
        },
        version: 1
      })

      // Update store
      set((state) => {
        const docs = new Map(state.documents)
        docs.set(id, { doc, loading: false, dirty: false })
        return { documents: docs }
      })

      return doc
    },

    updateDocument(id: string, updater: (doc: XDocument) => void): void {
      const state = get().documents.get(id)
      if (!state?.doc) return

      updater(state.doc)

      set((s) => {
        const docs = new Map(s.documents)
        docs.set(id, { ...state, dirty: true })
        return { documents: docs }
      })
    },

    setDocument(id: string, doc: XDocument): void {
      set((state) => {
        const docs = new Map(state.documents)
        docs.set(id, { doc, loading: false, dirty: false })
        return { documents: docs }
      })
    },

    setSyncStatus(status: XNetState['syncStatus']): void {
      set({ syncStatus: status })
    },

    setPeers(peers: string[]): void {
      set({ peers })
    }
  }))
}
