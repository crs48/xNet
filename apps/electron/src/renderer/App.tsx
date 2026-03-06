/**
 * Electron App - Main component
 */

import type { PaletteCommand } from '@xnetjs/ui'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useDevTools } from '@xnetjs/devtools'
import { useQuery, useMutate } from '@xnetjs/react'
import { CommandPalette, useCommandPalette } from '@xnetjs/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionDock } from './components/ActionDock'
import { AddSharedDialog, type AddSharedInput } from './components/AddSharedDialog'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { CanvasView, type CanvasViewHandle } from './components/CanvasView'
import { DatabaseView } from './components/DatabaseView'
import { PageView } from './components/PageView'
import { SettingsView } from './components/SettingsView'
import { SystemMenu } from './components/SystemMenu'

type DocType = 'page' | 'database' | 'canvas'

type ViewportSnapshot = {
  x: number
  y: number
  zoom: number
}

type ShellState =
  | { kind: 'canvas-home' }
  | { kind: 'page-focus'; docId: string; returnViewport: ViewportSnapshot | null }
  | { kind: 'database-focus'; docId: string; returnViewport: ViewportSnapshot | null }
  | { kind: 'settings' }

interface DocumentItem {
  id: string
  title: string
  type: DocType
  createdAt?: number
  updatedAt?: number
}

const OVERLAY_OPEN_DELAY_MS = 180

