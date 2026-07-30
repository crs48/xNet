/**
 * useCanvasViewController - the shared CanvasView core (exploration 0277,
 * 0230 Phase 5).
 *
 * Everything the web and desktop canvas views used to duplicate lives
 * here: scene observation, selection resolution, alias/comment editing,
 * object ingestion (drop, paste, file input, URL prompt), primitive
 * creation, and presence intent. The platform shells keep only chrome,
 * navigation, and command transport, injected via the options:
 *
 * - `documents`: the desktop shell's linked-document list; the web
 *   resolves titles from node properties and passes nothing.
 * - `onUndoBoundary`: called after each user-visible scene mutation so
 *   the desktop's multi-domain undo ladder can record a boundary; the
 *   web wires this into the same ladder (0277 E5).
 */

import type {
  CanvasEdge,
  CanvasHandle,
  CanvasNode,
  CanvasPlanningTemplateId,
  CanvasPresenceIntent,
  CanvasSelectionSnapshot,
  CanvasViewportSnapshot as CanvasViewport,
  ShapeType
} from '@xnetjs/canvas'
import type { ChangeEvent, ClipboardEvent, DragEvent, MutableRefObject } from 'react'
import type { Doc as YDoc } from 'yjs'
import {
  CANVAS_MIND_MAP_CREATION_TOOL,
  createCanvasFrameExportDocument,
  createCanvasFrameVariantProperties,
  createCanvasMindMapRootProperties,
  createCanvasObjectAnchorId,
  extractCanvasIngressPayloads,
  getCanvasConnectorsMap,
  getCanvasContainerRole,
  getCanvasObjectsMap,
  useCanvasObjectIngestion
} from '@xnetjs/canvas'
import {
  CanvasSchema,
  decodeAnchor,
  encodeAnchor,
  type BlobService,
  type CanvasObjectAnchor
} from '@xnetjs/data'
import { useComments } from '@xnetjs/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCanvasShellSourceId,
  getCanvasShellSourceType,
  getCanvasShellDisplayType,
  type LinkedDocType,
  type LinkedDocumentItem
} from './canvas-shell.js'

export type CanvasViewDisplayType =
  | LinkedDocType
  | 'note'
  | 'external-reference'
  | 'media'
  | 'shape'
  | 'frame'

export type CanvasResolvedObject = {
  node: CanvasNode
  sourceId: string | null
  sourceType: Exclude<LinkedDocType, 'canvas'> | null
  displayType: CanvasViewDisplayType
  title: string
}

export type CanvasSelectionPanel = 'alias' | 'references' | 'comment' | null

export function getCanvasViewDisplayType(
  node: CanvasNode,
  document?: LinkedDocumentItem
): CanvasViewDisplayType {
  if (node.type === 'shape') {
    return 'shape'
  }

  if (node.type === 'group' || node.type === 'frame') {
    return 'frame'
  }

  if (node.type === 'external-reference' || node.type === 'media') {
    return node.type
  }

  return getCanvasShellDisplayType(node, document)
}

export function getShapeLabel(shapeType: ShapeType): string {
  switch (shapeType) {
    case 'ellipse':
      return 'Ellipse'
    case 'diamond':
      return 'Diamond'
    case 'triangle':
      return 'Triangle'
    case 'hexagon':
      return 'Hexagon'
    case 'star':
      return 'Star'
    case 'arrow':
      return 'Arrow'
    case 'cylinder':
      return 'Cylinder'
    case 'cloud':
      return 'Cloud'
    case 'rounded-rectangle':
      return 'Rounded Rectangle'
    case 'rectangle':
    default:
      return 'Rectangle'
  }
}

function sanitizeCanvasExportFileName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized.length > 0 ? normalized : 'canvas-frame'
}

type CanvasTestHarnessWindow = Window & {
  __xnetCanvasTestHarness?: {
    registerCanvasHandle?: (canvasId: string, handle: CanvasHandle | null) => void
    registerCanvasDoc?: (canvasId: string, doc: YDoc | null) => void
    registerCanvasAwareness?: (canvasId: string, awareness: unknown | null) => void
  } | null
}

