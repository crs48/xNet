/**
 * Hook for managing Y.Doc lifecycle
 */

import { useState, useEffect, useCallback } from 'react'
import * as Y from 'yjs'

export function useYDoc(docId: string | null) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!docId) {
      if (ydoc) {
        ydoc.destroy()
        setYdoc(null)
      }
      return
    }

    let currentDoc: Y.Doc | null = null

    async function loadDoc() {
      setIsLoading(true)

      try {
        const data = await window.xnetStorage.getDocument(docId)

        // Create new Y.Doc
        const doc = new Y.Doc({ guid: docId })
        currentDoc = doc

        // Apply stored state if exists
        if (data?.content && data.content.length > 0) {
          const state = new Uint8Array(data.content)
          Y.applyUpdate(doc, state)
        }

        // Auto-save on changes
        doc.on('update', async () => {
          const state = Y.encodeStateAsUpdate(doc)
          await window.xnetStorage.setDocument(docId, {
            id: docId,
            content: Array.from(state),
            metadata: {
              created: data?.metadata?.created ?? Date.now(),
              updated: Date.now(),
              type: data?.metadata?.type ?? 'page'
            },
            version: 1
          })
        })

        setYdoc(doc)
      } catch (err) {
        console.error('Failed to load document:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadDoc()

    return () => {
      if (currentDoc) {
        currentDoc.destroy()
      }
    }
  }, [docId])

  return { ydoc, isLoading }
}
