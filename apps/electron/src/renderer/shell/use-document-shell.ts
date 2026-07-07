/**
 * Desktop document shell hook, extracted from App.tsx. Owns the shell state
 * (via the pure reducer in `shell-state.ts`), the home-canvas bootstrap, the
 * pending canvas insert, the canvas command state, the document queries, and
 * every document/view transition handler — including the overlay
 * transition-timer semantics (OVERLAY_OPEN_DELAY_MS). App.tsx composes this
 * hook and renders per shell state.
 */
import type {
  DocType,
  DocumentItem,
  ShellAction,
  ShellState,
  ViewportSnapshot
} from './shell-state'
import type { AddSharedInput } from '../components/AddSharedDialog'
import type { CanvasViewCommandState, CanvasViewHandle } from '../components/CanvasView'
import type { SavedViewCanvasFrameInput } from '../components/DataWorkspaceView'
import type { LinkedDocumentItem } from '@xnetjs/views'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { PageSchema, DatabaseSchema, CanvasSchema } from '@xnetjs/data'
import { useDevTools } from '@xnetjs/devtools'
import { useQuery, useMutate } from '@xnetjs/react'
import { usePrefersReducedMotion } from '@xnetjs/ui'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  OVERLAY_OPEN_DELAY_MS,
  isCanvasInteractiveShellKind,
  overlayTitleFor,
  shellReducer
} from './shell-state'

export const STORIES_ENABLED = import.meta.env.DEV

