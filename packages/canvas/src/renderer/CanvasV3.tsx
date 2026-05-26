/**
 * Canvas v3 active React renderer.
 */

import type { LODLevel } from '../nodes/CanvasNodeComponent'
import type { FrameStats } from '../performance'
import type {
  CanvasAlignment,
  CanvasConfig,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNode,
  Point,
  Rect
} from '../types'
import type { CanvasObjectRecord, CanvasTileSummary } from '@xnetjs/canvas-core'
import {
  createCanvasCamera,
  createWorldPointFromCanvasPoint,
  screenToWorldPoint,
  worldPointToAnchorLocal,
  worldToScreenPoint
} from '@xnetjs/canvas-core'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import * as Y from 'yjs'
import { CommentOverlay } from '../comments/CommentOverlay'
import { CollapsibleMinimap } from '../components/Minimap'
import { NavigationTools } from '../components/NavigationTools'
import { createWebGLVectorTileRenderer, type WebGLVectorTileRenderer } from '../layers'
import { calculateLOD } from '../nodes/CanvasNodeComponent'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '../scene/doc-layout'
import { readCanvasV3MigrationSceneFromFlatDoc } from '../scene/flat-doc-v3-migration'
import {
  createAlignmentUpdates,
  createDistributionUpdates,
  createFrameSelectionNode,
  createLayerShiftUpdates,
  createLockUpdates,
  createTidySelectionUpdates,
  expandContainerPositionUpdates,
  getUnlockedSelection,
  type CanvasLockUpdate,
  type CanvasPositionUpdate
} from '../selection/scene-operations'
import { Viewport } from '../spatial'
import { createEdge } from '../store'
import { useCanvasThemeTokens } from '../theme/canvas-theme'
import { planDomIslandPool } from './dom-island-pool'

const EMPTY_FRAME_STATS: FrameStats = {
  frameCount: 0,
  averageFrameTime: 0,
  maxFrameTime: 0,
  minFrameTime: 0,
  droppedFrames: 0,
  droppedFramePercent: 0,
  fps: 0
}

const DEFAULT_DOM_BUDGETS = {
  maxLiveDom: 32,
  maxShellDom: 160
}

