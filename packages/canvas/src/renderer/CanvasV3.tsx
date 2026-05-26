/**
 * Canvas v3 active React renderer.
 */

import type { LODLevel } from '../nodes/CanvasNodeComponent'
import type { FrameStats } from '../performance'
import type {
  CanvasAlignment,
  CanvasConfig,
  CanvasDistributionAxis,
  CanvasEdge,
  CanvasLayerDirection,
  CanvasNode,
  Point,
  Rect,
  ResizeHandle
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
import { getCanvasEdgeNodeIds } from '../edges/bindings'
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
  createResizeUpdate,
  createTidySelectionUpdates,
  expandContainerPositionUpdates,
  getSelectionBounds,
  getSelectionLockState,
  getUnlockedSelection,
  type CanvasLockUpdate,
  type CanvasPositionUpdate
} from '../selection/scene-operations'
import { Viewport } from '../spatial'
import { createEdge, generateNodeId } from '../store'
import { type CanvasThemeTokens, useCanvasThemeTokens } from '../theme/canvas-theme'
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
  duplicateSelection: () => boolean
  deleteSelection: () => boolean
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
  nodeIds: string[]
  originPositions: ReadonlyMap<string, Point>
  screenDelta: Point
  startClientPoint: Point
}

type NodeResizeState = {
  pointerId: number
  lastClientPoint: Point
  nodeId: string
  handle: ResizeHandle
}

type DragPreviewState = {
  nodeIds: ReadonlySet<string>
  screenDelta: Point
}

const RESIZE_HANDLES: ResizeHandle[] = [
  'top-left',
  'top',
  'top-right',
  'right',
  'bottom-right',
  'bottom',
  'bottom-left',
  'left'
]

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

function cloneCanvasNodeProperties(properties: CanvasNode['properties']): CanvasNode['properties'] {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(properties) as CanvasNode['properties']
  }

  return { ...properties }
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
  return getScreenRectForCanvasRect(object.position, viewport, viewportSize)
}

