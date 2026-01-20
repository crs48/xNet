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
  saveDocument: (id: string) => Promise<void>
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
  /** Auto-save debounce delay in ms (default: 1000) */
  autoSaveDelay?: number
}

// Track pending save timeouts per document
const saveTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Create an XNet store instance
 */
export function createXNetStore(config: StoreConfig): XNetStore {
  const autoSaveDelay = config.autoSaveDelay ?? 1000

  // Helper to schedule auto-save
  const scheduleAutoSave = (id: string, get: () => XNetState & XNetActions) => {
    // Clear existing timeout
    const existing = saveTimeouts.get(id)
    if (existing) clearTimeout(existing)

    // Schedule new save
    const timeout = setTimeout(() => {
      saveTimeouts.delete(id)
      get().saveDocument(id)
    }, autoSaveDelay)
    saveTimeouts.set(id, timeout)
  }

  // Setup Yjs observer for auto-save
  const setupYjsObserver = (doc: XDocument, get: () => XNetState & XNetActions) => {
    doc.ydoc.on('update', () => {
      scheduleAutoSave(doc.id, get)
    })
  }

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

        // Setup auto-save on Yjs updates
        setupYjsObserver(doc, get)

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

      // Initialize content fragment for the Editor (Tiptap uses XmlFragment)
      ydoc.getXmlFragment('content')

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

      // Setup auto-save on Yjs updates
      setupYjsObserver(doc, get)

      // Update store
      set((state) => {
        const docs = new Map(state.documents)
        docs.set(id, { doc, loading: false, dirty: false })
        return { documents: docs }
      })

      return doc
    },

    async saveDocument(id: string): Promise<void> {
      const state = get().documents.get(id)
      if (!state?.doc) return

      const doc = state.doc
      const now = Date.now()

      try {
        await config.storage.setDocument(id, {
          id,
          content: Y.encodeStateAsUpdate(doc.ydoc),
          metadata: {
            created: doc.metadata.created,
            updated: now,
            type: doc.type,
            workspace: doc.workspace
          },
          version: 1
        })

        // Update metadata and clear dirty flag
        doc.metadata.updated = now
        set((s) => {
          const docs = new Map(s.documents)
          docs.set(id, { ...state, dirty: false })
          return { documents: docs }
        })
      } catch (error) {
        console.error('Failed to save document:', id, error)
      }
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
