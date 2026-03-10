/**
 * Electron App - Main component
 */

import type { LinkedDocumentItem } from './lib/canvas-shell'
import type { PaletteCommand } from '@xnetjs/ui'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useDevTools } from '@xnetjs/devtools'
import { useQuery, useMutate } from '@xnetjs/react'
import { CommandPalette, useCommandPalette, usePrefersReducedMotion } from '@xnetjs/ui'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActionDock } from './components/ActionDock'
import { AddSharedDialog, type AddSharedInput } from './components/AddSharedDialog'
import { BundledPluginInstaller } from './components/BundledPluginInstaller'
import {
  CanvasView,
  type CanvasViewCommandState,
  type CanvasViewHandle
} from './components/CanvasView'
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
  | { kind: 'database-split'; docId: string }
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
const MOD_ENTER_SHORTCUT = navigator.platform.includes('Mac') ? '⌘↩' : 'Ctrl+Enter'
const EMPTY_CANVAS_COMMAND_STATE: CanvasViewCommandState = {
  selectionCount: 0,
  selectedNodeId: null,
  selectedSourceId: null,
  selectedSourceType: null,
  selectedDisplayType: null,
  selectedTitle: null,
  selectionAllLocked: false,
  selectionAnyLocked: false,
  shortcutHelpOpen: false
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function App(): React.ReactElement {
  const [homeCanvasId, setHomeCanvasId] = useState<string | null>(null)
  const [homeCanvasBootstrapError, setHomeCanvasBootstrapError] = useState<Error | null>(null)
  const [shellState, setShellState] = useState<ShellState>({ kind: 'canvas-home' })
  const [pendingCanvasInsert, setPendingCanvasInsert] = useState<{
    requestId: string
    document: LinkedDocumentItem
  } | null>(null)
  const [canvasCommandState, setCanvasCommandState] = useState<CanvasViewCommandState>(
    EMPTY_CANVAS_COMMAND_STATE
  )
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

        setPendingCanvasInsert({
          requestId: `${type}-${newDocument.id}-${Date.now()}`,
          document: {
            id: newDocument.id,
            title,
            type
          }
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
    const createCanvasNote = async () => {
      clearTransitionTimer()

      try {
        const note = await create(PageSchema, { title: 'Untitled Note' })
        if (!note) return

        setPendingCanvasInsert({
          requestId: `note-${note.id}-${Date.now()}`,
          document: {
            id: note.id,
            title: note.title || 'Untitled Note',
            type: 'page',
            canvasKind: 'note'
          }
        })
        setShellState({ kind: 'canvas-home' })
        setActiveNodeId(homeCanvasId)
      } catch (error) {
        console.error('Failed to create canvas note', toError(error))
      }
    }

    void createCanvasNote()
  }, [clearTransitionTimer, create, homeCanvasId, setActiveNodeId])

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
  const isCanvasInteractiveShell =
    shellState.kind === 'canvas-home' || shellState.kind === 'database-split'

  const openDatabaseSplit = useCallback(
    (docId: string) => {
      clearTransitionTimer()
      setShellState({ kind: 'database-split', docId })
      setActiveNodeId(docId)
    },
    [clearTransitionTimer, setActiveNodeId]
  )

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
        shortcut: 'P',
        group: 'Canvas',
        keywords: ['page', 'canvas', 'create'],
        execute: () => void handleCreateLinkedDocument('page')
      },
      {
        id: 'create-database',
        name: 'Create Database',
        description: 'Create a new database and place it on the canvas',
        icon: 'database',
        shortcut: 'D',
        group: 'Canvas',
        keywords: ['database', 'canvas', 'create'],
        execute: () => void handleCreateLinkedDocument('database')
      },
      {
        id: 'create-note',
        name: 'Create Canvas Note',
        description: 'Create a page-backed note and place it on the canvas',
        icon: 'sparkles',
        shortcut: 'N',
        group: 'Canvas',
        keywords: ['note', 'canvas', 'create'],
        execute: () => handleCreateCanvasNote()
      },
      {
        id: 'create-rectangle',
        name: 'Create Rectangle',
        description: 'Create a canvas-native rectangle on the current board',
        icon: 'square',
        shortcut: 'R',
        group: 'Canvas',
        keywords: ['shape', 'rectangle', 'canvas', 'create'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.createShape('rectangle')
        }
      },
      {
        id: 'create-frame',
        name: 'Create Frame',
        description: 'Create an empty frame container on the current board',
        icon: 'layout',
        shortcut: 'F',
        group: 'Canvas',
        keywords: ['frame', 'group', 'canvas', 'create'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.createFrame()
        }
      },
      {
        id: 'frame-selection',
        name: 'Frame Selection',
        description: 'Wrap the selected canvas objects in a frame container',
        icon: 'layout',
        shortcut: 'Mod+Shift+F',
        group: 'Canvas',
        keywords: ['frame', 'group', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.wrapSelectionInFrame()
        }
      },
      {
        id: 'canvas-peek-selection',
        name: 'Peek Selected Object',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Center and activate ${canvasCommandState.selectedTitle}`
            : 'Center and activate the current canvas selection',
        icon: 'eye',
        shortcut: 'Enter',
        group: 'Canvas',
        keywords: ['peek', 'edit', 'selection', 'canvas'],
        when: () => shellState.kind === 'canvas-home' && canvasCommandState.selectionCount === 1,
        execute: () => {
          canvasViewRef.current?.openSelection('peek')
        }
      },
      {
        id: 'canvas-open-selection',
        name: 'Open Selected Object',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Open ${canvasCommandState.selectedTitle} in a focused surface`
            : 'Open the current canvas selection in a focused surface',
        icon: 'external-link',
        shortcut: MOD_ENTER_SHORTCUT,
        group: 'Canvas',
        keywords: ['open', 'focus', 'selection', 'canvas'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          Boolean(canvasCommandState.selectedSourceId && canvasCommandState.selectedSourceType),
        execute: () => {
          canvasViewRef.current?.openSelection('focus')
        }
      },
      {
        id: 'canvas-open-database-split',
        name: 'Open Database in Split View',
        description:
          canvasCommandState.selectedTitle && canvasCommandState.selectionCount === 1
            ? `Keep ${canvasCommandState.selectedTitle} open beside the canvas`
            : 'Open the selected database in a split view beside the canvas',
        icon: 'columns',
        shortcut: 'Alt+Enter',
        group: 'Canvas',
        keywords: ['split', 'database', 'canvas', 'preview'],
        when: () =>
          isCanvasInteractiveShell &&
          canvasCommandState.selectionCount === 1 &&
          canvasCommandState.selectedDisplayType === 'database' &&
          Boolean(canvasCommandState.selectedSourceId),
        execute: () => {
          canvasViewRef.current?.openSelection('split')
        }
      },
      {
        id: 'canvas-fit-selection',
        name: 'Fit Selected Object',
        description: 'Center the current canvas selection in view',
        icon: 'layout',
        group: 'Canvas',
        keywords: ['fit', 'selection', 'zoom', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.fitSelection()
        }
      },
      {
        id: 'canvas-toggle-lock',
        name: canvasCommandState.selectionAllLocked ? 'Unlock Selection' : 'Lock Selection',
        description: canvasCommandState.selectionAllLocked
          ? 'Allow the current selection to move and resize again'
          : 'Protect the current selection from accidental moves and nudges',
        icon: 'lock',
        shortcut: 'Mod+Shift+L',
        group: 'Canvas',
        keywords: ['lock', 'unlock', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.toggleSelectionLock()
        }
      },
      {
        id: 'canvas-align-left',
        name: 'Align Selection Left',
        description: 'Snap the selected objects to a shared left edge',
        icon: 'align-start-horizontal',
        shortcut: 'Mod+Shift+Left',
        group: 'Canvas',
        keywords: ['align', 'left', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('left')
        }
      },
      {
        id: 'canvas-align-right',
        name: 'Align Selection Right',
        description: 'Snap the selected objects to a shared right edge',
        icon: 'align-end-horizontal',
        shortcut: 'Mod+Shift+Right',
        group: 'Canvas',
        keywords: ['align', 'right', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('right')
        }
      },
      {
        id: 'canvas-align-top',
        name: 'Align Selection Top',
        description: 'Snap the selected objects to a shared top edge',
        icon: 'align-start-vertical',
        shortcut: 'Mod+Shift+Up',
        group: 'Canvas',
        keywords: ['align', 'top', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('top')
        }
      },
      {
        id: 'canvas-align-bottom',
        name: 'Align Selection Bottom',
        description: 'Snap the selected objects to a shared bottom edge',
        icon: 'align-end-vertical',
        shortcut: 'Mod+Shift+Down',
        group: 'Canvas',
        keywords: ['align', 'bottom', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.alignSelection('bottom')
        }
      },
      {
        id: 'canvas-distribute-horizontal',
        name: 'Distribute Selection Horizontally',
        description: 'Even out the horizontal spacing between selected objects',
        icon: 'columns',
        group: 'Canvas',
        keywords: ['distribute', 'horizontal', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 2,
        execute: () => {
          canvasViewRef.current?.distributeSelection('horizontal')
        }
      },
      {
        id: 'canvas-distribute-vertical',
        name: 'Distribute Selection Vertically',
        description: 'Even out the vertical spacing between selected objects',
        icon: 'rows',
        group: 'Canvas',
        keywords: ['distribute', 'vertical', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 2,
        execute: () => {
          canvasViewRef.current?.distributeSelection('vertical')
        }
      },
      {
        id: 'canvas-tidy-selection',
        name: 'Tidy Selection',
        description: 'Pack the selected objects into a clean reading grid',
        icon: 'sparkles',
        group: 'Canvas',
        keywords: ['tidy', 'arrange', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 1,
        execute: () => {
          canvasViewRef.current?.tidySelection()
        }
      },
      {
        id: 'canvas-send-backward',
        name: 'Send Selection Backward',
        description: 'Move the selected objects back one layer',
        icon: 'minus',
        shortcut: '[',
        group: 'Canvas',
        keywords: ['backward', 'z-index', 'layer', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.shiftSelectionLayer('backward')
        }
      },
      {
        id: 'canvas-bring-forward',
        name: 'Bring Selection Forward',
        description: 'Move the selected objects forward one layer',
        icon: 'plus',
        shortcut: ']',
        group: 'Canvas',
        keywords: ['forward', 'z-index', 'layer', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.shiftSelectionLayer('forward')
        }
      },
      {
        id: 'canvas-clear-selection',
        name: 'Clear Selection',
        description: 'Clear the current canvas selection',
        icon: 'x',
        shortcut: 'Esc',
        group: 'Canvas',
        keywords: ['clear', 'selection', 'canvas'],
        when: () => isCanvasInteractiveShell && canvasCommandState.selectionCount > 0,
        execute: () => {
          canvasViewRef.current?.clearSelection()
        }
      },
      {
        id: 'canvas-shortcut-help',
        name: canvasCommandState.shortcutHelpOpen
          ? 'Hide Canvas Shortcuts'
          : 'Show Canvas Shortcuts',
        description: 'Toggle the canvas shortcut help overlay',
        icon: 'help-circle',
        shortcut: '?',
        group: 'Canvas',
        keywords: ['help', 'shortcuts', 'canvas', 'hotkeys'],
        when: () => isCanvasInteractiveShell,
        execute: () => {
          canvasViewRef.current?.toggleShortcutHelp()
        }
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
      canvasCommandState,
      isCanvasInteractiveShell,
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

    if (shellState.kind === 'database-split') {
      return (
        <div className="pointer-events-none absolute inset-0 z-30 px-4 pb-28 pt-6">
          <div className="flex h-full justify-end">
            <div className="pointer-events-auto flex h-full w-[min(48vw,780px)] min-w-[420px] flex-col gap-4">
              <div className="flex justify-end">
                <div
                  className="flex items-center gap-3 rounded-full border border-border/70 bg-background/82 px-4 py-2 shadow-lg backdrop-blur-xl"
                  data-database-split-view="true"
                >
                  <span className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    Canvas + Database
                  </span>
                  <button
                    type="button"
                    onClick={handleReturnHome}
                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Close split
                  </button>
                </div>
              </div>

              <div
                className={['min-h-0 flex-1', overlaySurfaceClassName].join(' ')}
                data-database-split-panel="true"
              >
                <DatabaseView docId={shellState.docId} minimalChrome />
              </div>
            </div>
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
            isCanvasInteractiveShell
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
            pendingInsert={pendingCanvasInsert}
            onCreatePage={() => void handleCreateLinkedDocument('page')}
            onCreateDatabase={() => void handleCreateLinkedDocument('database')}
            onCreateNote={handleCreateCanvasNote}
            onCommandStateChange={setCanvasCommandState}
            onPendingInsertConsumed={(requestId) => {
              setPendingCanvasInsert((current) =>
                current?.requestId === requestId ? null : current
              )
            }}
            onOpenDocument={(docId, docType) => focusDocument(docId, docType, true)}
            onOpenDatabaseSplit={openDatabaseSplit}
          />
        </div>

        {renderOverlay()}

        <ActionDock
          mode={isCanvasInteractiveShell ? 'canvas-home' : 'focused'}
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
