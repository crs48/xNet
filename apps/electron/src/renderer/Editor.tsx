/**
 * Editor component using shared @xnet/editor
 */
import React, { useEffect, useState } from 'react'
import { createEditor, type Editor as EditorCore } from '@xnet/editor'
import * as Y from 'yjs'

interface Props {
  docId: string
  style?: React.CSSProperties
}

export function Editor({ docId, style }: Props) {
  const [editor, setEditor] = useState<EditorCore | null>(null)
  const [content, setContent] = useState('')
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)

  // Load document and create editor
  useEffect(() => {
    let mounted = true
    let currentEditor: EditorCore | null = null

    async function loadDocument() {
      try {
        const data = await window.xnetStorage.getDocument(docId)
        if (!mounted) return

        // Create Yjs document
        const doc = new Y.Doc({ guid: docId })

        // Apply stored state if exists
        if (data?.content && data.content.length > 0) {
          const state = new Uint8Array(data.content)
          Y.applyUpdate(doc, state)
        } else {
          // Initialize content field for new documents
          doc.getText('content')
        }

        setYdoc(doc)

        // Create editor instance
        currentEditor = createEditor({
          ydoc: doc,
          field: 'content',
          onChange: (newContent) => {
            if (mounted) {
              setContent(newContent)
            }
          }
        })

        setEditor(currentEditor)
        setContent(currentEditor.getContent())
      } catch (err) {
        console.error('Failed to load document:', err)
      }
    }

    loadDocument()

    return () => {
      mounted = false
      currentEditor?.destroy()
    }
  }, [docId])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editor) return

    const newValue = e.target.value
    const oldValue = editor.getContent()

    if (newValue !== oldValue) {
      editor.applyDelta(oldValue, newValue, e.target.selectionStart ?? 0)
    }
  }

  return (
    <textarea
      style={style}
      value={content}
      onChange={handleChange}
      placeholder="Start typing..."
    />
  )
}
