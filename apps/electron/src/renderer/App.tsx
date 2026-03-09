/**
 * Electron App - Main component
 */

import type { PaletteCommand } from '@xnetjs/ui'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useDevTools } from '@xnetjs/devtools'
import { useQuery, useMutate } from '@xnetjs/react'
import { CommandPalette, useCommandPalette, usePrefersReducedMotion } from '@xnetjs/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionDock } from './components/ActionDock'
import { AddSharedDialog, type AddSharedInput } from './components/AddSharedDialog'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import { CanvasView, type CanvasViewHandle } from './components/CanvasView'
import { DatabaseView } from './components/DatabaseView'
import { PageView } from './components/PageView'
import { SettingsView } from './components/SettingsView'
import { StorybookView } from './components/StorybookView'
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
  | { kind: 'stories' }

type DocumentItem = {
  id: string
  title: string
  type: DocType
  createdAt?: number
  updatedAt?: number
}

const OVERLAY_OPEN_DELAY_MS = 180
const STORIES_ENABLED = import.meta.env.DEV

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function App(): React.ReactElement {
  const [homeCanvasId, setHomeCanvasId] = useState<string | null>(null)
  const [homeCanvasBootstrapError, setHomeCanvasBootstrapError] = useState<Error | null>(null)
  const [shellState, setShellState] = useState<ShellState>({ kind: 'canvas-home' })
  const [showAddSharedDialog, setShowAddSharedDialog] = useState(false)
  const [prefilledShareValue, setPrefilledShareValue] = useState('')
  const { setActiveNodeId } = useDevTools()
  const { create } = useMutate()
  const { open: paletteOpen, setOpen: setPaletteOpen, show: showPalette } = useCommandPalette()
  const prefersReducedMotion = usePrefersReducedMotion()
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

  const bootstrapHomeCanvas = useCallback(async () => {
    if (creatingHomeCanvasRef.current) return

    creatingHomeCanvasRef.current = true
    setHomeCanvasBootstrapError(null)

    try {
      const canvas = await create(CanvasSchema, { title: 'Workspace Canvas' })
      if (!canvas) {
        throw new Error('Home canvas was not created')
      }

      setHomeCanvasId(canvas.id)
      setActiveNodeId(canvas.id)
    } catch (error) {
      const normalizedError = toError(error)
      console.error('Failed to create home canvas', normalizedError)
      setHomeCanvasBootstrapError(normalizedError)
    } finally {
      creatingHomeCanvasRef.current = false
    }
  }, [create, setActiveNodeId])

  useEffect(() => {
    if (isLoading) return

    if (canvases.length === 0) {
      if (homeCanvasBootstrapError) return
      if (homeCanvasId) {
        setHomeCanvasId(null)
      }
      void bootstrapHomeCanvas()
      return
    }

    if (homeCanvasBootstrapError) {
      setHomeCanvasBootstrapError(null)
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
  }, [
    bootstrapHomeCanvas,
    canvases,
    homeCanvasBootstrapError,
    homeCanvasId,
    isLoading,
    setActiveNodeId
  ])

  const focusDocument = useCallback(
    (docId: string, docType: Exclude<DocType, 'canvas'>, animateFromCanvas: boolean) => {
      clearTransitionTimer()

      const shouldAnimateFromCanvas = animateFromCanvas && !prefersReducedMotion
      const returnViewport =
        shouldAnimateFromCanvas && canvasViewRef.current
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

      if (returnViewport && !prefersReducedMotion) {
        transitionTimerRef.current = window.setTimeout(openOverlay, OVERLAY_OPEN_DELAY_MS)
        return
      }

      openOverlay()
    },
    [clearTransitionTimer, prefersReducedMotion, setActiveNodeId]
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
      clearTransitionTimer()

      try {
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
      } catch (error) {
        console.error('Failed to create linked document', toError(error))
      }
    },
    [clearTransitionTimer, create, homeCanvasId, setActiveNodeId]
  )

  const handleCreateCanvasNote = useCallback(() => {
    clearTransitionTimer()
    canvasViewRef.current?.addCanvasNote()
    setShellState({ kind: 'canvas-home' })
    setActiveNodeId(homeCanvasId)
  }, [clearTransitionTimer, homeCanvasId, setActiveNodeId])

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
        try {
          await window.__xnetIpcSyncManager?.configureShareSession({
            signalingUrl: input.share.endpoint,
            ucanToken: input.share.token,
            transport: input.share.transport,
            iceServers: input.share.iceServers
          })
        } catch (error) {
          console.error('Failed to configure shared session', toError(error))
        }
      }

      if (input.docType === 'canvas') {
        clearTransitionTimer()
        setHomeCanvasId(input.docId)
        setShellState({ kind: 'canvas-home' })
        setActiveNodeId(input.docId)
        return
      }

      focusDocument(input.docId, input.docType, false)
    },
    [clearTransitionTimer, focusDocument, setActiveNodeId]
  )

  const overlayTitle = useMemo(() => {
    if (shellState.kind === 'page-focus') return 'Document'
    if (shellState.kind === 'database-focus') return 'Database'
    if (shellState.kind === 'settings') return 'Settings'
    if (shellState.kind === 'stories') return 'Stories'
    return null
  }, [shellState.kind])

  const handleOpenSettings = useCallback(() => {
    clearTransitionTimer()
    setShellState({ kind: 'settings' })
  }, [clearTransitionTimer])

  const handleOpenStories = useCallback(() => {
    if (!STORIES_ENABLED) return

    clearTransitionTimer()
    setShellState({ kind: 'stories' })
  }, [clearTransitionTimer])

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'create-page',
        name: 'Create Page',
        description: 'Create a new page and place it on the canvas',
        icon: 'file-text',
        execute: () => void handleCreateLinkedDocument('page')
      },
      {
        id: 'create-database',
        name: 'Create Database',
        description: 'Create a new database and place it on the canvas',
        icon: 'database',
        execute: () => void handleCreateLinkedDocument('database')
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
        execute: handleOpenSettings
      },
      ...(STORIES_ENABLED
        ? [
            {
              id: 'open-stories',
              name: 'Open Stories',
              description: 'Open the dev-only embedded Storybook surface',
              icon: 'layout',
              group: 'Developer',
              execute: handleOpenStories
            } satisfies PaletteCommand
          ]
        : []),
      ...recentDocuments.map((document) => ({
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
    [
      handleCreateCanvasNote,
      handleCreateLinkedDocument,
      handleOpenDocument,
      handleOpenSettings,
      handleOpenStories,
      recentDocuments
    ]
  )

  const renderOverlay = () => {
    const overlaySurfaceClassName = [
      'flex h-full overflow-hidden rounded-[32px] border border-border/70 bg-background shadow-2xl shadow-black/10',
      prefersReducedMotion ? '' : 'animate-in fade-in zoom-in-95 duration-200'
    ].join(' ')

    if (shellState.kind === 'canvas-home') {
      return null
    }

    if (shellState.kind === 'settings') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <SettingsView onClose={handleReturnHome} />
          </div>
        </div>
      )
    }

    if (shellState.kind === 'stories') {
      return (
        <div className="absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className={overlaySurfaceClassName}>
            <StorybookView />
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

          <div className={['min-h-0 flex-1', overlaySurfaceClassName].join(' ')}>
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

  if (homeCanvasBootstrapError && !homeCanvasId) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="space-y-2">
          <p className="text-foreground">Unable to create your workspace canvas.</p>
          <p className="text-sm text-muted-foreground">{homeCanvasBootstrapError.message}</p>
        </div>
        <button
          type="button"
          onClick={() => void bootstrapHomeCanvas()}
          className="rounded-full bg-foreground px-4 py-2 text-sm text-background transition-colors hover:opacity-90"
        >
          Retry
        </button>
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
            onOpenSettings={handleOpenSettings}
            onOpenStories={STORIES_ENABLED ? handleOpenStories : undefined}
            onAddShared={() => {
              setPrefilledShareValue('')
              setShowAddSharedDialog(true)
            }}
            onToggleDebugPanel={() => {
              window.dispatchEvent(new CustomEvent('xnet-devtools-toggle'))
            }}
          />
        </div>
      </header>

      <main className="relative h-full overflow-hidden pt-[38px]">
        <div
          className={[
            'absolute inset-0',
            prefersReducedMotion ? '' : 'transition-all duration-200',
            shellState.kind === 'canvas-home'
              ? 'opacity-100'
              : prefersReducedMotion
                ? 'pointer-events-none opacity-70'
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
