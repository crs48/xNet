/**
 * Electron App - Main component
 *
 * Uses IPC to communicate with main process for document operations,
 * and @xnet/editor/react for the rich text editor.
 */
import React, { useEffect, useState, useCallback } from 'react'
import { RichTextEditor } from '@xnet/editor/react'
import * as Y from 'yjs'

interface Document {
  id: string
  title: string
}

export function App() {
  const [identity, setIdentity] = useState<string | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
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

  // Listen for new page menu command
  useEffect(() => {
    if (!window.xnet) return
    return window.xnet.onNewPage(() => {
      createDoc()
    })
  }, [])

  const refreshDocuments = async () => {
    const docIds = await window.xnet.listDocuments()
    const docs: Document[] = []
    for (const id of docIds) {
      const doc = await window.xnet.getDocument(id)
      if (doc) {
        docs.push({ id: doc.id, title: doc.title })
      }
    }
    setDocuments(docs)
  }

  const createDoc = useCallback(async () => {
    try {
      const doc = await window.xnet.createDocument({
        workspace: 'default',
        type: 'page',
        title: 'Untitled'
      })
      await refreshDocuments()
      selectDoc(doc.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    }
  }, [])

  const selectDoc = async (id: string) => {
    // Clean up previous ydoc
    if (ydoc) {
      ydoc.destroy()
    }

    setSelectedDocId(id)

    try {
      const data = await window.xnetStorage.getDocument(id)

      // Create new Y.Doc
      const doc = new Y.Doc({ guid: id })

      // Apply stored state if exists
      if (data?.content && data.content.length > 0) {
        const state = new Uint8Array(data.content)
        Y.applyUpdate(doc, state)
      }

      // Auto-save on changes
      doc.on('update', async () => {
        const state = Y.encodeStateAsUpdate(doc)
        await window.xnetStorage.setDocument(id, {
          id,
          content: Array.from(state),
          metadata: {
            created: data?.metadata?.created ?? Date.now(),
            updated: Date.now(),
            type: 'page'
          },
          version: 1
        })
      })

      setYdoc(doc)
    } catch (err) {
      console.error('Failed to load document:', err)
    }
  }

  const deleteDoc = async (id: string) => {
    await window.xnet.deleteDocument(id)
    await refreshDocuments()
    if (selectedDocId === id) {
      setSelectedDocId(null)
      if (ydoc) {
        ydoc.destroy()
        setYdoc(null)
      }
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ydoc) {
        ydoc.destroy()
      }
    }
  }, [ydoc])

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-text-secondary">Loading xNet...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-red-500 mb-4">Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-bg-primary">
      {/* Titlebar */}
      <header className="h-[38px] bg-bg-secondary flex items-center justify-between px-4 pr-20 border-b border-border relative">
        <div className="absolute inset-0 titlebar-drag" />
        <h1 className="text-sm font-semibold z-10">xNet</h1>
        <span className="text-xs text-text-secondary z-10">
          {identity ? `${identity.slice(0, 20)}...` : ''}
        </span>
      </header>

      {/* Main content */}
      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[250px] bg-bg-secondary border-r border-border flex flex-col p-4">
          <button
            onClick={createDoc}
            className="w-full bg-primary text-white border-none px-4 py-2 rounded-md cursor-pointer text-sm mb-4 hover:bg-primary-hover transition-colors"
          >
            + New Page
          </button>

          <ul className="list-none p-0 m-0 flex-1 overflow-auto">
            {documents.map((doc) => (
              <li
                key={doc.id}
                onClick={() => selectDoc(doc.id)}
                className={`px-3 py-2 rounded-md cursor-pointer mb-1 flex justify-between items-center group transition-colors ${
                  selectedDocId === doc.id ? 'bg-bg-tertiary' : 'hover:bg-bg-tertiary/50'
                }`}
              >
                <span className="text-sm truncate">{doc.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteDoc(doc.id)
                  }}
                  className="bg-transparent border-none text-text-secondary cursor-pointer p-1 text-base opacity-0 group-hover:opacity-50 hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {documents.length === 0 && (
            <p className="text-text-secondary text-sm text-center mt-5">No documents yet</p>
          )}
        </aside>

        {/* Editor area */}
        <section className="flex-1 flex flex-col p-6 overflow-auto">
          {selectedDocId && ydoc ? (
            <RichTextEditor
              ydoc={ydoc}
              field="content"
              placeholder="Start typing..."
              showToolbar={true}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-text-secondary">Select a document or create a new one</p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
