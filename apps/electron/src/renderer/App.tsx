/**
 * Electron App - Main component
 *
 * Uses @xnet/react hooks for data management:
 * - useQuery for listing documents
 * - useNode for editing documents
 * - useMutate for creating/deleting
 */

import React, { useCallback, useState } from 'react'
import { useQuery, useMutate } from '@xnet/react'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnet/data'
import { ThemeToggle } from '@xnet/ui'
import { Sidebar } from './components/Sidebar'
import { PageView } from './components/PageView'
import { DatabaseView } from './components/DatabaseView'
import { CanvasView } from './components/CanvasView'
import { AddSharedDialog } from './components/AddSharedDialog'
import { SettingsView } from './components/SettingsView'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'

type DocType = 'page' | 'database' | 'canvas'

interface DocumentItem {
  id: string
  title: string
  type: DocType
  createdAt?: number
  updatedAt?: number
}

export function App() {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [selectedDocType, setSelectedDocType] = useState<DocType>('page')
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Query all document types
  const { data: pages, loading: pagesLoading } = useQuery(PageSchema, { limit: 100 })
  const { data: databases, loading: databasesLoading } = useQuery(DatabaseSchema, { limit: 100 })
  const { data: canvases, loading: canvasesLoading } = useQuery(CanvasSchema, { limit: 100 })

  // Mutations
  const { create, remove } = useMutate()

  // Combine all documents into a single list
  const documents: DocumentItem[] = [
    ...pages.map((p) => ({
      id: p.id,
      title: p.title || 'Untitled',
      type: 'page' as DocType,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    })),
    ...databases.map((d) => ({
      id: d.id,
      title: d.title || 'Untitled',
      type: 'database' as DocType,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    })),
    ...canvases.map((c) => ({
      id: c.id,
      title: c.title || 'Untitled',
      type: 'canvas' as DocType,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))

  const isLoading = pagesLoading || databasesLoading || canvasesLoading

  // Handle document selection
  const handleSelect = useCallback(
    (id: string) => {
      const doc = documents.find((d) => d.id === id)
      if (doc) {
        setSelectedDocId(id)
        setSelectedDocType(doc.type)
      }
    },
    [documents]
  )

  // Handle document creation
  const handleCreate = useCallback(
    async (type: DocType) => {
      const titleMap: Record<DocType, string> = {
        page: 'Untitled Page',
        database: 'Untitled Database',
        canvas: 'Untitled Canvas'
      }

      let newDoc
      switch (type) {
        case 'page':
          newDoc = await create(PageSchema, { title: titleMap[type] })
          break
        case 'database':
          newDoc = await create(DatabaseSchema, { title: titleMap[type] })
          break
        case 'canvas':
          newDoc = await create(CanvasSchema, { title: titleMap[type] })
          break
      }

      if (newDoc) {
        setSelectedDocId(newDoc.id)
        setSelectedDocType(type)
      }
    },
    [create]
  )

  // Handle document deletion
  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id)
      if (selectedDocId === id) {
        setSelectedDocId(null)
      }
    },
    [remove, selectedDocId]
  )

  // Handle adding a shared document
  // The share string is encoded as "type:docId" (e.g. "database:abc-123")
  // Falls back to 'page' for bare IDs (backwards compatibility)
  const handleAddShared = useCallback((shareString: string) => {
    let docType: DocType = 'page'
    let docId = shareString

    const colonIdx = shareString.indexOf(':')
    if (colonIdx > 0) {
      const prefix = shareString.slice(0, colonIdx)
      if (prefix === 'page' || prefix === 'database' || prefix === 'canvas') {
        docType = prefix
        docId = shareString.slice(colonIdx + 1)
      }
    }

    setSelectedDocId(docId)
    setSelectedDocType(docType)
  }, [])

  // Render content based on document type or settings
  const renderContent = () => {
    // Show settings if open
    if (showSettings) {
      return <SettingsView onClose={() => setShowSettings(false)} />
    }

    if (!selectedDocId) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <p className="text-lg mb-2">Welcome to xNet</p>
          <p className="text-sm">Select a document or create a new one</p>
        </div>
      )
    }

    switch (selectedDocType) {
      case 'page':
        return <PageView docId={selectedDocId} />
      case 'database':
        return <DatabaseView docId={selectedDocId} />
      case 'canvas':
        return <CanvasView docId={selectedDocId} />
      default:
        return null
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background">
        <div className="animate-pulse">
          <p className="text-muted-foreground">Loading xNet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Titlebar */}
      <header className="h-[38px] bg-secondary flex items-center justify-between px-4 pr-20 border-b border-border relative">
        <div className="absolute inset-0 titlebar-drag" />
        <h1 className="text-sm font-semibold z-10 text-foreground">xNet</h1>
        <ThemeToggle className="z-10 h-7 w-7 titlebar-no-drag" />
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
          onAddShared={() => setShowAddSharedDialog(true)}
          onSettings={() => setShowSettings(true)}
        />

        {/* Content area */}
        <section className="flex-1 flex flex-col overflow-hidden">{renderContent()}</section>
      </main>

      {/* Add Shared Dialog */}
      <AddSharedDialog
        isOpen={showAddSharedDialog}
        onClose={() => setShowAddSharedDialog(false)}
        onAdd={handleAddShared}
      />

      {/* Auto-install bundled plugins */}
      <BundledPluginInstaller />
    </div>
  )
}