export interface UseCanvasViewControllerOptions {
  docId: string
  doc: YDoc | null
  awareness?: unknown | null
  blobService: BlobService | null
  /** Desktop shell's linked-document list; used to resolve titles/types. */
  documents?: LinkedDocumentItem[]
  /** Record an undo boundary after a user-visible scene mutation. */
  onUndoBoundary?: () => void
}

export interface UseCanvasViewControllerResult {
  // Scene + handle
  canvasRef: MutableRefObject<CanvasHandle | null>
  setCanvasHandle: (handle: CanvasHandle | null) => void
  canvasReady: boolean
  hasNodes: boolean
  sceneRevision: number
  lastViewportSnapshotRef: MutableRefObject<CanvasViewport>
  focusCanvasSurface: () => void

  // Selection
  selection: CanvasSelectionSnapshot
  setSelection: (selection: CanvasSelectionSnapshot) => void
  selectedNodes: CanvasNode[]
  selectedObject: CanvasResolvedObject | null
  selectedCanvasEdge: CanvasEdge | null
  selectedFrame: CanvasResolvedObject | null
  selectionAllLocked: boolean
  selectionAnyLocked: boolean
  selectedSourceNodeIds: string[]
  documentMap: Map<string, LinkedDocumentItem>

  // Alias / comment panels
  selectionPanel: CanvasSelectionPanel
  setSelectionPanel: (panel: CanvasSelectionPanel) => void
  closeSelectionPanel: () => void
  aliasDraft: string
  setAliasDraft: (draft: string) => void
  aliasInputRef: MutableRefObject<HTMLInputElement | null>
  commentDraft: string
  setCommentDraft: (draft: string) => void
  commentInputRef: MutableRefObject<HTMLTextAreaElement | null>
  openAliasEditor: () => boolean
  openCommentComposer: () => boolean
  setSelectedAlias: (nextAlias: string | null) => boolean
  clearSelectedAlias: () => boolean
  submitSelectionComment: () => Promise<boolean>
  selectedObjectCommentCount: number

  // Mutation
  updateCanvasNodeProperties: (nodeId: string, properties: Record<string, unknown>) => void

  // Ingestion + creation
  placeSourceObject: ReturnType<typeof useCanvasObjectIngestion>['placeSourceObject']
  placePrimitiveObject: ReturnType<typeof useCanvasObjectIngestion>['placePrimitiveObject']
  ingestPayload: ReturnType<typeof useCanvasObjectIngestion>['ingestPayload']
  ingestDataTransfer: ReturnType<typeof useCanvasObjectIngestion>['ingestDataTransfer']
  handleSurfaceDrop: (
    event: DragEvent<HTMLDivElement>,
    context: { screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number } }
  ) => void
  handleSurfacePaste: (event: ClipboardEvent<HTMLDivElement>) => void
  createShape: (shapeType?: ShapeType) => boolean
  createFrame: () => boolean
  createMindMap: () => boolean
  createExternalReference: (url?: string) => boolean
  createMediaFile: () => boolean
  createPlanningTemplate: (templateId: CanvasPlanningTemplateId) => boolean
  wrapSelectionInFrame: () => boolean
  mediaFileInputRef: MutableRefObject<HTMLInputElement | null>
  handleMediaFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void

  // Frames (W6)
  presentSelectedFrame: () => boolean
  exportSelectedFrame: () => boolean

  // Presence
  canvasPresenceIntent: CanvasPresenceIntent | null
}

