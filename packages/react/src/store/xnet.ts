/**
 * Zustand store for xNet state management
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand'
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
 * XNet store actions
 */
export interface XNetActions {
  loadDocument: (id: string) => Promise<XDocument | null>
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
          set((state) => {
            const docs = new Map(state.documents)
            docs.delete(id)
            return { documents: docs }
          })
          return null
        }

        // Create placeholder XDocument from stored data
        // In real implementation, would reconstruct full Yjs doc
        const doc = {
          id,
          ydoc: null,
          workspace: stored.metadata.workspace ?? '',
          type: stored.metadata.type as 'page' | 'task' | 'database' | 'canvas',
          metadata: {
            title: 'Untitled',
            created: stored.metadata.created,
            updated: stored.metadata.updated,
            createdBy: '',
            archived: false
          }
        } as unknown as XDocument

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