type AwarenessLike = {
  clientID: number
  getStates(): Map<number, Record<string, unknown>>
  setLocalStateField(field: string, value: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}

export type CanvasRemoteUser = {
  clientId: number
  did: string
  name: string
  color: string
  selectedNodes?: string[]
  cursor?: Point
  viewport?: { x: number; y: number; zoom: number }
  activity?: string
  editingNodeId?: string
}

export type CanvasPresenceIntent = {
  activity: string
  editingNodeId?: string | null
}

export type CanvasSelectionSnapshot = {
  nodeIds: string[]
  edgeIds: string[]
}

export type CanvasSurfaceEventContext = {
  viewportSnapshot: { x: number; y: number; zoom: number }
  screenToCanvas: (clientX: number, clientY: number) => Point
}

export type CanvasNodeRenderContext = {
  selected: boolean
  lod: LODLevel
  selectionSize: number
  viewportZoom: number
}

export type CanvasHandle = {
  fitToContent: (padding?: number) => void
  fitToRect: (rect: Rect, padding?: number) => void
  resetView: () => void
  getViewportSnapshot: () => { x: number; y: number; zoom: number }
  setViewportSnapshot: (snapshot: { x: number; y: number; zoom: number }) => void
  clearSelection: () => void
  selectNodes: (nodeIds: string[]) => void
  toggleSelectionLock: () => boolean
  alignSelection: (alignment: CanvasAlignment) => boolean
  distributeSelection: (axis: CanvasDistributionAxis) => boolean
  tidySelection: () => boolean
  shiftSelectionLayer: (direction: CanvasLayerDirection) => boolean
  wrapSelectionInFrame: () => boolean
  connectSelection: () => boolean
  undo: () => boolean
  redo: () => boolean
  screenToCanvas: (clientX: number, clientY: number) => Point
  getPerformanceStats: () => FrameStats
  resetPerformanceStats: () => void
}

export type CanvasProps = {
  doc: Y.Doc
  config?: CanvasConfig
  initialViewport?: { x?: number; y?: number; zoom?: number }
  renderNode?: (node: CanvasNode, context: CanvasNodeRenderContext) => React.ReactNode
  onNodeDoubleClick?: (id: string) => void
  onBackgroundClick?: () => void
  onSelectionChange?: (selection: CanvasSelectionSnapshot) => void
  onCreateObject?: (kind: 'page' | 'database' | 'note' | 'shape' | 'frame') => void
  onOpenSelection?: (mode: 'peek' | 'focus' | 'split') => void
  onToggleShortcutHelp?: () => void
  onEditSelectionAlias?: () => void
  onCreateSelectionComment?: () => void
  onDismissTransientUi?: () => boolean | void
  onUndoRedoShortcut?: (direction: 'undo' | 'redo') => boolean
  onSceneMutation?: () => void
  onSurfaceDrop?: (
    event: React.DragEvent<HTMLDivElement>,
    context: CanvasSurfaceEventContext
  ) => void
  onSurfacePaste?: (
    event: React.ClipboardEvent<HTMLDivElement>,
    context: CanvasSurfaceEventContext
  ) => void
  onSurfaceDragOver?: (event: React.DragEvent<HTMLDivElement>) => void
  awareness?: AwarenessLike | null
  presenceIntent?: CanvasPresenceIntent | null
  className?: string
  style?: React.CSSProperties
  canvasNodeId?: string
  canvasSchema?: string
  showNavigationTools?: boolean
  showMinimap?: boolean
  collectPerformanceMetrics?: boolean
  minimapDefaultExpanded?: boolean
  minimapWidth?: number
  minimapHeight?: number
  minimapShowEdges?: boolean
  minimapClassName?: string
  navigationToolsPosition?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
  navigationToolsShowZoomLabel?: boolean
  navigationToolsClassName?: string
  navigationToolsStyle?: React.CSSProperties
}

type ViewportState = {
  x: number
  y: number
  zoom: number
}

type Size = {
  width: number
  height: number
}

type ScreenObject = {
  object: CanvasObjectRecord
  node: CanvasNode
  rect: Rect
}

type NodeDragState = {
  pointerId: number
  lastClientPoint: Point
  nodeIds: string[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getObjectTitle(object: CanvasObjectRecord): string {
  return object.preview.title ?? object.kind.replace('-', ' ')
}

function getObjectColor(kind: CanvasObjectRecord['kind']): string {
  switch (kind) {
    case 'page':
      return '#3b82f6'
    case 'database':
      return '#10b981'
    case 'external-reference':
      return '#ec4899'
    case 'media':
      return '#8b5cf6'
    case 'note':
      return '#f59e0b'
    case 'group':
      return '#64748b'
    case 'shape':
    default:
      return '#f97316'
  }
}

function rgbaTupleToCss(color: readonly [number, number, number, number]): string {
  return `rgba(${Math.round(color[0] * 255)}, ${Math.round(color[1] * 255)}, ${Math.round(
    color[2] * 255
  )}, ${color[3]})`
}

function createFallbackCanvasNode(object: CanvasObjectRecord): CanvasNode {
  return {
    id: object.id,
    type: object.kind,
    sourceNodeId: object.sourceNodeId,
    sourceSchemaId: object.sourceSchemaId,
    display: object.display,
    position: {
      x: object.position.x,
      y: object.position.y,
      width: object.position.width,
      height: object.position.height,
      rotation: object.position.rotation,
      zIndex: object.position.zIndex
    },
    properties: {
      title: object.preview.title,
      subtitle: object.preview.subtitle,
      sourceVersion: object.preview.sourceVersion,
      thumbnailHash: object.preview.thumbnailHash
    }
  }
}

function createCanvasCameraForViewport(viewport: ViewportState, viewportSize: Size) {
  return createCanvasCamera({
    localCenter: { x: viewport.x, y: viewport.y },
    zoom: viewport.zoom,
    viewportPx: viewportSize
  })
}

function getViewportWorldTopLeft(viewport: ViewportState, viewportSize: Size): Point {
  return {
    x: viewport.x - viewportSize.width / 2 / viewport.zoom,
    y: viewport.y - viewportSize.height / 2 / viewport.zoom
  }
}

function getScreenRectForObject(
  object: CanvasObjectRecord,
  viewport: ViewportState,
  viewportSize: Size
): Rect {
  const camera = createCanvasCameraForViewport(viewport, viewportSize)
  const topLeft = worldToScreenPoint(
    camera,
    createWorldPointFromCanvasPoint({ x: object.position.x, y: object.position.y })
  )
  const bottomRight = worldToScreenPoint(
    camera,
    createWorldPointFromCanvasPoint({
      x: object.position.x + object.position.width,
      y: object.position.y + object.position.height
    })
  )

  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y)
  }
}

function intersectsViewport(rect: Rect, viewportSize: Size, marginPx = 320): boolean {
  return (
    rect.x + rect.width >= -marginPx &&
    rect.y + rect.height >= -marginPx &&
    rect.x <= viewportSize.width + marginPx &&
    rect.y <= viewportSize.height + marginPx
  )
}

function getFitViewport(input: {
  rect: Rect
  viewportSize: Size
  minZoom: number
  maxZoom: number
  padding: number
}): ViewportState {
  const availableWidth = Math.max(1, input.viewportSize.width - input.padding * 2)
  const availableHeight = Math.max(1, input.viewportSize.height - input.padding * 2)
  const zoom = clamp(
    Math.min(
      availableWidth / Math.max(input.rect.width, 1),
      availableHeight / Math.max(input.rect.height, 1)
    ),
    input.minZoom,
    input.maxZoom
  )

  return {
    x: input.rect.x + input.rect.width / 2,
    y: input.rect.y + input.rect.height / 2,
    zoom
  }
}

function isTextInputLikeElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function isPrimaryPointerButton(event: React.PointerEvent): boolean {
  return event.button === 0 || event.button === undefined
}

function readRemoteUsers(awareness: AwarenessLike | null | undefined): CanvasRemoteUser[] {
  if (!awareness) {
    return []
  }

  return Array.from(awareness.getStates().entries())
    .filter(([clientId]) => clientId !== awareness.clientID)
    .map(([clientId, state]) => {
      const user = state.user as { did?: string; name?: string; color?: string } | undefined
      const cursor = state.cursor as Partial<Point> | undefined
      const viewport = state.viewport as Partial<ViewportState> | undefined
      const selectedNodes = Array.isArray(state.canvasSelection)
        ? state.canvasSelection.filter((id): id is string => typeof id === 'string')
        : undefined

      return {
        clientId,
        did: user?.did ?? `peer:${clientId}`,
        name: user?.name ?? `Peer ${clientId}`,
        color: user?.color ?? '#64748b',
        selectedNodes,
        cursor:
          typeof cursor?.x === 'number' && typeof cursor.y === 'number'
            ? { x: cursor.x, y: cursor.y }
            : undefined,
        viewport:
          typeof viewport?.x === 'number' &&
          typeof viewport.y === 'number' &&
          typeof viewport.zoom === 'number'
            ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
            : undefined,
        activity: typeof state.activity === 'string' ? state.activity : undefined,
        editingNodeId: typeof state.editingNodeId === 'string' ? state.editingNodeId : undefined
      }
    })
}

function useCanvasV3Scene(doc: Y.Doc) {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap(doc)
    const syncRevision = () => setRevision((current) => current + 1)

    syncRevision()
    objects.observe(syncRevision)
    connectors.observe(syncRevision)

    return () => {
      objects.unobserve(syncRevision)
      connectors.unobserve(syncRevision)
    }
  }, [doc])

  return useMemo(() => readCanvasV3MigrationSceneFromFlatDoc(doc), [doc, revision])
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 1, height: 1 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const updateSize = () => {
      setSize({
        width: Math.max(
          1,
          element.clientWidth || Math.round(element.getBoundingClientRect().width)
        ),
        height: Math.max(
          1,
          element.clientHeight || Math.round(element.getBoundingClientRect().height)
        )
      })
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(updateSize)
    observer.observe(element)

    return () => observer.disconnect()
  }, [ref])

  return size
}

