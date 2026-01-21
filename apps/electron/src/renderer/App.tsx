/**
 * Electron App - Main component
 *
 * Integrates xNet packages:
 * - @xnet/editor for rich text editing
 * - @xnet/views for table/board views
 * - @xnet/canvas for infinite canvas
 */

import React, { useEffect, useCallback } from 'react'
import { Sidebar } from './components/Sidebar'
import { PageView } from './components/PageView'
import { DatabaseView } from './components/DatabaseView'
import { CanvasView } from './components/CanvasView'
import { useAppState } from './hooks/useAppState'
import { useYDoc } from './hooks/useYDoc'
import type { Document } from './lib/types'

export function App() {
  const { identity, documents, isLoading, error, createDocument, deleteDocument } = useAppState()

  const [selectedDocId, setSelectedDocId] = React.useState<string | null>(null)
  const [selectedDocType, setSelectedDocType] = React.useState<Document['type']>('page')

  const { ydoc, isLoading: docLoading } = useYDoc(selectedDocId)

  // Listen for new page menu command
  useEffect(() => {
    if (!window.xnet) return
    return window.xnet.onNewPage(() => {
      handleCreate('page')
    })
  }, [])

  // Handle document selection
  const handleSelect = useCallback(
    (id: string) => {
      const doc = documents.find((d) => d.id === id)
      if (doc) {
        setSelectedDocId(id)
        setSelectedDocType(doc.type || 'page')
      }
    },
    [documents]
  )

  // Handle document creation
  const handleCreate = useCallback(
    async (type: Document['type']) => {
      const titleMap: Record<Document['type'], string> = {
        page: 'Untitled Page',
        database: 'Untitled Database',
        canvas: 'Untitled Canvas'
      }
      const id = await createDocument(type, titleMap[type])
      if (id) {
        setSelectedDocId(id)
        setSelectedDocType(type)
      }
    },
    [createDocument]
  )

  // Handle document deletion
  const handleDelete = useCallback(
    async (id: string) => {
      await deleteDocument(id)
      if (selectedDocId === id) {
        setSelectedDocId(null)
      }
    },
    [deleteDocument, selectedDocId]
  )

  // Render content based on document type
  const renderContent = () => {
    if (!selectedDocId) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-text-secondary">
          <p className="text-lg mb-2">Welcome to xNet</p>
          <p className="text-sm">Select a document or create a new one</p>
        </div>
      )
    }

    switch (selectedDocType) {
      case 'page':
        return ydoc ? <PageView ydoc={ydoc} isLoading={docLoading} /> : null
      case 'database':
        return <DatabaseView docId={selectedDocId} ydoc={ydoc} isLoading={docLoading} />
      case 'canvas':
        return <CanvasView docId={selectedDocId} ydoc={ydoc} isLoading={docLoading} />
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-bg-primary">
        <div className="animate-pulse">
          <p className="text-text-secondary">Loading xNet...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-bg-primary">
        <p className="text-red-500 mb-4">Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-hover transition-colors"
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
        <Sidebar
          documents={documents}
          selectedId={selectedDocId}
          onSelect={handleSelect}
          onDelete={handleDelete}
          onCreate={handleCreate}
        />

        {/* Content area */}
        <section className="flex-1 flex flex-col overflow-hidden">{renderContent()}</section>
      </main>
    </div>
  )
}