export function useCanvasViewController({
  docId,
  doc,
  awareness = null,
  blobService,
  documents,
  onUndoBoundary
}: UseCanvasViewControllerOptions): UseCanvasViewControllerResult {
  const canvasRef = useRef<CanvasHandle | null>(null)
  const lastViewportSnapshotRef = useRef<CanvasViewport>({ x: 0, y: 0, zoom: 1 })
  const aliasInputRef = useRef<HTMLInputElement | null>(null)
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null)
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [hasNodes, setHasNodes] = useState(false)
  const [sceneRevision, setSceneRevision] = useState(0)
  const [selection, setSelection] = useState<CanvasSelectionSnapshot>({
    nodeIds: [],
    edgeIds: []
  })
  const [selectionPanel, setSelectionPanel] = useState<CanvasSelectionPanel>(null)
  const [aliasDraft, setAliasDraft] = useState('')
  const [commentDraft, setCommentDraft] = useState('')

  const recordUndoBoundary = useCallback(() => {
    onUndoBoundary?.()
  }, [onUndoBoundary])

  const setCanvasHandle = useCallback(
    (handle: CanvasHandle | null) => {
      canvasRef.current = handle

      const testHarness = window as CanvasTestHarnessWindow

      testHarness.__xnetCanvasTestHarness?.registerCanvasHandle?.(docId, handle)
    },
    [docId]
  )

  const focusCanvasSurface = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-canvas-surface="true"]')?.focus()
    })
  }, [])

  const documentMap = useMemo(
    () => new Map((documents ?? []).map((entry) => [entry.id, entry])),
    [documents]
  )

  const { placeSourceObject, placePrimitiveObject, ingestPayload, ingestDataTransfer } =
    useCanvasObjectIngestion({
      doc,
      blobService,
      getViewportSnapshot: () =>
        canvasRef.current?.getViewportSnapshot() ?? lastViewportSnapshotRef.current
    })

  const { threads: canvasObjectCommentThreads, addComment: addCanvasComment } = useComments({
    nodeId: docId,
    anchorType: 'canvas-object'
  })

  // ── Scene observation ────────────────────────────────────────────────────
  useEffect(() => {
    if (!doc) {
      return
    }

    setCanvasReady(true)

    const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
    const connectorsMap = getCanvasConnectorsMap<CanvasEdge>(doc)
    const syncHasNodes = () => {
      setHasNodes(nodesMap.size > 0)
      setSceneRevision((current) => current + 1)
    }

    syncHasNodes()
    nodesMap.observe(syncHasNodes)
    connectorsMap.observe(syncHasNodes)

    return () => {
      nodesMap.unobserve(syncHasNodes)
      connectorsMap.unobserve(syncHasNodes)
    }
  }, [doc])

  useEffect(() => {
    if (!canvasReady || !canvasRef.current) return
    lastViewportSnapshotRef.current = canvasRef.current.getViewportSnapshot()
  }, [canvasReady])

  useEffect(() => {
    const testHarness = window as CanvasTestHarnessWindow

    testHarness.__xnetCanvasTestHarness?.registerCanvasDoc?.(docId, doc)
    testHarness.__xnetCanvasTestHarness?.registerCanvasAwareness?.(docId, awareness ?? null)

    return () => {
      testHarness.__xnetCanvasTestHarness?.registerCanvasDoc?.(docId, null)
      testHarness.__xnetCanvasTestHarness?.registerCanvasAwareness?.(docId, null)
    }
  }, [awareness, doc, docId])

  // ── Selection resolution ─────────────────────────────────────────────────
  const selectedObject = useMemo<CanvasResolvedObject | null>(() => {
    void sceneRevision

    if (!doc || selection.nodeIds.length !== 1) {
      return null
    }

    const node = getCanvasObjectsMap<CanvasNode>(doc).get(selection.nodeIds[0])
    if (!node) {
      return null
    }

    const sourceId = getCanvasShellSourceId(node)
    const linkedDocument = sourceId ? documentMap.get(sourceId) : undefined
    const displayType = getCanvasViewDisplayType(node, linkedDocument)
    const sourceType = getCanvasShellSourceType(node, linkedDocument)
    const title =
      node.alias ?? linkedDocument?.title ?? (node.properties.title as string) ?? 'Untitled'

    return {
      node,
      sourceId: sourceId ?? null,
      sourceType,
      displayType,
      title
    }
  }, [doc, documentMap, sceneRevision, selection.nodeIds])

  const selectedNodes = useMemo(() => {
    void sceneRevision

    if (!doc || selection.nodeIds.length === 0) {
      return []
    }

    const nodes = getCanvasObjectsMap<CanvasNode>(doc)
    return selection.nodeIds
      .map((nodeId) => nodes.get(nodeId))
      .filter((node): node is CanvasNode => node !== undefined)
  }, [doc, sceneRevision, selection.nodeIds])

  const selectedCanvasEdge = useMemo(() => {
    void sceneRevision

    if (!doc || selection.edgeIds.length !== 1) {
      return null
    }

    const edgeId = selection.edgeIds[0]
    for (const [key, edge] of getCanvasConnectorsMap<CanvasEdge>(doc).entries()) {
      if (key === edgeId || edge.id === edgeId) {
        return edge
      }
    }

    return null
  }, [doc, sceneRevision, selection.edgeIds])

  const selectedFrame = useMemo(() => {
    if (!selectedObject || getCanvasContainerRole(selectedObject.node) !== 'frame') {
      return null
    }

    return selectedObject
  }, [selectedObject])

  const selectionAllLocked = selectedNodes.length > 0 && selectedNodes.every((node) => node.locked)
  const selectionAnyLocked = selectedNodes.some((node) => node.locked)
  const selectedSourceNodeIds = useMemo(
    () =>
      Array.from(
        new Set(
          selectedNodes
            .map((node) => getCanvasShellSourceId(node))
            .filter((sourceId): sourceId is string => typeof sourceId === 'string')
        )
      ),
    [selectedNodes]
  )

  const selectedObjectCommentCount = useMemo(() => {
    if (!selectedObject) {
      return 0
    }

    return canvasObjectCommentThreads.filter((thread) => {
      try {
        return (
          decodeAnchor<CanvasObjectAnchor>(thread.root.properties.anchorData).objectId ===
          selectedObject.node.id
        )
      } catch {
        return false
      }
    }).length
  }, [canvasObjectCommentThreads, selectedObject])

  // ── Alias / comment panels ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedObject) {
      setSelectionPanel(null)
      setAliasDraft('')
      setCommentDraft('')
      return
    }

    if (
      (selectionPanel === 'alias' || selectionPanel === 'references') &&
      !selectedObject.sourceId
    ) {
      setSelectionPanel(null)
    }

    setAliasDraft(selectedObject.node.alias ?? '')
  }, [selectedObject, selectionPanel])

  useEffect(() => {
    if (selectionPanel !== 'alias') {
      return
    }

    window.requestAnimationFrame(() => {
      aliasInputRef.current?.focus()
      aliasInputRef.current?.select()
    })
  }, [selectionPanel])

  useEffect(() => {
    if (selectionPanel !== 'comment') {
      return
    }

    window.requestAnimationFrame(() => {
      commentInputRef.current?.focus()
    })
  }, [selectionPanel])

  const closeSelectionPanel = useCallback(() => {
    setSelectionPanel(null)
    focusCanvasSurface()
  }, [focusCanvasSurface])

  const openAliasEditor = useCallback((): boolean => {
    if (!selectedObject?.sourceId) {
      return false
    }

    setAliasDraft(selectedObject.node.alias ?? '')
    setSelectionPanel('alias')
    return true
  }, [selectedObject])

  const openCommentComposer = useCallback((): boolean => {
    if (!selectedObject) {
      return false
    }

    setCommentDraft('')
    setSelectionPanel('comment')
    return true
  }, [selectedObject])

  const setSelectedAlias = useCallback(
    (nextAlias: string | null): boolean => {
      if (!doc || !selectedObject?.sourceId) {
        return false
      }

      const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
      const current = nodesMap.get(selectedObject.node.id)
      if (!current) {
        return false
      }

      const normalized = nextAlias?.trim() ?? ''
      const resolvedAlias = normalized.length > 0 ? normalized : undefined

      if ((current.alias ?? undefined) === resolvedAlias) {
        closeSelectionPanel()
        return true
      }

      doc.transact(() => {
        nodesMap.set(current.id, {
          ...current,
          alias: resolvedAlias
        })
      })

      recordUndoBoundary()

      closeSelectionPanel()
      return true
    },
    [closeSelectionPanel, doc, recordUndoBoundary, selectedObject]
  )

  const clearSelectedAlias = useCallback((): boolean => {
    return setSelectedAlias(null)
  }, [setSelectedAlias])

  const submitSelectionComment = useCallback(async (): Promise<boolean> => {
    if (!selectedObject) {
      return false
    }

    const content = commentDraft.trim()
    if (!content) {
      return false
    }

    const anchor: CanvasObjectAnchor = {
      objectId: selectedObject.node.id,
      anchorId: createCanvasObjectAnchorId({
        objectId: selectedObject.node.id,
        placement: 'right'
      }),
      placement: 'right'
    }

    const createdCommentId = await addCanvasComment({
      content,
      anchorType: 'canvas-object',
      anchorData: encodeAnchor(anchor),
      targetSchema: CanvasSchema._schemaId
    })

    if (!createdCommentId) {
      return false
    }

    setCommentDraft('')
    closeSelectionPanel()
    return true
  }, [addCanvasComment, closeSelectionPanel, commentDraft, selectedObject])

  // ── Mutation ─────────────────────────────────────────────────────────────
  const updateCanvasNodeProperties = useCallback(
    (nodeId: string, properties: Record<string, unknown>) => {
      if (!doc) {
        return
      }

      const nodesMap = getCanvasObjectsMap<CanvasNode>(doc)
      const current = nodesMap.get(nodeId)
      if (!current) {
        return
      }

      doc.transact(() => {
        nodesMap.set(nodeId, {
          ...current,
          properties: {
            ...current.properties,
            ...properties
          }
        })
      })
    },
    [doc]
  )

  // ── Ingestion + creation ─────────────────────────────────────────────────
  const handleSurfaceDrop = useCallback(
    (
      event: DragEvent<HTMLDivElement>,
      context: { screenToCanvas: (clientX: number, clientY: number) => { x: number; y: number } }
    ) => {
      void ingestDataTransfer(event.dataTransfer, {
        canvasPoint: context.screenToCanvas(event.clientX, event.clientY)
      })
    },
    [ingestDataTransfer]
  )

  const handleSurfacePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const payloads = extractCanvasIngressPayloads(event.clipboardData)
      const hasMeaningfulPaste = payloads.some((payload) => payload.kind !== 'text')
      if (!hasMeaningfulPaste) {
        return
      }

      event.preventDefault()
      void ingestDataTransfer(event.clipboardData)
    },
    [ingestDataTransfer]
  )

  const createShape = useCallback(
    (shapeType: ShapeType = 'rectangle'): boolean => {
      const created = Boolean(
        placePrimitiveObject({
          objectKind: 'shape',
          title: getShapeLabel(shapeType),
          properties: {
            title: getShapeLabel(shapeType),
            label: getShapeLabel(shapeType),
            shapeType
          }
        })
      )

      if (created) {
        recordUndoBoundary()
      }

      return created
    },
    [placePrimitiveObject, recordUndoBoundary]
  )

  const createFrame = useCallback((): boolean => {
    const created = Boolean(
      placePrimitiveObject({
        objectKind: 'group',
        title: 'Frame',
        rect: {
          width: 640,
          height: 420
        },
        properties: createCanvasFrameVariantProperties('standard', {
          title: 'Frame'
        })
      })
    )

    if (created) {
      recordUndoBoundary()
    }

    return created
  }, [placePrimitiveObject, recordUndoBoundary])

  const createMindMap = useCallback((): boolean => {
    const properties = createCanvasMindMapRootProperties()
    const created = Boolean(
      placePrimitiveObject({
        objectKind: CANVAS_MIND_MAP_CREATION_TOOL.objectKind,
        title: properties.title,
        rect: CANVAS_MIND_MAP_CREATION_TOOL.rootRect,
        properties
      })
    )

    if (created) {
      recordUndoBoundary()
    }

    return created
  }, [placePrimitiveObject, recordUndoBoundary])

  const createExternalReference = useCallback(
    (url?: string): boolean => {
      const candidate = (
        url ?? window.prompt('Paste a URL to add to the canvas', 'https://')
      )?.trim()

      if (!candidate) {
        return false
      }

      void ingestPayload({ kind: 'text', text: candidate }).then((result) => {
        if (result) {
          recordUndoBoundary()
        }
      })

      return true
    },
    [ingestPayload, recordUndoBoundary]
  )

  const createMediaFile = useCallback((): boolean => {
    const input = mediaFileInputRef.current
    if (!input) {
      return false
    }

    input.click()
    return true
  }, [])

  const handleMediaFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>): void => {
      const files = Array.from(event.currentTarget.files ?? [])
      event.currentTarget.value = ''

      if (files.length === 0) {
        return
      }

      void Promise.all(
        files.map((file, index) => ingestPayload({ kind: 'file', file }, { spreadIndex: index }))
      ).then((results) => {
        if (results.some(Boolean)) {
          recordUndoBoundary()
        }
      })
    },
    [ingestPayload, recordUndoBoundary]
  )

  const createPlanningTemplate = useCallback(
    (templateId: CanvasPlanningTemplateId): boolean => {
      const created = canvasRef.current?.createPlanningTemplate(templateId) ?? false

      if (created) {
        recordUndoBoundary()
      }

      return created
    },
    [recordUndoBoundary]
  )

  const wrapSelectionInFrame = useCallback((): boolean => {
    return canvasRef.current?.wrapSelectionInFrame() ?? false
  }, [])

  // ── Frames (W6) ──────────────────────────────────────────────────────────
  const presentSelectedFrame = useCallback((): boolean => {
    if (!selectedFrame) {
      return false
    }

    canvasRef.current?.fitToRect(
      {
        x: selectedFrame.node.position.x,
        y: selectedFrame.node.position.y,
        width: selectedFrame.node.position.width,
        height: selectedFrame.node.position.height
      },
      48
    )
    return true
  }, [selectedFrame])

  const exportSelectedFrame = useCallback((): boolean => {
    if (!doc || !selectedFrame) {
      return false
    }

    const nodes = Array.from(getCanvasObjectsMap<CanvasNode>(doc).values())
    const edges = Array.from(getCanvasConnectorsMap<CanvasEdge>(doc).values())
    const frameExport = createCanvasFrameExportDocument({
      frame: selectedFrame.node,
      nodes,
      edges
    })
    const fileName = `${sanitizeCanvasExportFileName(selectedFrame.title)}.canvas-section.json`

    const blob = new Blob([JSON.stringify(frameExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    return true
  }, [doc, selectedFrame])

  // ── Presence ─────────────────────────────────────────────────────────────
  const canvasPresenceIntent = useMemo<CanvasPresenceIntent | null>(() => {
    if (!selectedObject) {
      return null
    }

    if (selectionPanel === 'comment') {
      return {
        activity: 'commenting',
        editingNodeId: selectedObject.node.id
      }
    }

    if (selectionPanel === 'alias') {
      return {
        activity: 'editing',
        editingNodeId: selectedObject.node.id
      }
    }

    return null
  }, [selectedObject, selectionPanel])

  return {
    canvasRef,
    setCanvasHandle,
    canvasReady,
    hasNodes,
    sceneRevision,
    lastViewportSnapshotRef,
    focusCanvasSurface,
    selection,
    setSelection,
    selectedNodes,
    selectedObject,
    selectedCanvasEdge,
    selectedFrame,
    selectionAllLocked,
    selectionAnyLocked,
    selectedSourceNodeIds,
    documentMap,
    selectionPanel,
    setSelectionPanel,
    closeSelectionPanel,
    aliasDraft,
    setAliasDraft,
    aliasInputRef,
    commentDraft,
    setCommentDraft,
    commentInputRef,
    openAliasEditor,
    openCommentComposer,
    setSelectedAlias,
    clearSelectedAlias,
    submitSelectionComment,
    selectedObjectCommentCount,
    updateCanvasNodeProperties,
    placeSourceObject,
    placePrimitiveObject,
    ingestPayload,
    ingestDataTransfer,
    handleSurfaceDrop,
    handleSurfacePaste,
    createShape,
    createFrame,
    createMindMap,
    createExternalReference,
    createMediaFile,
    createPlanningTemplate,
    wrapSelectionInFrame,
    mediaFileInputRef,
    handleMediaFileInputChange,
    presentSelectedFrame,
    exportSelectedFrame,
    canvasPresenceIntent
  }
}
