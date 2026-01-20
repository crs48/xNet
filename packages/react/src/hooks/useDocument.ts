/**
 * useDocument hook for loading and managing documents
 */
import { useEffect, useCallback } from 'react'
import { useXNet } from '../context'
import type { XDocument } from '@xnet/data'

/**
 * Options for useDocument hook
 */
export interface UseDocumentOptions {
  autoLoad?: boolean
}

/**
 * Result from useDocument hook
 */
export interface UseDocumentResult<T = XDocument> {
  data: T | null
  loading: boolean
  error?: Error
  dirty: boolean
  update: (updater: (data: T) => void) => void
  refresh: () => Promise<void>
}

/**
 * Hook for loading and managing a document
 */
export function useDocument<T = XDocument>(
  docId: string | null,
  options: UseDocumentOptions = {}
): UseDocumentResult<T> {
  const { autoLoad = true } = options
  const { store, isReady } = useXNet()

  // Subscribe to document state from store
  const docState = store((state) => docId ? state.documents.get(docId) : undefined)

  // Load document on mount
  useEffect(() => {
    if (autoLoad && isReady && docId && !docState) {
      store.getState().loadDocument(docId)
    }
  }, [autoLoad, isReady, docId, docState, store])

  const update = useCallback((updater: (data: T) => void) => {
    if (docId) {
      store.getState().updateDocument(docId, (doc) => {
        updater(doc as unknown as T)
      })
    }
  }, [docId, store])

  const refresh = useCallback(async () => {
    if (docId) {
      await store.getState().loadDocument(docId)
    }
  }, [docId, store])

  return {
    data: (docState?.doc as T) ?? null,
    loading: docState?.loading ?? (autoLoad && !!docId),
    error: docState?.error,
    dirty: docState?.dirty ?? false,
    update,
    refresh
  }
}