export function App(): React.ReactElement {
  const [homeCanvasId, setHomeCanvasId] = useState<string | null>(null)
  const [shellState, setShellState] = useState<ShellState>({ kind: 'canvas-home' })
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const [prefilledShareValue, setPrefilledShareValue] = useState('')
  const { setActiveNodeId } = useDevTools()
  const { create } = useMutate()
  const { open: paletteOpen, setOpen: setPaletteOpen, show: showPalette } = useCommandPalette()
  const canvasViewRef = useRef<CanvasViewHandle>(null)
  const creatingHomeCanvasRef = useRef(false)
  const transitionTimerRef = useRef<number | null>(null)

  const { data: pages, loading: pagesLoading } = useQuery(PageSchema, { limit: 100 })
  const { data: databases, loading: databasesLoading } = useQuery(DatabaseSchema, { limit: 100 })
  const { data: canvases, loading: canvasesLoading } = useQuery(CanvasSchema, { limit: 100 })

  const documents: DocumentItem[] = useMemo(
    () =>
      [
        ...pages.map((page) => ({
          id: page.id,
          title: page.title || 'Untitled Page',
          type: 'page' as const,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt
        })),
        ...databases.map((database) => ({
          id: database.id,
          title: database.title || 'Untitled Database',
          type: 'database' as const,
          createdAt: database.createdAt,
          updatedAt: database.updatedAt
        })),
        ...canvases.map((canvas) => ({
          id: canvas.id,
          title: canvas.title || 'Workspace Canvas',
          type: 'canvas' as const,
          createdAt: canvas.createdAt,
          updatedAt: canvas.updatedAt
        }))
      ].sort(
        (left, right) =>
          (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
      ),
    [canvases, databases, pages]
  )

  const isLoading = pagesLoading || databasesLoading || canvasesLoading
  const recentDocuments = useMemo(() => documents.slice(0, 6), [documents])

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current)
      transitionTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const cleanup = window.xnet.onSharePayload((payload) => {
      setPrefilledShareValue(payload)
      setShowAddSharedDialog(true)
    })
    return cleanup
  }, [])

  useEffect(() => {
    return () => {
      clearTransitionTimer()
    }
  }, [clearTransitionTimer])

  useEffect(() => {
    if (isLoading) return

    if (canvases.length === 0) {
      if (creatingHomeCanvasRef.current) return

      creatingHomeCanvasRef.current = true
      void create(CanvasSchema, { title: 'Workspace Canvas' })
        .then((canvas) => {
          if (!canvas) return
          setHomeCanvasId(canvas.id)
          setActiveNodeId(canvas.id)
        })
        .finally(() => {
          creatingHomeCanvasRef.current = false
        })
      return
    }

    if (!homeCanvasId || !canvases.some((canvas) => canvas.id === homeCanvasId)) {
      const defaultCanvas = [...canvases].sort(
        (left, right) =>
          (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
      )[0]

      if (defaultCanvas) {
        setHomeCanvasId(defaultCanvas.id)
        setActiveNodeId(defaultCanvas.id)
      }
    }
  }, [canvases, create, homeCanvasId, isLoading, setActiveNodeId])

  const focusDocument = useCallback(
    (docId: string, docType: Exclude<DocType, 'canvas'>, animateFromCanvas: boolean) => {
      clearTransitionTimer()

      const returnViewport =
        animateFromCanvas && canvasViewRef.current
          ? canvasViewRef.current.focusLinkedDocument(docId)
          : null

      const openOverlay = () => {
        setShellState(
          docType === 'page'
            ? { kind: 'page-focus', docId, returnViewport }
            : { kind: 'database-focus', docId, returnViewport }
        )
        setActiveNodeId(docId)
      }

      if (returnViewport) {
        transitionTimerRef.current = window.setTimeout(openOverlay, OVERLAY_OPEN_DELAY_MS)
        return
      }

      openOverlay()
    },
    [clearTransitionTimer, setActiveNodeId]
  )

  const handleOpenDocument = useCallback(
    (docId: string) => {
      const document = documents.find((entry) => entry.id === docId)
      if (!document) return

      if (document.type === 'canvas') {
        clearTransitionTimer()
        setHomeCanvasId(document.id)
        setShellState({ kind: 'canvas-home' })
        setActiveNodeId(document.id)
        return
      }

      focusDocument(document.id, document.type, true)
    },
    [clearTransitionTimer, documents, focusDocument, setActiveNodeId]
  )

  const handleCreateLinkedDocument = useCallback(
    async (type: Exclude<DocType, 'canvas'>) => {
      const schema = type === 'page' ? PageSchema : DatabaseSchema
      const title = type === 'page' ? 'Untitled Page' : 'Untitled Database'
      const newDocument = await create(schema, { title })
      if (!newDocument) return

      canvasViewRef.current?.addLinkedDocumentNode({
        id: newDocument.id,
        title,
        type
      })
      setShellState({ kind: 'canvas-home' })
      setActiveNodeId(homeCanvasId)
    },
    [create, homeCanvasId, setActiveNodeId]
  )

  const handleCreateCanvasNote = useCallback(() => {
    canvasViewRef.current?.addCanvasNote()
    setShellState({ kind: 'canvas-home' })
    setActiveNodeId(homeCanvasId)
  }, [homeCanvasId, setActiveNodeId])

  const handleReturnHome = useCallback(() => {
    clearTransitionTimer()
    if (shellState.kind === 'page-focus' || shellState.kind === 'database-focus') {
      if (shellState.returnViewport) {
        canvasViewRef.current?.restoreViewport(shellState.returnViewport)
      }
    }

    setShellState({ kind: 'canvas-home' })
    setActiveNodeId(homeCanvasId)
  }, [clearTransitionTimer, homeCanvasId, setActiveNodeId, shellState])

  const handleAddShared = useCallback(
    async (input: AddSharedInput) => {
      if (input.share) {
        await window.__xnetIpcSyncManager?.configureShareSession({
          signalingUrl: input.share.endpoint,
          ucanToken: input.share.token,
          transport: input.share.transport,
          iceServers: input.share.iceServers
        })
      }

      if (input.docType === 'canvas') {
        setHomeCanvasId(input.docId)
        setShellState({ kind: 'canvas-home' })
        setActiveNodeId(input.docId)
        return
      }

      focusDocument(input.docId, input.docType, false)
    },
    [focusDocument, setActiveNodeId]
  )

  const overlayTitle = useMemo(() => {
    if (shellState.kind === 'page-focus') return 'Document'
    if (shellState.kind === 'database-focus') return 'Database'
    if (shellState.kind === 'settings') return 'Settings'
    return null
  }, [shellState.kind])

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'create-page',
        name: 'Create Page',
        description: 'Create a new page and place it on the canvas',
        icon: 'file-text',
        execute: () => handleCreateLinkedDocument('page')
      },
      {
        id: 'create-database',
        name: 'Create Database',
        description: 'Create a new database and place it on the canvas',
        icon: 'database',
        execute: () => handleCreateLinkedDocument('database')
      },
      {
        id: 'create-note',
        name: 'Create Canvas Note',
        description: 'Add a lightweight note card to the workspace',
        icon: 'sparkles',
        execute: () => handleCreateCanvasNote()
      },
      {
        id: 'open-settings',
        name: 'Open Settings',
        description: 'Open the system settings overlay',
        icon: 'settings',
        execute: () => setShellState({ kind: 'settings' })
      },
      ...documents.map((document) => ({
        id: `open-${document.id}`,
        name: document.title,
        description: `Open ${document.type}`,
        icon:
          document.type === 'page'
            ? 'file-text'
            : document.type === 'database'
              ? 'database'
              : 'layout',
        group: 'Recent',
        execute: () => handleOpenDocument(document.id)
      }))
    ],
    [documents, handleCreateCanvasNote, handleCreateLinkedDocument, handleOpenDocument]
  )

  const renderOverlay = () => {
    if (shellState.kind === 'canvas-home') {
      return null
    }

    if (shellState.kind === 'settings') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className="flex h-full overflow-hidden rounded-[32px] border border-border/70 bg-background shadow-2xl shadow-black/10 animate-in fade-in zoom-in-95 duration-200">
            <SettingsView onClose={handleReturnHome} />
          </div>
        </div>
      )
    }

    return (
      <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
        <div className="flex h-full flex-col gap-4">
          <div className="pointer-events-none flex justify-center">
            <div className="rounded-full border border-border/70 bg-background/80 px-4 py-2 text-xs uppercase tracking-[0.24em] text-muted-foreground shadow-lg backdrop-blur-xl">
              {overlayTitle}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[32px] border border-border/70 bg-background shadow-2xl shadow-black/10 animate-in fade-in zoom-in-95 duration-200">
            {shellState.kind === 'page-focus' ? (
              <PageView docId={shellState.docId} minimalChrome />
            ) : (
              <DatabaseView docId={shellState.docId} minimalChrome />
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isLoading || !homeCanvasId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <div className="animate-pulse">
          <p className="text-muted-foreground">Loading xNet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <header className="absolute inset-x-0 top-0 z-50 h-[38px]">
        <div className="absolute inset-0 titlebar-drag" />
        <div className="relative flex h-full items-center justify-end px-3">
          <SystemMenu
            recentDocuments={recentDocuments}
            onOpenDocument={handleOpenDocument}
            onOpenSettings={() => setShellState({ kind: 'settings' })}
            onAddShared={() => {
              setPrefilledShareValue('')
              setShowAddSharedDialog(true)
            }}
          />
        </div>
      </header>

      <main className="relative h-full overflow-hidden pt-[38px]">
        <div
          className={[
            'absolute inset-0 transition-all duration-200',
            shellState.kind === 'canvas-home'
              ? 'opacity-100'
              : 'pointer-events-none scale-[0.985] opacity-70'
          ].join(' ')}
        >
          <CanvasView
            ref={canvasViewRef}
            docId={homeCanvasId}
            documents={documents}
            onOpenDocument={(docId, docType) => focusDocument(docId, docType, true)}
          />
        </div>

        {renderOverlay()}

        <ActionDock
          mode={shellState.kind === 'canvas-home' ? 'canvas-home' : 'focused'}
          onCreatePage={() => void handleCreateLinkedDocument('page')}
          onCreateDatabase={() => void handleCreateLinkedDocument('database')}
          onCreateNote={handleCreateCanvasNote}
          onOpenRecent={showPalette}
          onOpenSearch={showPalette}
          onReturnHome={handleReturnHome}
        />
      </main>

      <AddSharedDialog
        isOpen={showAddSharedDialog}
        onClose={() => {
          setShowAddSharedDialog(false)
          setPrefilledShareValue('')
        }}
        onAdd={handleAddShared}
        initialValue={prefilledShareValue}
      />

      <CommandPalette commands={paletteCommands} open={paletteOpen} onOpenChange={setPaletteOpen} />

      <BundledPluginInstaller />
    </div>
  )
}