function getScreenRectForCanvasRect(rect: Rect, viewport: ViewportState, viewportSize: Size): Rect {
  const camera = createCanvasCameraForViewport(viewport, viewportSize)
  const topLeft = worldToScreenPoint(
    camera,
    createWorldPointFromCanvasPoint({ x: rect.x, y: rect.y })
  )
  const bottomRight = worldToScreenPoint(
    camera,
    createWorldPointFromCanvasPoint({
      x: rect.x + rect.width,
      y: rect.y + rect.height
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

function getResizeHandleCursor(handle: ResizeHandle): string {
  const cursors: Record<ResizeHandle, string> = {
    'top-left': 'nwse-resize',
    top: 'ns-resize',
    'top-right': 'nesw-resize',
    right: 'ew-resize',
    'bottom-right': 'nwse-resize',
    bottom: 'ns-resize',
    'bottom-left': 'nesw-resize',
    left: 'ew-resize'
  }

  return cursors[handle]
}

function isCornerResizeHandle(handle: ResizeHandle): boolean {
  return (
    handle === 'top-left' ||
    handle === 'top-right' ||
    handle === 'bottom-right' ||
    handle === 'bottom-left'
  )
}

function shouldPreserveResizeAspectRatio(node: CanvasNode, handle: ResizeHandle): boolean {
  return node.type === 'media' && isCornerResizeHandle(handle)
}

function getResizeHandleStyle(
  handle: ResizeHandle,
  colors: {
    background: string
    border: string
    shadow: string
  }
): React.CSSProperties {
  const size = 10
  const inset = 4
  const centerOffset = -size / 2
  const base: React.CSSProperties = {
    position: 'absolute',
    appearance: 'none',
    width: size,
    height: size,
    padding: 0,
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    boxShadow: colors.shadow,
    cursor: getResizeHandleCursor(handle),
    pointerEvents: 'auto',
    zIndex: 3
  }

  switch (handle) {
    case 'top-left':
      return { ...base, top: inset, left: inset }
    case 'top':
      return { ...base, top: inset, left: '50%', marginLeft: centerOffset }
    case 'top-right':
      return { ...base, top: inset, right: inset }
    case 'right':
      return { ...base, top: '50%', right: inset, marginTop: centerOffset }
    case 'bottom-right':
      return { ...base, right: inset, bottom: inset }
    case 'bottom':
      return { ...base, bottom: inset, left: '50%', marginLeft: centerOffset }
    case 'bottom-left':
      return { ...base, bottom: inset, left: inset }
    case 'left':
      return { ...base, top: '50%', left: inset, marginTop: centerOffset }
  }
}

function getSelectionToolbarButtonStyle(
  theme: CanvasThemeTokens,
  disabled: boolean
): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
    padding: '0 10px',
    border: `1px solid ${theme.panelBorder}`,
    borderRadius: 999,
    background: disabled ? 'transparent' : theme.panelBackground,
    color: disabled ? theme.panelButtonDisabled : theme.panelText,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    cursor: disabled ? 'not-allowed' : 'pointer'
  }
}

function CanvasSelectionToolbarButton({
  action,
  label,
  title,
  disabled = false,
  theme,
  onClick
}: {
  action: string
  label: string
  title?: string
  disabled?: boolean
  theme: CanvasThemeTokens
  onClick: () => void
}) {
  return (
    <button
      type="button"
      style={getSelectionToolbarButtonStyle(theme, disabled)}
      disabled={disabled}
      aria-label={title ?? label}
      title={title ?? label}
      data-canvas-v3-selection-action={action}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      {label}
    </button>
  )
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
  const nodeResizeRef = useRef<NodeResizeState | null>(null)
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
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)
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

  const duplicateSelection = useCallback((): boolean => {
    const selectedNodes = getUnlockedSelection(getSelectedNodes())
    if (selectedNodes.length === 0) {
      return false
    }

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const idMap = new Map(selectedNodes.map((node) => [node.id, generateNodeId()] as const))
    const maxZIndex = Math.max(
      0,
      ...Array.from(objects.values()).map((node) => node.position.zIndex ?? 0)
    )
    const duplicateIds: string[] = []

    doc.transact(() => {
      selectedNodes.forEach((node, index) => {
        const duplicateId = idMap.get(node.id)
        if (!duplicateId) {
          return
        }

        const properties = cloneCanvasNodeProperties(node.properties)
        if (Array.isArray(properties.memberIds)) {
          properties.memberIds = properties.memberIds.map((memberId) =>
            typeof memberId === 'string' ? (idMap.get(memberId) ?? memberId) : memberId
          )
        }

        const duplicate: CanvasNode = {
          ...node,
          id: duplicateId,
          locked: false,
          position: {
            ...node.position,
            x: Math.round(node.position.x + 32),
            y: Math.round(node.position.y + 32),
            zIndex: maxZIndex + index + 1
          },
          properties
        }

        objects.set(duplicate.id, duplicate)
        duplicateIds.push(duplicate.id)
      })
    })

    if (duplicateIds.length === 0) {
      return false
    }

    setSelectedNodeIds(new Set(duplicateIds))
    setFocusedNodeId(duplicateIds[0] ?? null)
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation])

  const deleteSelection = useCallback((): boolean => {
    const selectedNodes = getUnlockedSelection(getSelectedNodes())
    if (selectedNodes.length === 0) {
      return false
    }

    const deletedIds = new Set(selectedNodes.map((node) => node.id))
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)
    let changed = false

    doc.transact(() => {
      for (const id of deletedIds) {
        if (!objects.has(id)) {
          continue
        }

        objects.delete(id)
        changed = true
      }

      connectors.forEach((edge, edgeId) => {
        const [sourceId, targetId] = getCanvasEdgeNodeIds(edge)
        if ((sourceId && deletedIds.has(sourceId)) || (targetId && deletedIds.has(targetId))) {
          connectors.delete(edgeId)
          changed = true
        }
      })
    })

    if (!changed) {
      return false
    }

    const remainingIds = Array.from(selectedNodeIds).filter((id) => !deletedIds.has(id))
    setSelectedNodeIds(new Set(remainingIds))
    setFocusedNodeId(remainingIds[0] ?? null)
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation, selectedNodeIds])

  const selectedNodes = useMemo(() => getSelectedNodes(), [getSelectedNodes, scene.objects])
  const selectionBounds = useMemo(() => getSelectionBounds(selectedNodes), [selectedNodes])
  const selectionLockState = useMemo(() => getSelectionLockState(selectedNodes), [selectedNodes])
  const firstSelectedNode = selectedNodes[0] ?? null
  const selectionToolbarTitle =
    selectedNodes.length === 1 && firstSelectedNode
      ? String(
          firstSelectedNode.alias ?? firstSelectedNode.properties.title ?? firstSelectedNode.type
        )
      : `${selectedNodes.length} selected`
  const selectionToolbarRect = useMemo(() => {
    if (!selectionBounds) {
      return null
    }

    return getScreenRectForCanvasRect(selectionBounds, viewport, viewportSize)
  }, [selectionBounds, viewport, viewportSize])
  const selectionToolbarPreviewDelta = useMemo((): Point | null => {
    if (!dragPreview || selectedNodeIds.size === 0) {
      return null
    }

    return Array.from(selectedNodeIds).every((id) => dragPreview.nodeIds.has(id))
      ? dragPreview.screenDelta
      : null
  }, [dragPreview, selectedNodeIds])
  const selectionToolbarStyle = useMemo<React.CSSProperties | null>(() => {
    if (!selectionToolbarRect) {
      return null
    }

    const selectionCenter = selectionToolbarRect.x + selectionToolbarRect.width / 2
    const top =
      selectionToolbarRect.y >= 58
        ? selectionToolbarRect.y - 48
        : Math.min(
            viewportSize.height - 48,
            selectionToolbarRect.y + selectionToolbarRect.height + 12
          )

    return {
      ...styles.selectionToolbar,
      left: clamp(
        selectionCenter + (selectionToolbarPreviewDelta?.x ?? 0),
        168,
        Math.max(168, viewportSize.width - 168)
      ),
      top: Math.max(12, top + (selectionToolbarPreviewDelta?.y ?? 0)),
      color: theme.panelText,
      background: theme.panelBackground,
      borderColor: theme.panelBorder,
      boxShadow: theme.panelShadow
    }
  }, [
    selectionToolbarRect,
    selectionToolbarPreviewDelta,
    theme.panelBackground,
    theme.panelBorder,
    theme.panelShadow,
    theme.panelText,
    viewportSize.height,
    viewportSize.width
  ])

  const commitSelectionDragByScreenDelta = useCallback(
    (dragState: NodeDragState): boolean => {
      const delta = dragState.screenDelta
      if (dragState.nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const selectedNodes = dragState.nodeIds
        .map((id) => objects.get(id))
        .filter((node): node is CanvasNode => node !== undefined)
      const deltaCanvas = {
        x: delta.x / viewport.zoom,
        y: delta.y / viewport.zoom
      }

      const updates = getUnlockedSelection(selectedNodes)
        .map((node): CanvasPositionUpdate | null => {
          const origin = dragState.originPositions.get(node.id)
          if (!origin) {
            return null
          }

          return {
            id: node.id,
            position: {
              x: Math.round(origin.x + deltaCanvas.x),
              y: Math.round(origin.y + deltaCanvas.y)
            }
          }
        })
        .filter((update): update is CanvasPositionUpdate => update !== null)

      return applySelectionPositionUpdates(updates)
    },
    [applySelectionPositionUpdates, doc, viewport.zoom]
  )

  const createDragPreview = useCallback(
    (nodeIds: string[], screenDelta: Point): DragPreviewState => {
      return {
        nodeIds: new Set(nodeIds),
        screenDelta
      }
    },
    []
  )

  const getDragPreviewDeltaForObject = useCallback(
    (objectId: string): Point | null => {
      if (!dragPreview?.nodeIds.has(objectId)) {
        return null
      }

      return dragPreview.screenDelta
    },
    [dragPreview]
  )

  const getDragPreviewDeltaForConnectorEndpoint = useCallback(
    (objectId: string): Point => {
      return getDragPreviewDeltaForObject(objectId) ?? { x: 0, y: 0 }
    },
    [getDragPreviewDeltaForObject]
  )

  const createNodeDragState = useCallback(
    (pointerId: number, nodeIds: string[], startClientPoint: Point): NodeDragState => {
      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const originPositions = new Map<string, Point>()

      for (const id of nodeIds) {
        const node = objects.get(id)
        if (!node) {
          continue
        }

        originPositions.set(id, {
          x: node.position.x,
          y: node.position.y
        })
      }

      return {
        pointerId,
        nodeIds,
        originPositions,
        screenDelta: { x: 0, y: 0 },
        startClientPoint
      }
    },
    [doc]
  )

  const nudgeSelectionByCanvasDelta = useCallback(
    (nodeIds: string[], delta: Point): boolean => {
      if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const selectedNodes = nodeIds
        .map((id) => objects.get(id))
        .filter((node): node is CanvasNode => node !== undefined)
      const updates = getUnlockedSelection(selectedNodes).map((node) => ({
        id: node.id,
        position: {
          x: Math.round(node.position.x + delta.x),
          y: Math.round(node.position.y + delta.y)
        }
      }))

      return applySelectionPositionUpdates(updates)
    },
    [applySelectionPositionUpdates, doc]
  )

  const resizeNodeByScreenDelta = useCallback(
    (nodeId: string, handle: ResizeHandle, delta: Point): boolean => {
      if (delta.x === 0 && delta.y === 0) {
        return false
      }

      const node = getCanvasObjectsMap<CanvasNode>(doc).get(nodeId)
      if (!node || node.locked) {
        return false
      }

      return applyPositionUpdates([
        createResizeUpdate(
          node,
          handle,
          {
            x: delta.x / viewport.zoom,
            y: delta.y / viewport.zoom
          },
          {
            preserveAspectRatio: shouldPreserveResizeAspectRatio(node, handle)
          }
        )
      ])
    },
    [applyPositionUpdates, doc, viewport.zoom]
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
      duplicateSelection,
      deleteSelection,
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
      deleteSelection,
      distributeSelection,
      duplicateSelection,
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
          x1: sourceRect.x + getDragPreviewDeltaForConnectorEndpoint(connector.source.objectId).x,
          y1: sourceRect.y + getDragPreviewDeltaForConnectorEndpoint(connector.source.objectId).y,
          x2: targetRect.x + getDragPreviewDeltaForConnectorEndpoint(connector.target.objectId).x,
          y2: targetRect.y + getDragPreviewDeltaForConnectorEndpoint(connector.target.objectId).y
        }
      })
      .filter((line) => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite))
  }, [getDragPreviewDeltaForConnectorEndpoint, scene.connectors, viewport, viewportSize])

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
        nodeDragRef.current = createNodeDragState(event.pointerId, dragNodeIds, {
          x: event.clientX,
          y: event.clientY
        })
        setDragPreview(null)
        containerRef.current?.setPointerCapture?.(event.pointerId)
      }
    },
    [createNodeDragState, selectedNodeIds]
  )

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, objectId: string, handle: ResizeHandle) => {
      if (!isPrimaryPointerButton(event)) {
        return
      }

      const node = getCanvasObjectsMap<CanvasNode>(doc).get(objectId)
      if (!node || node.locked) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setFocusedNodeId(objectId)
      setSelectedNodeIds(new Set([objectId]))
      nodeResizeRef.current = {
        pointerId: event.pointerId,
        lastClientPoint: { x: event.clientX, y: event.clientY },
        nodeId: objectId,
        handle
      }
      containerRef.current?.setPointerCapture?.(event.pointerId)
      awareness?.setLocalStateField('activity', 'resizing')
    },
    [awareness, doc]
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

      const nodeResize = nodeResizeRef.current
      if (nodeResize && nodeResize.pointerId === event.pointerId) {
        const delta = {
          x: event.clientX - nodeResize.lastClientPoint.x,
          y: event.clientY - nodeResize.lastClientPoint.y
        }

        if (resizeNodeByScreenDelta(nodeResize.nodeId, nodeResize.handle, delta)) {
          awareness?.setLocalStateField('activity', 'resizing')
        }

        nodeResizeRef.current = {
          ...nodeResize,
          lastClientPoint: { x: event.clientX, y: event.clientY }
        }
        return
      }

      const nodeDrag = nodeDragRef.current
      if (nodeDrag && nodeDrag.pointerId === event.pointerId) {
        const screenDelta = {
          x: event.clientX - nodeDrag.startClientPoint.x,
          y: event.clientY - nodeDrag.startClientPoint.y
        }

        nodeDragRef.current = {
          ...nodeDrag,
          screenDelta
        }
        setDragPreview(createDragPreview(nodeDrag.nodeIds, screenDelta))
        awareness?.setLocalStateField('activity', 'dragging')
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
    [awareness, createDragPreview, resizeNodeByScreenDelta, screenToCanvasPoint, setViewportClamped]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (nodeResizeRef.current?.pointerId === event.pointerId) {
        nodeResizeRef.current = null
        awareness?.setLocalStateField('activity', presenceIntent?.activity ?? 'idle')
      }

      const nodeDrag = nodeDragRef.current
      if (nodeDrag?.pointerId === event.pointerId) {
        if (event.type !== 'pointercancel') {
          commitSelectionDragByScreenDelta(nodeDrag)
        }

        nodeDragRef.current = null
        setDragPreview(null)
        awareness?.setLocalStateField('activity', presenceIntent?.activity ?? 'idle')
      }

      if (lastPointerRef.current || event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }
      lastPointerRef.current = null
    },
    [awareness, commitSelectionDragByScreenDelta, presenceIntent?.activity]
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

      const selectedIds = Array.from(selectedNodeIds)
      const nudgeStep = event.shiftKey ? (config.gridSize ?? 20) : 1
      const nudgeDeltaByKey: Record<string, Point> = {
        arrowup: { x: 0, y: -nudgeStep },
        arrowdown: { x: 0, y: nudgeStep },
        arrowleft: { x: -nudgeStep, y: 0 },
        arrowright: { x: nudgeStep, y: 0 }
      }
      const nudgeDelta = nudgeDeltaByKey[key]

      if (mod && !event.shiftKey && selectedIds.length > 0 && key === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }

      if (!mod && selectedIds.length > 0 && (key === 'delete' || key === 'backspace')) {
        event.preventDefault()
        deleteSelection()
        return
      }

      if (!mod && selectedIds.length > 0 && nudgeDelta) {
        event.preventDefault()
        if (nudgeSelectionByCanvasDelta(selectedIds, nudgeDelta)) {
          awareness?.setLocalStateField('activity', 'moving')
        }
        return
      }

      if (selectedIds.length > 0 && key === '[') {
        event.preventDefault()
        shiftSelectionLayer('backward')
        return
      }

      if (selectedIds.length > 0 && key === ']') {
        event.preventDefault()
        shiftSelectionLayer('forward')
        return
      }

      if (mod && event.shiftKey && selectedIds.length > 0 && key === 'l') {
        event.preventDefault()
        toggleSelectionLock()
        return
      }

      if (mod && event.shiftKey && selectedIds.length === 2 && key === 'k') {
        event.preventDefault()
        connectSelection()
        return
      }

      if (mod && event.shiftKey && selectedIds.length > 0 && key === 'f') {
        event.preventDefault()
        wrapSelectionInFrame()
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
      awareness,
      clearSelection,
      config.gridSize,
      connectSelection,
      deleteSelection,
      duplicateSelection,
      fitToRect,
      nudgeSelectionByCanvasDelta,
      onCreateObject,
      onCreateSelectionComment,
      onDismissTransientUi,
      onEditSelectionAlias,
      onOpenSelection,
      onToggleShortcutHelp,
      onUndoRedoShortcut,
      scene.bounds,
      selectedNodeIds,
      setViewportClamped,
      shiftSelectionLayer,
      toggleSelectionLock,
      wrapSelectionInFrame
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
            .map((item) => {
              const previewDelta = getDragPreviewDeltaForObject(item.object.id)

              return (
                <div
                  key={item.object.id}
                  style={{
                    ...styles.vectorFallbackObject,
                    left: item.rect.x + (previewDelta?.x ?? 0),
                    top: item.rect.y + (previewDelta?.y ?? 0),
                    width: Math.max(2, item.rect.width),
                    height: Math.max(2, item.rect.height),
                    borderColor: getObjectColor(item.object.kind),
                    background: `${getObjectColor(item.object.kind)}22`
                  }}
                  data-canvas-v3-vector-fallback="true"
                  data-canvas-object-id={item.object.id}
                />
              )
            })
        : null}

      {screenObjects
        .filter((item) => domIslandIds.has(item.object.id))
        .map((item) => {
          const selected = selectedNodeIds.has(item.object.id)
          const tier = domIslandTierById.get(item.object.id) ?? 'shell-dom'
          const title = getObjectTitle(item.object)
          const previewDelta = getDragPreviewDeltaForObject(item.object.id)

          return (
            <div
              key={item.object.id}
              style={{
                ...styles.domIsland,
                left: item.rect.x + (previewDelta?.x ?? 0),
                top: item.rect.y + (previewDelta?.y ?? 0),
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
              {selected
                ? RESIZE_HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      style={getResizeHandleStyle(handle, {
                        background: theme.panelBackground,
                        border: theme.minimapViewportStroke,
                        shadow: theme.panelShadow
                      })}
                      aria-label={`Resize ${title} from ${handle}`}
                      data-canvas-v3-resize-handle={handle}
                      onPointerDown={(event) =>
                        handleResizePointerDown(event, item.object.id, handle)
                      }
                    />
                  ))
                : null}
            </div>
          )
        })}

      {selectionToolbarStyle ? (
        <div
          style={selectionToolbarStyle}
          role="toolbar"
          aria-label="Canvas selection actions"
          data-canvas-v3-selection-toolbar="true"
          data-canvas-selection-count={selectedNodes.length}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span style={{ ...styles.selectionToolbarLabel, color: theme.panelMutedText }}>
            {selectionToolbarTitle}
          </span>

          {selectedNodes.length === 1 && onOpenSelection ? (
            <CanvasSelectionToolbarButton
              action="open"
              label="Open"
              title="Open selection"
              theme={theme}
              onClick={() => onOpenSelection('peek')}
            />
          ) : null}

          {selectedNodes.length === 1 && firstSelectedNode?.sourceNodeId && onEditSelectionAlias ? (
            <CanvasSelectionToolbarButton
              action="alias"
              label="Alias"
              title="Edit selection alias"
              theme={theme}
              onClick={onEditSelectionAlias}
            />
          ) : null}

          {onCreateSelectionComment ? (
            <CanvasSelectionToolbarButton
              action="comment"
              label="Comment"
              title="Comment on selection"
              theme={theme}
              onClick={onCreateSelectionComment}
            />
          ) : null}

          <span style={{ ...styles.selectionToolbarDivider, background: theme.panelDivider }} />

          <CanvasSelectionToolbarButton
            action="duplicate"
            label="Duplicate"
            title="Duplicate selection"
            disabled={selectionLockState.allLocked}
            theme={theme}
            onClick={() => {
              duplicateSelection()
            }}
          />

          <CanvasSelectionToolbarButton
            action="lock"
            label={selectionLockState.allLocked ? 'Unlock' : 'Lock'}
            title={`${selectionLockState.allLocked ? 'Unlock' : 'Lock'} selection`}
            theme={theme}
            onClick={() => {
              toggleSelectionLock()
            }}
          />

          {selectedNodes.length === 2 ? (
            <CanvasSelectionToolbarButton
              action="connect"
              label="Connect"
              title="Connect selection"
              theme={theme}
              onClick={() => {
                connectSelection()
              }}
            />
          ) : null}

          {selectedNodes.length > 1 ? (
            <CanvasSelectionToolbarButton
              action="align-left"
              label="Align"
              title="Align selection left"
              theme={theme}
              onClick={() => {
                alignSelection('left')
              }}
            />
          ) : null}

          {selectedNodes.length > 2 ? (
            <CanvasSelectionToolbarButton
              action="distribute-horizontal"
              label="Distribute"
              title="Distribute selection horizontally"
              theme={theme}
              onClick={() => {
                distributeSelection('horizontal')
              }}
            />
          ) : null}

          {selectedNodes.length > 1 ? (
            <CanvasSelectionToolbarButton
              action="tidy"
              label="Tidy"
              title="Tidy selection"
              theme={theme}
              onClick={() => {
                tidySelection()
              }}
            />
          ) : null}

          <CanvasSelectionToolbarButton
            action="frame"
            label="Frame"
            title="Wrap selection in frame"
            theme={theme}
            onClick={() => {
              wrapSelectionInFrame()
            }}
          />

          <CanvasSelectionToolbarButton
            action="send-backward"
            label="Back"
            title="Send selection backward"
            theme={theme}
            onClick={() => {
              shiftSelectionLayer('backward')
            }}
          />

          <CanvasSelectionToolbarButton
            action="bring-forward"
            label="Forward"
            title="Bring selection forward"
            theme={theme}
            onClick={() => {
              shiftSelectionLayer('forward')
            }}
          />

          <CanvasSelectionToolbarButton
            action="delete"
            label="Delete"
            title="Delete selection"
            disabled={selectionLockState.allLocked}
            theme={theme}
            onClick={() => {
              deleteSelection()
            }}
          />

          <CanvasSelectionToolbarButton
            action="clear"
            label="Clear"
            title="Clear selection"
            theme={theme}
            onClick={clearSelection}
          />
        </div>
      ) : null}

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
  selectionToolbar: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    maxWidth: 'min(760px, calc(100% - 24px))',
    minHeight: 38,
    padding: '4px 6px',
    border: '1px solid',
    borderRadius: 999,
    pointerEvents: 'auto',
    overflowX: 'auto',
    overflowY: 'hidden',
    transform: 'translateX(-50%)',
    zIndex: 18
  },
  selectionToolbarLabel: {
    flex: '0 1 auto',
    minWidth: 0,
    maxWidth: 180,
    padding: '0 8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1
  },
  selectionToolbarDivider: {
    flex: '0 0 auto',
    width: 1,
    height: 20,
    margin: '0 2px'
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
