/**
 * Editor component using shared @xnet/editor
 */
import React, { useEffect, useState } from 'react'
import { RichTextEditor } from '@xnet/editor/react'
import * as Y from 'yjs'

interface Props {
  docId: string
  style?: React.CSSProperties
}

export function Editor({ docId, style }: Props) {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load document
  useEffect(() => {
    let mounted = true

    async function loadDocument() {
      try {
        setLoading(true)
        setError(null)

        const data = await window.xnetStorage.getDocument(docId)
        if (!mounted) return

        // Create Yjs document
        const doc = new Y.Doc({ guid: docId })

        // Apply stored state if exists
        if (data?.content && data.content.length > 0) {
          const state = new Uint8Array(data.content)
          Y.applyUpdate(doc, state)
        }

        setYdoc(doc)
        setLoading(false)

        // Set up auto-save on changes
        doc.on('update', async () => {
          if (!mounted) return
          const state = Y.encodeStateAsUpdate(doc)
          await window.xnetStorage.saveDocument(docId, {
            id: docId,
            content: Array.from(state),
            metadata: {
              created: Date.now(),
              updated: Date.now(),
              type: 'page'
            },
            version: 1
          })
        })
      } catch (err) {
        console.error('Failed to load document:', err)
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load document')
          setLoading(false)
        }
      }
    }

    loadDocument()

    return () => {
      mounted = false
      if (ydoc) {
        ydoc.destroy()
      }
    }
  }, [docId])

  if (loading) {
    return <div style={style}>Loading...</div>
  }

  if (error) {
    return <div style={style}>Error: {error}</div>
  }

  if (!ydoc) {
    return <div style={style}>No document</div>
  }

  return (
    <div style={style}>
      <RichTextEditor
        ydoc={ydoc}
        field="content"
        placeholder="Start typing..."
        showToolbar={true}
      />
    </div>
  )
}