export const EMPTY_CANVAS_COMMAND_STATE: CanvasViewCommandState = {
  selectionCount: 0,
  selectedNodeId: null,
  selectedSourceId: null,
  selectedSourceType: null,
  selectedDisplayType: null,
  selectedTitle: null,
  selectedIsQueryFrame: false,
  selectionAllLocked: false,
  selectionAnyLocked: false,
  shortcutHelpOpen: false
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export type PendingCanvasInsert = {
  requestId: string
  document: LinkedDocumentItem
} | null

export interface DocumentShell {
  shellState: ShellState
  overlayTitle: string | null
  isCanvasInteractiveShell: boolean
  prefersReducedMotion: boolean
  homeCanvasId: string | null
  homeCanvasBootstrapError: Error | null
  documents: DocumentItem[]
  recentDocuments: DocumentItem[]
  isLoading: boolean
  pendingCanvasInsert: PendingCanvasInsert
  canvasCommandState: CanvasViewCommandState
  canvasViewRef: RefObject<CanvasViewHandle>
  bootstrapHomeCanvas: () => Promise<void>
  focusDocument: (
    docId: string,
    docType: Exclude<DocType, 'canvas'>,
    animateFromCanvas: boolean
  ) => void
  handleOpenDocument: (docId: string) => void
  handleCreateLinkedDocument: (type: Exclude<DocType, 'canvas'>) => Promise<void>
  handleCreateCanvasNote: () => void
  handleReturnHome: () => void
  handleAddShared: (input: AddSharedInput) => Promise<void>
  openDatabaseSplit: (docId: string) => void
  handleOpenSettings: () => void
  handleOpenSocialImport: () => void
  handleOpenDataWorkspace: () => void
  handleOpenStories: () => void
  handleInsertSavedLensAsCanvasFrame: (view: SavedViewCanvasFrameInput) => void
  handleCommandStateChange: Dispatch<SetStateAction<CanvasViewCommandState>>
  handlePendingInsertConsumed: (requestId: string) => void
}

export function useDocumentShell(): DocumentShell {
  const [homeCanvasId, setHomeCanvasId] = useState<string | null>(null)
  const [homeCanvasBootstrapError, setHomeCanvasBootstrapError] = useState<Error | null>(null)
  const [shellState, dispatchShell] = useReducer(shellReducer, { kind: 'canvas-home' })
  const [pendingCanvasInsert, setPendingCanvasInsert] = useState<PendingCanvasInsert>(null)
  const [canvasCommandState, setCanvasCommandState] = useState<CanvasViewCommandState>(
    EMPTY_CANVAS_COMMAND_STATE
  )
  const { setActiveNodeId } = useDevTools()
  const { create } = useMutate()
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

  /** Clear any pending overlay timer, then apply a shell transition now. */
  const transitionShell = useCallback(
    (action: ShellAction) => {
      clearTransitionTimer()
      dispatchShell(action)
    },
    [clearTransitionTimer]
  )

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
      const returnViewport: ViewportSnapshot | null =
        shouldAnimateFromCanvas && canvasViewRef.current
          ? canvasViewRef.current.focusLinkedDocument(docId)
          : null

      const openOverlay = () => {
        dispatchShell({ type: 'focus-document', docType, docId, returnViewport })
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
        setHomeCanvasId(document.id)
        transitionShell({ type: 'return-home' })
        setActiveNodeId(document.id)
        return
      }

      focusDocument(document.id, document.type, true)
    },
    [documents, focusDocument, setActiveNodeId, transitionShell]
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
        dispatchShell({ type: 'return-home' })
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
        dispatchShell({ type: 'return-home' })
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

    dispatchShell({ type: 'return-home' })
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
        setHomeCanvasId(input.docId)
        transitionShell({ type: 'return-home' })
        setActiveNodeId(input.docId)
        return
      }

      focusDocument(input.docId, input.docType, false)
    },
    [focusDocument, setActiveNodeId, transitionShell]
  )

  const openDatabaseSplit = useCallback(
    (docId: string) => {
      transitionShell({ type: 'open-database-split', docId })
      setActiveNodeId(docId)
    },
    [setActiveNodeId, transitionShell]
  )

  const handleOpenSettings = useCallback(() => {
    transitionShell({ type: 'open-settings' })
  }, [transitionShell])

  const handleOpenSocialImport = useCallback(() => {
    transitionShell({ type: 'open-social-import' })
  }, [transitionShell])

  const handleOpenDataWorkspace = useCallback(() => {
    transitionShell({ type: 'open-data-workspace' })
  }, [transitionShell])

  const handleInsertSavedLensAsCanvasFrame = useCallback(
    (view: SavedViewCanvasFrameInput) => {
      const inserted =
        canvasViewRef.current?.createQueryFrameFromSavedView({
          viewId: view.id,
          title: view.title ?? 'Saved lens',
          descriptorJson: view.descriptor ?? null
        }) ?? false

      if (!inserted) {
        console.error('Failed to insert saved lens as a canvas query frame', view.id)
        return
      }

      transitionShell({ type: 'return-home' })
      setActiveNodeId(homeCanvasId)
    },
    [homeCanvasId, setActiveNodeId, transitionShell]
  )

  const handleOpenStories = useCallback(() => {
    if (!STORIES_ENABLED) return

    transitionShell({ type: 'open-stories' })
  }, [transitionShell])

  const handlePendingInsertConsumed = useCallback((requestId: string) => {
    setPendingCanvasInsert((current) => (current?.requestId === requestId ? null : current))
  }, [])

  const overlayTitle = useMemo(() => overlayTitleFor(shellState.kind), [shellState.kind])
  const isCanvasInteractiveShell = isCanvasInteractiveShellKind(shellState.kind)

  return {
    shellState,
    overlayTitle,
    isCanvasInteractiveShell,
    prefersReducedMotion,
    homeCanvasId,
    homeCanvasBootstrapError,
    documents,
    recentDocuments,
    isLoading,
    pendingCanvasInsert,
    canvasCommandState,
    canvasViewRef,
    bootstrapHomeCanvas,
    focusDocument,
    handleOpenDocument,
    handleCreateLinkedDocument,
    handleCreateCanvasNote,
    handleReturnHome,
    handleAddShared,
    openDatabaseSplit,
    handleOpenSettings,
    handleOpenSocialImport,
    handleOpenDataWorkspace,
    handleOpenStories,
    handleInsertSavedLensAsCanvasFrame,
    handleCommandStateChange: setCanvasCommandState,
    handlePendingInsertConsumed
  }
}
