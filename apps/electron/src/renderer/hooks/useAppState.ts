/**
 * App state hook - manages documents and initialization
 */

import { useState, useEffect, useCallback } from 'react'
import type { Document, AppState } from '../lib/types'

export function useAppState() {
  const [identity, setIdentity] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initialize xNet client
  useEffect(() => {
    async function init() {
      try {
        const { did } = await window.xnet.init()
        setIdentity(did)
        await refreshDocuments()
        setIsLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize')
        setIsLoading(false)
      }
    }
    init()

    return () => {
      window.xnet?.stop()
    }
  }, [])

  const refreshDocuments = useCallback(async () => {
    const docIds = await window.xnet.listDocuments()
    const docs: Document[] = []
    for (const id of docIds) {
      const doc = await window.xnet.getDocument(id)
      if (doc) {
        docs.push({
          id: doc.id,
          title: doc.title,
          type: (doc.type as Document['type']) || 'page',
          createdAt: doc.created,
          updatedAt: doc.updated
        })
      }
    }
    setDocuments(docs)
  }, [])

  const createDocument = useCallback(
    async (type: Document['type'], title = 'Untitled') => {
      try {
        const doc = await window.xnet.createDocument({
          workspace: 'default',
          type,
          title
        })
        await refreshDocuments()
        return doc.id
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create document')
        return null
      }
    },
    [refreshDocuments]
  )

  const deleteDocument = useCallback(
    async (id: string) => {
      await window.xnet.deleteDocument(id)
      await refreshDocuments()
    },
    [refreshDocuments]
  )

  const renameDocument = useCallback(
    async (id: string, title: string) => {
      // Update in storage
      const data = await window.xnetStorage.getDocument(id)
      if (data) {
        await window.xnetStorage.setDocument(id, {
          ...data,
          metadata: { ...data.metadata, title, updated: Date.now() }
        })
        await refreshDocuments()
      }
    },
    [refreshDocuments]
  )

  return {
    identity,
    documents,
    isLoading,
    error,
    createDocument,
    deleteDocument,
    renameDocument,
    refreshDocuments
  }
}