function useVectorTileLayer(input: {
  containerRef: React.RefObject<HTMLDivElement | null>
  summaries: readonly CanvasTileSummary[]
  viewport: ViewportState
  viewportSize: Size
}): boolean {
  const rendererRef = useRef<WebGLVectorTileRenderer | null>(null)
  const [available, setAvailable] = useState(false)

  useEffect(() => {
    const container = input.containerRef.current
    if (!container) {
      return
    }

    const renderer = createWebGLVectorTileRenderer(container)
    rendererRef.current = renderer
    setAvailable(renderer !== null)

    return () => {
      renderer?.destroy()
      rendererRef.current = null
      setAvailable(false)
    }
  }, [input.containerRef])

  useLayoutEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) {
      return
    }

    const topLeft = getViewportWorldTopLeft(input.viewport, input.viewportSize)
    const tiles = input.summaries.map((summary) => ({
      tileId: summary.tileId,
      summary
    }))

    renderer.setTiles(tiles)
    renderer.render({
      x: topLeft.x,
      y: topLeft.y,
      width: input.viewportSize.width,
      height: input.viewportSize.height,
      zoom: input.viewport.zoom
    })
  }, [input.summaries, input.viewport, input.viewportSize])

  return available
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function CanvasV3(
  {
    doc,
    config = {},
    initialViewport,
    renderNode,
    onNodeDoubleClick,
    onBackgroundClick,
    onSelectionChange,
    onCreateObject,
    onOpenSelection,
    onToggleShortcutHelp,
    onEditSelectionAlias,
    onCreateSelectionComment,
    onDismissTransientUi,
    onUndoRedoShortcut,
    onSceneMutation,
    onSurfaceDrop,
    onSurfacePaste,
    onSurfaceDragOver,
    awareness,
    presenceIntent,
    className,
    style,
    canvasNodeId,
    canvasSchema,
    showNavigationTools = false,
    showMinimap = false,
    minimapDefaultExpanded = true,
    minimapWidth = 220,
    minimapHeight = 140,
    minimapClassName,
    navigationToolsPosition = 'bottom-left',
    navigationToolsShowZoomLabel = true,
    navigationToolsClassName,
    navigationToolsStyle
  },
  ref
) {
  const theme = useCanvasThemeTokens()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const vectorLayerRef = useRef<HTMLDivElement | null>(null)
  const lastPointerRef = useRef<Point | null>(null)
  const nodeDragRef = useRef<NodeDragState | null>(null)
  const scene = useCanvasV3Scene(doc)
  const viewportSize = useElementSize(containerRef)
  const minZoom = config.minZoom ?? 0.1
  const maxZoom = config.maxZoom ?? 4
  const [viewport, setViewport] = useState<ViewportState>({
    x: initialViewport?.x ?? 0,
    y: initialViewport?.y ?? 0,
    zoom: initialViewport?.zoom ?? 1
  })
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [remoteUsers, setRemoteUsers] = useState<CanvasRemoteUser[]>(() =>
    readRemoteUsers(awareness)
  )
  const vectorLayerAvailable = useVectorTileLayer({
    containerRef: vectorLayerRef,
    summaries: scene.summaries,
    viewport,
    viewportSize
  })

  const setViewportClamped = useCallback(
    (updater: ViewportState | ((current: ViewportState) => ViewportState)) => {
      setViewport((current) => {
        const next = typeof updater === 'function' ? updater(current) : updater

        return {
          x: next.x,
          y: next.y,
          zoom: clamp(next.zoom, minZoom, maxZoom)
        }
      })
    },
    [maxZoom, minZoom]
  )

  const screenToCanvasPoint = useCallback(
    (clientX: number, clientY: number): Point => {
      const container = containerRef.current
      const bounds = container?.getBoundingClientRect()
      const screenPoint = {
        x: clientX - (bounds?.left ?? 0),
        y: clientY - (bounds?.top ?? 0)
      }
      const camera = createCanvasCameraForViewport(viewport, viewportSize)

      return worldPointToAnchorLocal(
        screenToWorldPoint(camera, screenPoint),
        { tx: 0, ty: 0 },
        camera.tileSize
      )
    },
    [viewport, viewportSize]
  )

  const fitToRect = useCallback(
    (rect: Rect, padding = 80) => {
      setViewportClamped(
        getFitViewport({
          rect,
          viewportSize,
          minZoom,
          maxZoom,
          padding
        })
      )
    },
    [maxZoom, minZoom, setViewportClamped, viewportSize]
  )

  const clearSelection = useCallback(() => {
    setSelectedNodeIds(new Set())
    setFocusedNodeId(null)
  }, [])

  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelectedNodeIds(new Set(nodeIds))
    setFocusedNodeId(nodeIds[0] ?? null)
  }, [])

  const getSelectedNodes = useCallback((): CanvasNode[] => {
    const objects = getCanvasObjectsMap<CanvasNode>(doc)

    return Array.from(selectedNodeIds)
      .map((id) => objects.get(id))
      .filter((node): node is CanvasNode => node !== undefined)
  }, [doc, selectedNodeIds])

  const applyPositionUpdates = useCallback(
    (updates: CanvasPositionUpdate[]): boolean => {
      if (updates.length === 0) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      let changed = false

      doc.transact(() => {
        for (const update of updates) {
          const node = objects.get(update.id)
          if (!node) {
            continue
          }

          objects.set(update.id, {
            ...node,
            position: {
              ...node.position,
              ...update.position
            }
          })
          changed = true
        }
      })

      if (changed) {
        onSceneMutation?.()
      }

      return changed
    },
    [doc, onSceneMutation]
  )

  const applyLockUpdates = useCallback(
    (updates: CanvasLockUpdate[]): boolean => {
      if (updates.length === 0) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      let changed = false

      doc.transact(() => {
        for (const update of updates) {
          const node = objects.get(update.id)
          if (!node) {
            continue
          }

          objects.set(update.id, {
            ...node,
            locked: update.locked
          })
          changed = true
        }
      })

      if (changed) {
        onSceneMutation?.()
      }

      return changed
    },
    [doc, onSceneMutation]
  )

  const applySelectionPositionUpdates = useCallback(
    (updates: CanvasPositionUpdate[]): boolean => {
      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const nodesById = new Map(Array.from(objects.entries()))

      return applyPositionUpdates(expandContainerPositionUpdates(nodesById, updates))
    },
    [applyPositionUpdates, doc]
  )

  const toggleSelectionLock = useCallback((): boolean => {
    return applyLockUpdates(createLockUpdates(getSelectedNodes()))
  }, [applyLockUpdates, getSelectedNodes])

  const alignSelection = useCallback(
    (alignment: CanvasAlignment): boolean => {
      return applySelectionPositionUpdates(
        createAlignmentUpdates(getUnlockedSelection(getSelectedNodes()), alignment)
      )
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  const distributeSelection = useCallback(
    (axis: CanvasDistributionAxis): boolean => {
      return applySelectionPositionUpdates(
        createDistributionUpdates(getUnlockedSelection(getSelectedNodes()), axis)
      )
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  const tidySelection = useCallback((): boolean => {
    return applySelectionPositionUpdates(
      createTidySelectionUpdates(getUnlockedSelection(getSelectedNodes()))
    )
  }, [applySelectionPositionUpdates, getSelectedNodes])

  const shiftSelectionLayer = useCallback(
    (direction: CanvasLayerDirection): boolean => {
      return applySelectionPositionUpdates(
        createLayerShiftUpdates(getUnlockedSelection(getSelectedNodes()), direction)
      )
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  const wrapSelectionInFrame = useCallback((): boolean => {
    const frame = createFrameSelectionNode(getUnlockedSelection(getSelectedNodes()))
    if (!frame) {
      return false
    }

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    doc.transact(() => {
      objects.set(frame.id, frame)
    })
    setSelectedNodeIds(new Set([frame.id]))
    setFocusedNodeId(frame.id)
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation])

  const connectSelection = useCallback((): boolean => {
    const selectedNodes = getSelectedNodes()
    if (selectedNodes.length !== 2) {
      return false
    }

    const connectors = getCanvasConnectorsMap(doc)
    const edge = createEdge(selectedNodes[0].id, selectedNodes[1].id)

    doc.transact(() => {
      connectors.set(edge.id, edge)
    })
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation])

  const moveSelectionByScreenDelta = useCallback(
    (nodeIds: string[], delta: Point): boolean => {
      if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const selectedNodes = nodeIds
        .map((id) => objects.get(id))
        .filter((node): node is CanvasNode => node !== undefined)
      const deltaCanvas = {
        x: delta.x / viewport.zoom,
        y: delta.y / viewport.zoom
      }
      const updates = getUnlockedSelection(selectedNodes).map((node) => ({
        id: node.id,
        position: {
          x: Math.round(node.position.x + deltaCanvas.x),
          y: Math.round(node.position.y + deltaCanvas.y)
        }
      }))

      return applySelectionPositionUpdates(updates)
    },
    [applySelectionPositionUpdates, doc, viewport.zoom]
  )

  const applyViewportChanges = useCallback(
    (changes: { x?: number; y?: number; zoom?: number }) => {
      setViewportClamped((current) => ({
        x: changes.x ?? current.x,
        y: changes.y ?? current.y,
        zoom: changes.zoom ?? current.zoom
      }))
    },
    [setViewportClamped]
  )

  useImperativeHandle(
    ref,
    () => ({
      fitToContent: (padding?: number) => {
        if (scene.bounds) {
          fitToRect(scene.bounds, padding)
        }
      },
      fitToRect,
      resetView: () => setViewportClamped({ x: 0, y: 0, zoom: 1 }),
      getViewportSnapshot: () => viewport,
      setViewportSnapshot: (snapshot) =>
        setViewportClamped({
          x: snapshot.x,
          y: snapshot.y,
          zoom: snapshot.zoom
        }),
      clearSelection,
      selectNodes,
      toggleSelectionLock,
      alignSelection,
      distributeSelection,
      tidySelection,
      shiftSelectionLayer,
      wrapSelectionInFrame,
      connectSelection,
      undo: () => onUndoRedoShortcut?.('undo') ?? false,
      redo: () => onUndoRedoShortcut?.('redo') ?? false,
      screenToCanvas: screenToCanvasPoint,
      getPerformanceStats: () => EMPTY_FRAME_STATS,
      resetPerformanceStats: () => undefined
    }),
    [
      clearSelection,
      alignSelection,
      connectSelection,
      distributeSelection,
      fitToRect,
      onUndoRedoShortcut,
      scene.bounds,
      screenToCanvasPoint,
      selectNodes,
      setViewportClamped,
      shiftSelectionLayer,
      tidySelection,
      toggleSelectionLock,
      viewport,
      wrapSelectionInFrame
    ]
  )

  useEffect(() => {
    onSelectionChange?.({
      nodeIds: Array.from(selectedNodeIds),
      edgeIds: []
    })
  }, [onSelectionChange, selectedNodeIds])

  useEffect(() => {
    awareness?.setLocalStateField('canvasSelection', Array.from(selectedNodeIds))
  }, [awareness, selectedNodeIds])

  useEffect(() => {
    awareness?.setLocalStateField('viewport', viewport)
  }, [awareness, viewport])

  useEffect(() => {
    awareness?.setLocalStateField('activity', presenceIntent?.activity ?? 'idle')
    awareness?.setLocalStateField('editingNodeId', presenceIntent?.editingNodeId ?? null)
  }, [awareness, presenceIntent])

  useEffect(() => {
    if (!awareness) {
      setRemoteUsers([])
      return
    }

    const syncRemoteUsers = () => setRemoteUsers(readRemoteUsers(awareness))

    syncRemoteUsers()
    awareness.on('change', syncRemoteUsers)

    return () => awareness.off('change', syncRemoteUsers)
  }, [awareness])

  const screenObjects = useMemo<ScreenObject[]>(() => {
    return scene.objects
      .map((object) => ({
        object,
        node: scene.sourceNodesById.get(object.id) ?? createFallbackCanvasNode(object),
        rect: getScreenRectForObject(object, viewport, viewportSize)
      }))
      .filter((item) => intersectsViewport(item.rect, viewportSize))
  }, [scene.objects, scene.sourceNodesById, viewport, viewportSize])

  const islandPlan = useMemo(() => {
    return planDomIslandPool({
      candidates: screenObjects.map((item) => ({
        object: item.object,
        screenRect: item.rect,
        selected: selectedNodeIds.has(item.object.id),
        focused: focusedNodeId === item.object.id,
        editing: presenceIntent?.editingNodeId === item.object.id,
        distanceToViewportCenterPx: Math.hypot(
          item.rect.x + item.rect.width / 2 - viewportSize.width / 2,
          item.rect.y + item.rect.height / 2 - viewportSize.height / 2
        )
      })),
      budgets: DEFAULT_DOM_BUDGETS
    })
  }, [focusedNodeId, presenceIntent?.editingNodeId, screenObjects, selectedNodeIds, viewportSize])
  const domIslandIds = useMemo(
    () => new Set(islandPlan.assignments.map((assignment) => assignment.objectId)),
    [islandPlan.assignments]
  )
  const domIslandTierById = useMemo(
    () =>
      new Map(
        islandPlan.assignments.map((assignment) => [assignment.objectId, assignment.tier] as const)
      ),
    [islandPlan.assignments]
  )
  const commentsObjects = useMemo(() => {
    return new Map(
      scene.objects.map((object) => [
        object.id,
        {
          id: object.id,
          x: object.position.x,
          y: object.position.y,
          width: object.position.width,
          height: object.position.height
        }
      ])
    )
  }, [scene.objects])
  const minimapViewport = useMemo(
    () =>
      new Viewport({
        x: viewport.x,
        y: viewport.y,
        zoom: viewport.zoom,
        width: viewportSize.width,
        height: viewportSize.height
      }),
    [viewport, viewportSize]
  )
  const visibleConnectorLines = useMemo(() => {
    return scene.connectors
      .map((connector) => {
        const sourceRect = getScreenRectForObject(
          {
            id: `${connector.id}:source`,
            kind: 'shape',
            position: {
              x: connector.source.anchor.x,
              y: connector.source.anchor.y,
              width: 1,
              height: 1
            },
            display: {},
            preview: {}
          },
          viewport,
          viewportSize
        )
        const targetRect = getScreenRectForObject(
          {
            id: `${connector.id}:target`,
            kind: 'shape',
            position: {
              x: connector.target.anchor.x,
              y: connector.target.anchor.y,
              width: 1,
              height: 1
            },
            display: {},
            preview: {}
          },
          viewport,
          viewportSize
        )

        return {
          id: connector.id,
          x1: sourceRect.x,
          y1: sourceRect.y,
          x2: targetRect.x,
          y2: targetRect.y
        }
      })
      .filter((line) => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite))
  }, [scene.connectors, viewport, viewportSize])

  const createSurfaceEventContext = useCallback(
    (): CanvasSurfaceEventContext => ({
      viewportSnapshot: viewport,
      screenToCanvas: screenToCanvasPoint
    }),
    [screenToCanvasPoint, viewport]
  )

  const handleNodePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, objectId: string) => {
      if (!isPrimaryPointerButton(event) || isTextInputLikeElement(event.target)) {
        return
      }

      event.stopPropagation()
      const additive = event.shiftKey || event.metaKey
      const wasSelected = selectedNodeIds.has(objectId)
      const dragNodeIds = !additive && wasSelected ? Array.from(selectedNodeIds) : [objectId]

      setFocusedNodeId(objectId)
      setSelectedNodeIds((current) => {
        if (!additive) {
          return new Set([objectId])
        }

        const next = new Set(current)
        if (next.has(objectId)) {
          next.delete(objectId)
        } else {
          next.add(objectId)
        }

        return next
      })

      if (!additive) {
        nodeDragRef.current = {
          pointerId: event.pointerId,
          lastClientPoint: { x: event.clientX, y: event.clientY },
          nodeIds: dragNodeIds
        }
        containerRef.current?.setPointerCapture?.(event.pointerId)
      }
    },
    [selectedNodeIds]
  )

  const handleBackgroundPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || event.target !== containerRef.current) {
        return
      }

      containerRef.current?.focus()
      onDismissTransientUi?.()
      clearSelection()
      onBackgroundClick?.()
      lastPointerRef.current = { x: event.clientX, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [clearSelection, onBackgroundClick, onDismissTransientUi]
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      awareness?.setLocalStateField('cursor', screenToCanvasPoint(event.clientX, event.clientY))

      const nodeDrag = nodeDragRef.current
      if (nodeDrag && nodeDrag.pointerId === event.pointerId) {
        const delta = {
          x: event.clientX - nodeDrag.lastClientPoint.x,
          y: event.clientY - nodeDrag.lastClientPoint.y
        }

        if (moveSelectionByScreenDelta(nodeDrag.nodeIds, delta)) {
          awareness?.setLocalStateField('activity', 'dragging')
        }

        nodeDragRef.current = {
          ...nodeDrag,
          lastClientPoint: { x: event.clientX, y: event.clientY }
        }
        return
      }

      const lastPointer = lastPointerRef.current
      if (!lastPointer) {
        return
      }

      const deltaX = event.clientX - lastPointer.x
      const deltaY = event.clientY - lastPointer.y
      lastPointerRef.current = { x: event.clientX, y: event.clientY }
      setViewportClamped((current) => ({
        ...current,
        x: current.x - deltaX / current.zoom,
        y: current.y - deltaY / current.zoom
      }))
    },
    [awareness, moveSelectionByScreenDelta, screenToCanvasPoint, setViewportClamped]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (nodeDragRef.current?.pointerId === event.pointerId) {
        nodeDragRef.current = null
        awareness?.setLocalStateField('activity', presenceIntent?.activity ?? 'idle')
      }

      if (lastPointerRef.current || event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }
      lastPointerRef.current = null
    },
    [awareness, presenceIntent?.activity]
  )

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()

      if (event.ctrlKey || event.metaKey) {
        const bounds = containerRef.current?.getBoundingClientRect()
        const screenX = event.clientX - (bounds?.left ?? 0)
        const screenY = event.clientY - (bounds?.top ?? 0)
        const factor = 1 - clamp(event.deltaY, -12, 12) * 0.012

        setViewportClamped((current) => {
          const nextZoom = clamp(current.zoom * factor, minZoom, maxZoom)
          const worldX = current.x + (screenX - viewportSize.width / 2) / current.zoom
          const worldY = current.y + (screenY - viewportSize.height / 2) / current.zoom

          return {
            x: worldX - (screenX - viewportSize.width / 2) / nextZoom,
            y: worldY - (screenY - viewportSize.height / 2) / nextZoom,
            zoom: nextZoom
          }
        })
        return
      }

      setViewportClamped((current) => ({
        ...current,
        x: current.x + event.deltaX / current.zoom,
        y: current.y + event.deltaY / current.zoom
      }))
    },
    [maxZoom, minZoom, setViewportClamped, viewportSize]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isTextInputLikeElement(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const mod = event.metaKey || event.ctrlKey

      if (key === 'escape') {
        if (onDismissTransientUi?.()) {
          event.preventDefault()
          return
        }
        clearSelection()
        event.preventDefault()
        return
      }

      if (mod && key === 'z') {
        event.preventDefault()
        const direction = event.shiftKey ? 'redo' : 'undo'
        onUndoRedoShortcut?.(direction)
        return
      }

      if (mod && key === '0') {
        event.preventDefault()
        setViewportClamped({ x: 0, y: 0, zoom: 1 })
        return
      }

      if (mod && key === '1') {
        event.preventDefault()
        if (scene.bounds) {
          fitToRect(scene.bounds)
        }
        return
      }

      if (key === 'enter' && selectedNodeIds.size > 0) {
        event.preventDefault()
        onOpenSelection?.('focus')
        return
      }

      if (key === '?') {
        event.preventDefault()
        onToggleShortcutHelp?.()
        return
      }

      if (key === 'r') {
        event.preventDefault()
        onCreateObject?.('shape')
        return
      }

      if (key === 'f') {
        event.preventDefault()
        onCreateObject?.('frame')
        return
      }

      if (key === 'n') {
        event.preventDefault()
        onCreateObject?.('note')
        return
      }

      if (key === 'e' && selectedNodeIds.size === 1) {
        event.preventDefault()
        onEditSelectionAlias?.()
        return
      }

      if (key === 'm' && selectedNodeIds.size === 1) {
        event.preventDefault()
        onCreateSelectionComment?.()
      }
    },
    [
      clearSelection,
      fitToRect,
      onCreateObject,
      onCreateSelectionComment,
      onDismissTransientUi,
      onEditSelectionAlias,
      onOpenSelection,
      onToggleShortcutHelp,
      onUndoRedoShortcut,
      scene.bounds,
      selectedNodeIds.size,
      setViewportClamped
    ]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      onSurfaceDrop?.(event, createSurfaceEventContext())
      onSceneMutation?.()
    },
    [createSurfaceEventContext, onSceneMutation, onSurfaceDrop]
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      onSurfaceDragOver?.(event)
    },
    [onSurfaceDragOver]
  )

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      onSurfacePaste?.(event, createSurfaceEventContext())
      onSceneMutation?.()
    },
    [createSurfaceEventContext, onSceneMutation, onSurfacePaste]
  )

  const renderObjectContent = (item: ScreenObject, tier: 'live-dom' | 'shell-dom') => {
    const selected = selectedNodeIds.has(item.object.id)
    const lod = tier === 'live-dom' ? calculateLOD(viewport.zoom) : 'compact'
    const customContent = renderNode?.(item.node, {
      selected,
      lod,
      selectionSize: selectedNodeIds.size,
      viewportZoom: viewport.zoom
    })

    if (customContent) {
      return customContent
    }

    return (
      <div style={styles.builtinNodeContent}>
        <div
          style={{
            ...styles.kindDot,
            background: getObjectColor(item.object.kind)
          }}
        />
        <div style={styles.builtinNodeText}>
          <span style={styles.builtinTitle}>{getObjectTitle(item.object)}</span>
          <span style={styles.builtinSubtitle}>{item.object.kind}</span>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...styles.surface,
        color: theme.panelText,
        backgroundColor: theme.surfaceBackground,
        backgroundImage:
          config.showGrid === false
            ? undefined
            : `radial-gradient(circle, ${rgbaTupleToCss(theme.gridColor)} 1px, transparent 1px)`,
        backgroundSize: `${Math.max(8, (config.gridSize ?? 20) * viewport.zoom)}px ${Math.max(
          8,
          (config.gridSize ?? 20) * viewport.zoom
        )}px`,
        backgroundPosition: `${viewportSize.width / 2 - viewport.x * viewport.zoom}px ${
          viewportSize.height / 2 - viewport.y * viewport.zoom
        }px`,
        ...style
      }}
      tabIndex={0}
      role="application"
      aria-label="Canvas"
      data-canvas-surface="true"
      data-canvas-renderer-version="3"
      data-canvas-v3-surface="true"
      data-canvas-object-count={scene.objects.length}
      data-canvas-dom-live-count={islandPlan.budgets.liveUsed}
      data-canvas-dom-shell-count={islandPlan.budgets.shellUsed}
      data-canvas-vector-layer={vectorLayerAvailable ? 'webgl2' : 'css-fallback'}
      onPointerDown={handleBackgroundPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onPaste={handlePaste}
      onMouseLeave={() => awareness?.setLocalStateField('cursor', null)}
    >
      <div ref={vectorLayerRef} style={styles.vectorLayer} aria-hidden="true" />

      <svg style={styles.edgeLayer} aria-hidden="true" data-canvas-v3-edge-layer="true">
        {visibleConnectorLines.map((line) => (
          <line
            key={line.id}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={theme.minimapEdge}
            strokeWidth={1.5}
            strokeOpacity={0.42}
          />
        ))}
      </svg>

      {!vectorLayerAvailable
        ? screenObjects
            .filter((item) => !domIslandIds.has(item.object.id))
            .map((item) => (
              <div
                key={item.object.id}
                style={{
                  ...styles.vectorFallbackObject,
                  left: item.rect.x,
                  top: item.rect.y,
                  width: Math.max(2, item.rect.width),
                  height: Math.max(2, item.rect.height),
                  borderColor: getObjectColor(item.object.kind),
                  background: `${getObjectColor(item.object.kind)}22`
                }}
                data-canvas-v3-vector-fallback="true"
                data-canvas-object-id={item.object.id}
              />
            ))
        : null}

      {screenObjects
        .filter((item) => domIslandIds.has(item.object.id))
        .map((item) => {
          const selected = selectedNodeIds.has(item.object.id)
          const tier = domIslandTierById.get(item.object.id) ?? 'shell-dom'

          return (
            <div
              key={item.object.id}
              style={{
                ...styles.domIsland,
                left: item.rect.x,
                top: item.rect.y,
                width: item.object.position.width,
                height: item.object.position.height,
                transform: `scale(${viewport.zoom})`,
                borderColor: selected ? theme.minimapViewportStroke : theme.panelBorder,
                boxShadow: selected
                  ? `0 0 0 2px ${theme.minimapViewportStroke}`
                  : theme.panelShadow,
                background: theme.panelBackground
              }}
              data-canvas-v3-object="true"
              data-canvas-object-id={item.object.id}
              data-canvas-dom-island-tier={tier}
              data-selected={selected ? 'true' : 'false'}
              onPointerDown={(event) => handleNodePointerDown(event, item.object.id)}
              onDoubleClick={() => onNodeDoubleClick?.(item.object.id)}
            >
              {renderObjectContent(item, tier)}
            </div>
          )
        })}

      {remoteUsers.map((user) =>
        user.cursor ? (
          <div
            key={user.clientId}
            style={{
              ...styles.remoteCursor,
              left: getScreenRectForObject(
                {
                  id: `cursor:${user.clientId}`,
                  kind: 'shape',
                  position: { x: user.cursor.x, y: user.cursor.y, width: 1, height: 1 },
                  display: {},
                  preview: {}
                },
                viewport,
                viewportSize
              ).x,
              top: getScreenRectForObject(
                {
                  id: `cursor:${user.clientId}`,
                  kind: 'shape',
                  position: { x: user.cursor.x, y: user.cursor.y, width: 1, height: 1 },
                  display: {},
                  preview: {}
                },
                viewport,
                viewportSize
              ).y,
              borderColor: user.color
            }}
            title={user.name}
            data-canvas-remote-cursor="true"
          />
        ) : null
      )}

      {canvasNodeId ? (
        <CommentOverlay
          canvasNodeId={canvasNodeId}
          canvasSchema={canvasSchema}
          transform={{ panX: viewport.x, panY: viewport.y, zoom: viewport.zoom }}
          objects={commentsObjects}
        />
      ) : null}

      {showMinimap ? (
        <CollapsibleMinimap
          summary={scene.minimapSummary}
          viewport={minimapViewport}
          width={minimapWidth}
          height={minimapHeight}
          onViewportChange={applyViewportChanges}
          className={minimapClassName}
          defaultExpanded={minimapDefaultExpanded}
        />
      ) : null}

      {showNavigationTools ? (
        <NavigationTools
          viewport={{
            x: viewport.x,
            y: viewport.y,
            zoom: viewport.zoom,
            width: viewportSize.width,
            height: viewportSize.height
          }}
          canvasBounds={scene.bounds}
          onViewportChange={applyViewportChanges}
          position={navigationToolsPosition}
          showZoomLabel={navigationToolsShowZoomLabel}
          className={navigationToolsClassName}
          style={navigationToolsStyle}
          insetRight={showMinimap ? minimapWidth + 32 : 16}
        />
      ) : null}
    </div>
  )
})

const styles: Record<string, React.CSSProperties> = {
  surface: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    outline: 'none',
    touchAction: 'none',
    userSelect: 'none'
  },
  vectorLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none'
  },
  edgeLayer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'visible'
  },
  vectorFallbackObject: {
    position: 'absolute',
    border: '1px solid',
    borderRadius: 3,
    opacity: 0.72,
    pointerEvents: 'none'
  },
  domIsland: {
    position: 'absolute',
    overflow: 'hidden',
    border: '1px solid',
    borderRadius: 8,
    background: 'rgba(255, 255, 255, 0.9)',
    transformOrigin: 'top left',
    pointerEvents: 'auto'
  },
  builtinNodeContent: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    boxSizing: 'border-box'
  },
  kindDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    flex: '0 0 auto'
  },
  builtinNodeText: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  builtinTitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.2
  },
  builtinSubtitle: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 11,
    opacity: 0.68,
    lineHeight: 1.2,
    textTransform: 'capitalize'
  },
  remoteCursor: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 999,
    border: '2px solid',
    background: 'white',
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
    zIndex: 20
  }
}
