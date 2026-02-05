/**
 * Node hook for Expo
 */
import type { XDocument } from '@xnet/sdk'
import { useState, useEffect, useCallback } from 'react'
import { useXNet } from './useXNet'

interface UseNodeResult {
  document: XDocument | null
  loading: boolean
  error: Error | null
  updateTitle: (title: string) => Promise<void>
  updateContent: (content: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useNode(docId: string | null): UseNodeResult {
  const { client, isReady } = useXNet()
  const [document, setDocument] = useState<XDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!client || !docId || !isReady) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const doc = await client.getDocument(docId)
      setDocument(doc)
    } catch (e) {
      setError(e as Error)
    } finally {
      setLoading(false)
    }
  }, [client, docId, isReady])

  useEffect(() => {
    load()
  }, [load])

  const updateTitle = useCallback(
    async (title: string) => {
      if (!document) return
      document.metadata.title = title
      // Re-fetch to refresh state
      await load()
    },
    [document, load]
  )

  const updateContent = useCallback(
    async (content: string) => {
      if (!document) return
      const text = document.ydoc.getText('content')
      text.delete(0, text.length)
      text.insert(0, content)
      // Re-fetch to refresh state
      await load()
    },
    [document, load]
  )

  return {
    document,
    loading,
    error,
    updateTitle,
    updateContent,
    refresh: load
  }
}
