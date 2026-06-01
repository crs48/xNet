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
  CanvasEdgeRelationshipKind,
  CanvasLayerDirection,
  CanvasNode,
  CanvasNodeProperties,
  CanvasObjectAnchorPlacement,
  Point,
  Rect,
  ResizeHandle,
  ShapeType
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
import { getCanvasEdgePresentation } from '../edges/presentation'
import { createCanvasEdgeRelationship } from '../edges/relationships'
import {
  createCanvasSemanticEdgeDraft,
  createCanvasSemanticEdgeRelationshipForNodes
} from '../edges/source-semantics'
import {
  CANVAS_FRAME_VARIANT_DEFINITIONS,
  applyCanvasFrameVariant,
  createCanvasFrameVariantNode,
  getCanvasFrameVariant,
  type CanvasFrameVariant
} from '../frames/frame-variants'
import { createCanvasPrimitiveNode } from '../ingestion'
import { createWebGLVectorTileRenderer, type WebGLVectorTileRenderer } from '../layers'
import {
  createCanvasMindMapCollapseUpdates,
  createCanvasMindMapInheritedStyleMap,
  createCanvasMindMapVisibilityState,
  getCanvasMindMapMetadata,
  isCanvasMindMapNode,
  type CanvasMindMapBranchStyle
} from '../mind-map/branches'
import {
  CANVAS_MIND_MAP_CREATION_TOOL,
  createCanvasMindMapBranchProperties,
  createCanvasMindMapRootProperties
} from '../mind-map/creation'
import { calculateLOD } from '../nodes/CanvasNodeComponent'
import { CanvasPrimitiveNodeContent } from '../nodes/CanvasPrimitiveNodeContent'
import { createShapePath } from '../nodes/shape-node'
import {
  CANVAS_STICKY_NOTE_COLOR_PRESETS,
  createCanvasStickyNoteNode,
  isCanvasStickyNoteNode,
  promoteCanvasStickyNoteNode,
  type CanvasStickyNoteColor,
  type CanvasStickyNotePromotionTarget
} from '../notes/sticky-notes'
import { evaluateCanvasEmbedPolicy } from '../preview/embed-policy'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '../scene/doc-layout'
import { readCanvasV3MigrationSceneFromFlatDoc } from '../scene/flat-doc-v3-migration'
import { getCanvasResizePolicy } from '../selection/resize-policy'
import {
  createAlignmentUpdates,
  createClusterSelectionUpdates,
  createDistributionUpdates,
  createFrameSelectionNode,
  createGroupSelectionNode,
  createLayerShiftUpdates,
  createLockUpdates,
  createResizeUpdate,
  createStackSelectionUpdates,
  createTidySelectionUpdates,
  expandContainerPositionUpdates,
  getCanvasContainerRole,
  getSelectionBounds,
  getSelectionLockState,
  getUnlockedSelection,
  sortNodesByVisualOrder,
  type CanvasLockUpdate,
  type CanvasPositionUpdate
} from '../selection/scene-operations'
import { createCanvasSmartSnap, type CanvasSnapGuideSegment } from '../selection/snap-guides'
import { Viewport } from '../spatial'
import { createEdge, generateNodeId } from '../store'
import {
  createCanvasPlanningTemplateInstance,
  type CanvasPlanningTemplateId
} from '../templates/planning-templates'
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
  maxShellDom: 160,
  maxLiveIframes: 8
}

function getDomIslandBudgetsForZoom(zoom: number): typeof DEFAULT_DOM_BUDGETS {
  const lod = calculateLOD(zoom)

  switch (lod) {
    case 'placeholder':
      return {
        maxLiveDom: 4,
        maxShellDom: 0,
        maxLiveIframes: 0
      }
    case 'minimal':
      return {
        maxLiveDom: 8,
        maxShellDom: 48,
        maxLiveIframes: 2
      }
    case 'compact':
      return {
        maxLiveDom: 16,
        maxShellDom: 96,
        maxLiveIframes: 4
      }
    case 'full':
      return DEFAULT_DOM_BUDGETS
  }
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
  interaction?: CanvasRemoteInteraction
}

export type CanvasRemoteInteraction = {
  type: 'dragging' | 'resizing'
  nodeIds: string[]
  bounds: Rect
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
  clusterSelection: () => boolean
  stackSelection: () => boolean
  shiftSelectionLayer: (direction: CanvasLayerDirection) => boolean
  groupSelection: () => boolean
  wrapSelectionInFrame: () => boolean
  convertSelectionToMindMap: () => boolean
  connectSelection: () => boolean
  duplicateSelection: () => boolean
  deleteSelection: () => boolean
  createShape: (shapeType?: ShapeType) => boolean
  createFrame: () => boolean
  createMindMap: () => boolean
  createPlanningTemplate: (templateId: CanvasPlanningTemplateId) => boolean
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
  onCreateObject?: (kind: 'page' | 'database' | 'note' | 'shape' | 'frame' | 'mind-map') => void
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
  nodeIds: string[]
  originNodes: ReadonlyMap<string, CanvasNode>
  screenDelta: Point
  startClientPoint: Point
  handle: ResizeHandle
  viewportZoom: number
}

type DragPreviewState = {
  nodeIds: ReadonlySet<string>
  screenDelta: Point
}

type ResizePreviewState = {
  nodeIds: ReadonlySet<string>
  rects: ReadonlyMap<string, Rect>
}

type SelectionPopover =
  | 'dimensions'
  | 'shape-style'
  | 'sticky-note'
  | 'frame-variant'
  | 'media-fit'
  | 'pdf-page'
  | 'edge-type'
  | 'references'
  | 'source-bulk'
  | 'plugin-fields'

type DimensionField = 'x' | 'y' | 'width' | 'height'
type CanvasMediaFit = 'contain' | 'cover' | 'fill'
type CanvasNodePropertiesUpdate = {
  id: string
  properties: CanvasNodeProperties
}
type ConnectorHandlePlacement = Extract<
  CanvasObjectAnchorPlacement,
  'top' | 'right' | 'bottom' | 'left'
>

type ConnectorStart = {
  nodeId: string
  placement: ConnectorHandlePlacement
}

type CanvasSelectionCapabilities = {
  canOpen: boolean
  canEditAlias: boolean
  canComment: boolean
  canEditDimensions: boolean
  canEditShapeStyle: boolean
  canEditStickyNote: boolean
  canEditFrameVariant: boolean
  canEditMediaFit: boolean
  canInspectPdfPage: boolean
  canEditEdgeType: boolean
  canInspectReferences: boolean
  canInspectSourceBulk: boolean
  canInspectPluginFields: boolean
  canToggleMindMapCollapse: boolean
  canDuplicate: boolean
  canToggleLock: boolean
  canConnect: boolean
  canAlign: boolean
  canDistribute: boolean
  canTidy: boolean
  canCluster: boolean
  canStack: boolean
  canGroup: boolean
  canWrapInFrame: boolean
  canConvertToMindMap: boolean
  canShiftLayer: boolean
  canDelete: boolean
  canClear: boolean
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
const CONNECTOR_HANDLE_PLACEMENTS: ConnectorHandlePlacement[] = ['top', 'right', 'bottom', 'left']

const DIMENSION_FIELDS: DimensionField[] = ['x', 'y', 'width', 'height']
const DIMENSION_LABELS: Record<DimensionField, string> = {
  x: 'X',
  y: 'Y',
  width: 'Width',
  height: 'Height'
}
const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangle: 'Rectangle',
  'rounded-rectangle': 'Rounded Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Diamond',
  triangle: 'Triangle',
  hexagon: 'Hexagon',
  star: 'Star',
  arrow: 'Arrow',
  cylinder: 'Cylinder',
  cloud: 'Cloud'
}
const SHAPE_VARIANTS: readonly ShapeType[] = [
  'rectangle',
  'rounded-rectangle',
  'ellipse',
  'diamond',
  'triangle',
  'hexagon',
  'star',
  'arrow',
  'cylinder',
  'cloud'
]
const SHAPE_STYLE_SWATCHES = [
  { label: 'Sky', fill: '#e0f2fe', stroke: '#0284c7', labelColor: '#0f172a' },
  { label: 'Emerald', fill: '#dcfce7', stroke: '#16a34a', labelColor: '#052e16' },
  { label: 'Amber', fill: '#fef3c7', stroke: '#d97706', labelColor: '#451a03' },
  { label: 'Rose', fill: '#ffe4e6', stroke: '#e11d48', labelColor: '#4c0519' },
  { label: 'Violet', fill: '#ede9fe', stroke: '#7c3aed', labelColor: '#2e1065' },
  { label: 'Slate', fill: '#f8fafc', stroke: '#475569', labelColor: '#0f172a' }
] as const
const SHAPE_FILL_SWATCHES = [
  '#ffffff',
  '#e0f2fe',
  '#dcfce7',
  '#fef3c7',
  '#ffe4e6',
  '#ede9fe',
  '#f1f5f9',
  '#111827'
] as const
const SHAPE_STROKE_SWATCHES = [
  '#0f172a',
  '#0284c7',
  '#16a34a',
  '#d97706',
  '#e11d48',
  '#7c3aed',
  '#64748b',
  '#ffffff'
] as const
const SHAPE_LABEL_COLOR_SWATCHES = [
  '#0f172a',
  '#0369a1',
  '#166534',
  '#92400e',
  '#be123c',
  '#5b21b6',
  '#ffffff'
] as const
const SHAPE_STROKE_WIDTHS = [1, 2, 3, 4, 6] as const
const STICKY_NOTE_COLOR_LABELS: Record<CanvasStickyNoteColor, string> = {
  yellow: 'Yellow',
  blue: 'Blue',
  green: 'Green',
  rose: 'Rose',
  violet: 'Violet',
  slate: 'Slate'
}
const STICKY_NOTE_PROMOTION_LABELS: Record<CanvasStickyNotePromotionTarget, string> = {
  page: 'Page',
  task: 'Task',
  'database-row': 'Database row'
}
const STICKY_NOTE_PROMOTION_TARGETS: readonly CanvasStickyNotePromotionTarget[] = [
  'page',
  'task',
  'database-row'
]
const MEDIA_FIT_OPTIONS: readonly {
  fit: CanvasMediaFit
  label: string
  description: string
}[] = [
  { fit: 'contain', label: 'Fit', description: 'Show the whole asset inside the card.' },
  { fit: 'cover', label: 'Fill', description: 'Fill the card and crop overflow.' },
  { fit: 'fill', label: 'Stretch', description: 'Stretch the asset to the card bounds.' }
]
const EDGE_TYPE_OPTIONS: readonly {
  kind: CanvasEdgeRelationshipKind
  label: string
  description: string
}[] = [
  { kind: 'relates-to', label: 'Related', description: 'Loose planning relationship.' },
  { kind: 'references', label: 'References', description: 'Source cites or points at target.' },
  { kind: 'depends-on', label: 'Depends on', description: 'Source needs target first.' },
  { kind: 'blocks', label: 'Blocks', description: 'Source blocks target progress.' }
]
const MIN_SELECTION_DIMENSION_WIDTH = 96
const MIN_SELECTION_DIMENSION_HEIGHT = 72
const CANVAS_OBJECT_HIT_TARGET_PADDING = 8
const CANVAS_OBJECT_MIN_HIT_TARGET_SIZE = 36
const CANVAS_DRAG_START_THRESHOLD_PX = 3
const SMART_GUIDE_SCREEN_THRESHOLD = 8

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function snapCanvasValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

function getActiveSnapGridSize(config: CanvasConfig): number | null {
  const gridSize = config.gridSize ?? 20

  return Number.isFinite(gridSize) && gridSize > 0 ? gridSize : null
}

function getCanvasObjectHitTargetRect(rect: Rect): Rect {
  const extraWidth = Math.max(
    CANVAS_OBJECT_HIT_TARGET_PADDING * 2,
    CANVAS_OBJECT_MIN_HIT_TARGET_SIZE - rect.width
  )
  const extraHeight = Math.max(
    CANVAS_OBJECT_HIT_TARGET_PADDING * 2,
    CANVAS_OBJECT_MIN_HIT_TARGET_SIZE - rect.height
  )

  return {
    x: rect.x - extraWidth / 2,
    y: rect.y - extraHeight / 2,
    width: rect.width + extraWidth,
    height: rect.height + extraHeight
  }
}

function getObjectTitle(object: CanvasObjectRecord): string {
  return object.preview.title ?? object.kind.replace('-', ' ')
}

function getNodeTitle(node: CanvasNode, fallback: string): string {
  const title =
    typeof node.alias === 'string'
      ? node.alias
      : typeof node.properties.title === 'string'
        ? node.properties.title
        : typeof node.properties.label === 'string'
          ? node.properties.label
          : fallback

  return title.trim().length > 0 ? title : fallback
}

function getCanvasObjectKindLabel(node: CanvasNode): string {
  const containerRole = getCanvasContainerRole(node)

  if (containerRole === 'frame') return 'Frame'
  if (containerRole === 'group') return 'Group'

  switch (node.type) {
    case 'page':
      return 'Document'
    case 'database':
      return 'Database'
    case 'note':
      return 'Note'
    case 'external-reference':
      return 'Embed'
    case 'media':
      return 'Media card'
    case 'shape':
      return 'Shape'
    default:
      return node.type.replace(/-/g, ' ')
  }
}

function getCanvasObjectRoleDescription(node: CanvasNode): string {
  const containerRole = getCanvasContainerRole(node)

  if (containerRole === 'frame') return 'canvas frame'
  if (containerRole === 'group') return 'canvas group'

  switch (node.type) {
    case 'external-reference':
      return 'canvas embed'
    case 'media':
      return 'canvas media card'
    case 'shape':
      return 'canvas shape'
    default:
      return 'canvas object'
  }
}

function formatStatusLabel(status: string): string {
  return status
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function getCanvasObjectStatusLabel(node: CanvasNode): string | null {
  const status = typeof node.properties.status === 'string' ? node.properties.status.trim() : ''

  if (!status || status === 'ready') {
    return null
  }

  return formatStatusLabel(status)
}

function getCanvasObjectAccessibleLabel(input: {
  node: CanvasNode
  selected: boolean
  liveIframe: boolean
  rect: Rect
}): string {
  const { node, selected, liveIframe, rect } = input
  const title = getNodeTitle(node, getCanvasObjectKindLabel(node))
  const status = getCanvasObjectStatusLabel(node)
  const parts = [
    selected ? 'Selected' : null,
    node.locked ? 'Locked' : null,
    getCanvasObjectKindLabel(node),
    title,
    status ? `Status: ${status}` : null,
    `${Math.round(rect.width)} by ${Math.round(rect.height)}`,
    `at x ${Math.round(rect.x)}, y ${Math.round(rect.y)}`,
    selected ? 'Use arrow keys to move. Use Option+Arrow keys to resize.' : null,
    liveIframe ? 'Live embed. Press Escape to return focus to the canvas.' : null
  ]

  return parts.filter(Boolean).join(', ')
}

function hasLiveIframeSurface(node: CanvasNode): boolean {
  const embedUrl = typeof node.properties.embedUrl === 'string' ? node.properties.embedUrl : null
  const provider = typeof node.properties.provider === 'string' ? node.properties.provider : null

  return (
    node.type === 'external-reference' &&
    evaluateCanvasEmbedPolicy({
      provider,
      embedUrl
    }).allowed
  )
}

function isCanvasMediaLikeNode(node: CanvasNode | null | undefined): boolean {
  return node?.type === 'media' || node?.type === 'image' || node?.type === 'embed'
}

function isCanvasPdfNode(node: CanvasNode | null | undefined): boolean {
  if (!node) {
    return false
  }

  const mimeType = typeof node.properties.mimeType === 'string' ? node.properties.mimeType : ''
  const mediaKind = typeof node.properties.kind === 'string' ? node.properties.kind : ''

  return mimeType === 'application/pdf' || mediaKind === 'pdf' || mediaKind === 'pdf-page'
}

function isCanvasSourceBackedNode(node: CanvasNode | null | undefined): boolean {
  return Boolean(node?.sourceNodeId ?? node?.linkedNodeId)
}

function getCanvasPluginFieldEntries(node: CanvasNode | null | undefined): string[] {
  const fields = node?.properties.pluginFields

  if (!Array.isArray(fields)) {
    return []
  }

  return fields
    .map((field, index) => {
      if (typeof field === 'string') {
        return field
      }

      if (!field || typeof field !== 'object') {
        return `Field ${index + 1}`
      }

      const record = field as Record<string, unknown>
      const label = record.label ?? record.name ?? record.key ?? record.id

      return typeof label === 'string' && label.trim().length > 0
        ? label.trim()
        : `Field ${index + 1}`
    })
    .filter((field) => field.length > 0)
}

function hasCanvasPluginMetadata(node: CanvasNode | null | undefined): boolean {
  if (!node) {
    return false
  }

  return (
    getCanvasPluginFieldEntries(node).length > 0 ||
    typeof node.properties.pluginId === 'string' ||
    typeof node.properties.pluginContributionId === 'string'
  )
}

type CanvasPluginFallbackState = 'disabled' | 'missing' | 'unavailable'

function getCanvasPluginFallbackState(node: CanvasNode): CanvasPluginFallbackState | null {
  if (!hasCanvasPluginMetadata(node)) {
    return null
  }

  if (node.properties.pluginEnabled === false || node.properties.pluginStatus === 'disabled') {
    return 'disabled'
  }

  if (node.properties.pluginMissing === true || node.properties.pluginStatus === 'missing') {
    return 'missing'
  }

  return 'unavailable'
}

function getCanvasPluginFallbackLabel(node: CanvasNode): string {
  const fallbackLabel =
    typeof node.properties.pluginFallbackLabel === 'string'
      ? node.properties.pluginFallbackLabel
      : typeof node.properties.fallbackLabel === 'string'
        ? node.properties.fallbackLabel
        : null

  return fallbackLabel?.trim() || getNodeTitle(node, 'Plugin card')
}

function getCanvasPluginStateLabel(state: CanvasPluginFallbackState): string {
  switch (state) {
    case 'disabled':
      return 'Plugin disabled'
    case 'missing':
      return 'Plugin missing'
    case 'unavailable':
    default:
      return 'Plugin unavailable'
  }
}

function countSourceBackedNodes(nodes: readonly CanvasNode[]): number {
  return nodes.filter(isCanvasSourceBackedNode).length
}

function getPositiveIntegerProperty(
  properties: CanvasNodeProperties,
  key: string,
  fallback: number
): number {
  const value = properties[key]

  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function isCanvasEdgeBetweenNodeIds(
  edge: CanvasEdge,
  firstNodeId: string,
  secondNodeId: string
): boolean {
  const [sourceId, targetId] = getCanvasEdgeNodeIds(edge)

  return (
    (sourceId === firstNodeId && targetId === secondNodeId) ||
    (sourceId === secondNodeId && targetId === firstNodeId)
  )
}

function findCanvasEdgeEntryBetweenNodes(
  connectors: Y.Map<CanvasEdge>,
  firstNodeId: string,
  secondNodeId: string
): readonly [string, CanvasEdge] | null {
  for (const entry of connectors.entries()) {
    const [edgeId, edge] = entry

    if (isCanvasEdgeBetweenNodeIds(edge, firstNodeId, secondNodeId)) {
      return [edgeId, edge]
    }
  }

  return null
}

function createSelectionCapabilities(input: {
  nodes: readonly CanvasNode[]
  hasOpenHandler: boolean
  hasAliasHandler: boolean
  hasCommentHandler: boolean
}): CanvasSelectionCapabilities {
  const selectionCount = input.nodes.length
  const unlockedCount = input.nodes.filter((node) => !node.locked).length
  const firstNode = input.nodes[0] ?? null
  const hasSelection = selectionCount > 0
  const hasUnlockedSelection = unlockedCount > 0
  const sourceBackedCount = countSourceBackedNodes(input.nodes)

  return {
    canOpen: selectionCount === 1 && input.hasOpenHandler,
    canEditAlias: selectionCount === 1 && Boolean(firstNode?.sourceNodeId) && input.hasAliasHandler,
    canComment: hasSelection && input.hasCommentHandler,
    canEditDimensions: selectionCount === 1 && hasUnlockedSelection,
    canEditShapeStyle: selectionCount === 1 && unlockedCount === 1 && firstNode?.type === 'shape',
    canEditStickyNote:
      selectionCount === 1 &&
      unlockedCount === 1 &&
      firstNode !== null &&
      isCanvasStickyNoteNode(firstNode),
    canEditFrameVariant:
      selectionCount === 1 &&
      unlockedCount === 1 &&
      firstNode !== null &&
      getCanvasContainerRole(firstNode) === 'frame',
    canEditMediaFit:
      selectionCount === 1 &&
      unlockedCount === 1 &&
      firstNode !== null &&
      isCanvasMediaLikeNode(firstNode),
    canInspectPdfPage:
      selectionCount === 1 &&
      unlockedCount === 1 &&
      firstNode !== null &&
      isCanvasPdfNode(firstNode),
    canEditEdgeType: selectionCount === 2 && unlockedCount === 2,
    canInspectReferences:
      selectionCount === 1 && firstNode !== null && isCanvasSourceBackedNode(firstNode),
    canInspectSourceBulk: sourceBackedCount > 1,
    canInspectPluginFields:
      selectionCount === 1 && firstNode !== null && hasCanvasPluginMetadata(firstNode),
    canToggleMindMapCollapse:
      selectionCount === 1 &&
      unlockedCount === 1 &&
      firstNode !== null &&
      isCanvasMindMapNode(firstNode),
    canDuplicate: hasUnlockedSelection,
    canToggleLock: hasSelection,
    canConnect: selectionCount === 2 && unlockedCount === 2,
    canAlign: selectionCount > 1 && unlockedCount > 1,
    canDistribute: selectionCount > 2 && unlockedCount > 2,
    canTidy: selectionCount > 1 && unlockedCount > 1,
    canCluster: selectionCount > 1 && unlockedCount > 1,
    canStack: selectionCount > 1 && unlockedCount > 1,
    canGroup: selectionCount > 1 && unlockedCount > 1,
    canWrapInFrame: hasUnlockedSelection,
    canConvertToMindMap: hasUnlockedSelection,
    canShiftLayer: hasUnlockedSelection,
    canDelete: hasUnlockedSelection,
    canClear: hasSelection
  }
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

function applyMindMapInheritedStyle(
  node: CanvasNode,
  style: CanvasMindMapBranchStyle | undefined
): CanvasNode {
  if (!style) {
    return node
  }

  return {
    ...node,
    properties: {
      ...node.properties,
      ...style
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

function getScreenPointForCanvasPoint(
  point: Point,
  viewport: ViewportState,
  viewportSize: Size
): Point {
  const camera = createCanvasCameraForViewport(viewport, viewportSize)

  return worldToScreenPoint(camera, createWorldPointFromCanvasPoint(point))
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

function getBoundsForRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null
  }

  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function getNodePositionRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
}

function createResizeUpdatesFromOriginals(input: {
  nodes: readonly CanvasNode[]
  handle: ResizeHandle
  screenDelta: Point
  viewportZoom: number
}): CanvasPositionUpdate[] {
  if (input.screenDelta.x === 0 && input.screenDelta.y === 0) {
    return []
  }

  const canvasDelta = {
    x: input.screenDelta.x / input.viewportZoom,
    y: input.screenDelta.y / input.viewportZoom
  }

  return input.nodes.map((node) =>
    createResizeUpdate(node, input.handle, canvasDelta, getCanvasResizePolicy(node, input.handle))
  )
}

function createResizePreviewState(input: {
  nodes: readonly CanvasNode[]
  handle: ResizeHandle
  screenDelta: Point
  viewportZoom: number
}): ResizePreviewState | null {
  const updates = createResizeUpdatesFromOriginals(input)
  if (updates.length === 0) {
    return null
  }

  const nodesById = new Map(input.nodes.map((node) => [node.id, node] as const))
  const rects = new Map<string, Rect>()

  updates.forEach((update) => {
    const node = nodesById.get(update.id)
    if (!node) {
      return
    }

    const position = {
      ...node.position,
      ...update.position
    }

    rects.set(update.id, {
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height
    })
  })

  return {
    nodeIds: new Set(updates.map((update) => update.id)),
    rects
  }
}

function getScreenLineForSnapGuide(
  guide: CanvasSnapGuideSegment,
  viewport: ViewportState,
  viewportSize: Size
): { x1: number; y1: number; x2: number; y2: number } {
  const startPoint =
    guide.orientation === 'vertical'
      ? { x: guide.position, y: guide.start }
      : { x: guide.start, y: guide.position }
  const endPoint =
    guide.orientation === 'vertical'
      ? { x: guide.position, y: guide.end }
      : { x: guide.end, y: guide.position }
  const start = getScreenPointForCanvasPoint(startPoint, viewport, viewportSize)
  const end = getScreenPointForCanvasPoint(endPoint, viewport, viewportSize)

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y
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
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    Boolean(target.closest('[role="toolbar"], [role="dialog"]')) ||
    Boolean(
      target.closest('[data-canvas-interactive="true"], [data-canvas-editing-surface="true"]')
    ) ||
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

function getConnectorHandleStyle(
  placement: ConnectorHandlePlacement,
  colors: {
    background: string
    border: string
    activeBackground: string
    activeBorder: string
    shadow: string
  },
  active: boolean
): React.CSSProperties {
  const size = 14
  const centerOffset = -size / 2
  const offset = -size / 2
  const base: React.CSSProperties = {
    position: 'absolute',
    appearance: 'none',
    width: size,
    height: size,
    padding: 0,
    borderRadius: 999,
    border: `2px solid ${active ? colors.activeBorder : colors.border}`,
    backgroundColor: active ? colors.activeBackground : colors.background,
    boxShadow: colors.shadow,
    cursor: 'crosshair',
    pointerEvents: 'auto',
    zIndex: 4
  }

  switch (placement) {
    case 'top':
      return { ...base, top: offset, left: '50%', marginLeft: centerOffset }
    case 'right':
      return { ...base, top: '50%', right: offset, marginTop: centerOffset }
    case 'bottom':
      return { ...base, bottom: offset, left: '50%', marginLeft: centerOffset }
    case 'left':
      return { ...base, top: '50%', left: offset, marginTop: centerOffset }
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

function CanvasSelectionDimensionsPopover({
  node,
  theme,
  style,
  onUpdate
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
  onUpdate: (field: DimensionField, value: number) => void
}) {
  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...style
      }}
      role="dialog"
      aria-label="Selection dimensions"
      data-canvas-v3-dimensions-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {DIMENSION_FIELDS.map((field) => (
        <label key={field} style={styles.selectionPopoverField}>
          <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>
            {DIMENSION_LABELS[field]}
          </span>
          <input
            type="number"
            value={Math.round(node.position[field])}
            aria-label={DIMENSION_LABELS[field]}
            style={{
              ...styles.selectionPopoverInput,
              color: theme.panelText,
              background: theme.surfaceBackground,
              borderColor: theme.panelBorder
            }}
            onChange={(event) => {
              const value = Number(event.currentTarget.value)

              if (Number.isFinite(value)) {
                onUpdate(field, value)
              }
            }}
          />
        </label>
      ))}
    </div>
  )
}

function readShapeStringProperty(
  node: CanvasNode,
  key: 'fill' | 'stroke' | 'label' | 'labelColor',
  fallback: string
): string {
  const value = node.properties[key]

  return typeof value === 'string' ? value : fallback
}

function readShapeStrokeWidth(node: CanvasNode): number {
  const value = node.properties.strokeWidth

  return typeof value === 'number' && Number.isFinite(value) ? value : 2
}

function readShapeType(node: CanvasNode): ShapeType {
  const value = node.properties.shapeType

  return SHAPE_VARIANTS.includes(value as ShapeType) ? (value as ShapeType) : 'rectangle'
}

function CanvasShapePopoverSection({
  label,
  theme,
  children
}: {
  label: string
  theme: CanvasThemeTokens
  children: React.ReactNode
}) {
  return (
    <section style={styles.shapePopoverSection}>
      <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>{label}</span>
      {children}
    </section>
  )
}

function CanvasSelectionShapePopover({
  node,
  theme,
  style,
  onUpdate
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
  onUpdate: (properties: CanvasNodeProperties) => void
}) {
  const fill = readShapeStringProperty(
    node,
    'fill',
    theme.mode === 'dark' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(14, 165, 233, 0.14)'
  )
  const stroke = readShapeStringProperty(
    node,
    'stroke',
    theme.mode === 'dark' ? 'rgba(125, 211, 252, 0.92)' : 'rgba(2, 132, 199, 0.82)'
  )
  const label = readShapeStringProperty(
    node,
    'label',
    typeof node.properties.title === 'string' ? node.properties.title : ''
  )
  const labelColor = readShapeStringProperty(
    node,
    'labelColor',
    theme.mode === 'dark' ? 'rgba(241, 245, 249, 0.96)' : 'rgba(15, 23, 42, 0.9)'
  )
  const strokeWidth = readShapeStrokeWidth(node)
  const selectedShapeType = readShapeType(node)

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.shapePopover,
        ...style
      }}
      role="dialog"
      aria-label="Shape style"
      data-canvas-v3-shape-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Style" theme={theme}>
        <div style={styles.shapeSwatchGrid}>
          {SHAPE_STYLE_SWATCHES.map((preset) => (
            <button
              key={preset.label}
              type="button"
              aria-label={`${preset.label} shape style`}
              title={`${preset.label} shape style`}
              style={{
                ...styles.shapeStyleSwatch,
                background: preset.fill,
                borderColor: preset.stroke
              }}
              data-canvas-v3-shape-style-swatch={preset.label}
              onClick={() =>
                onUpdate({
                  fill: preset.fill,
                  stroke: preset.stroke,
                  labelColor: preset.labelColor
                })
              }
            />
          ))}
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Variant" theme={theme}>
        <div style={styles.shapeVariantGrid}>
          {SHAPE_VARIANTS.map((shapeType) => {
            const active = shapeType === selectedShapeType

            return (
              <button
                key={shapeType}
                type="button"
                aria-label={`${SHAPE_LABELS[shapeType]} shape`}
                title={SHAPE_LABELS[shapeType]}
                style={{
                  ...styles.shapeVariantButton,
                  color: theme.panelText,
                  background: active ? theme.minimapViewportFill : theme.surfaceBackground,
                  borderColor: active ? theme.minimapViewportStroke : theme.panelBorder
                }}
                data-canvas-v3-shape-variant={shapeType}
                data-active={active ? 'true' : 'false'}
                onClick={() =>
                  onUpdate({
                    shapeType,
                    title:
                      typeof node.properties.title === 'string'
                        ? node.properties.title
                        : SHAPE_LABELS[shapeType]
                  })
                }
              >
                <svg width="32" height="24" viewBox="0 0 32 24" aria-hidden="true">
                  <path
                    d={createShapePath(shapeType, 26, 18, 5)}
                    transform="translate(3 3)"
                    fill={fill}
                    stroke={stroke}
                    strokeWidth="1.5"
                  />
                </svg>
              </button>
            )
          })}
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Fill" theme={theme}>
        <div style={styles.shapeSwatchGrid}>
          {SHAPE_FILL_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Fill ${color}`}
              title={`Fill ${color}`}
              style={{
                ...styles.shapeColorSwatch,
                background: color,
                borderColor: fill === color ? theme.minimapViewportStroke : theme.panelBorder
              }}
              data-canvas-v3-shape-fill={color}
              onClick={() => onUpdate({ fill: color })}
            />
          ))}
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Stroke" theme={theme}>
        <div style={styles.shapeSwatchGrid}>
          {SHAPE_STROKE_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Stroke ${color}`}
              title={`Stroke ${color}`}
              style={{
                ...styles.shapeColorSwatch,
                background: color,
                borderColor: stroke === color ? theme.minimapViewportStroke : theme.panelBorder
              }}
              data-canvas-v3-shape-stroke={color}
              onClick={() => onUpdate({ stroke: color })}
            />
          ))}
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Width" theme={theme}>
        <div style={styles.shapeStrokeWidthGrid}>
          {SHAPE_STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              aria-label={`Stroke width ${width}`}
              title={`Stroke width ${width}`}
              style={{
                ...styles.shapeStrokeWidthButton,
                color: theme.panelText,
                background:
                  width === strokeWidth ? theme.minimapViewportFill : theme.surfaceBackground,
                borderColor: width === strokeWidth ? theme.minimapViewportStroke : theme.panelBorder
              }}
              data-canvas-v3-shape-stroke-width={width}
              onClick={() => onUpdate({ strokeWidth: width })}
            >
              {width}
            </button>
          ))}
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Text" theme={theme}>
        <input
          type="text"
          value={label}
          aria-label="Shape label"
          style={{
            ...styles.selectionPopoverInput,
            color: theme.panelText,
            background: theme.surfaceBackground,
            borderColor: theme.panelBorder
          }}
          onChange={(event) =>
            onUpdate({
              label: event.currentTarget.value,
              title: event.currentTarget.value
            })
          }
        />
        <div style={styles.shapeSwatchGrid}>
          {SHAPE_LABEL_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Text ${color}`}
              title={`Text ${color}`}
              style={{
                ...styles.shapeColorSwatch,
                background: color,
                borderColor: labelColor === color ? theme.minimapViewportStroke : theme.panelBorder
              }}
              data-canvas-v3-shape-label-color={color}
              onClick={() => onUpdate({ labelColor: color })}
            />
          ))}
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionStickyNotePopover({
  node,
  theme,
  style,
  onUpdate,
  onPromote
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
  onUpdate: (properties: CanvasNodeProperties) => void
  onPromote: (target: CanvasStickyNotePromotionTarget) => void
}) {
  const title = typeof node.properties.title === 'string' ? node.properties.title : 'Sticky note'
  const body = typeof node.properties.body === 'string' ? node.properties.body : ''
  const selectedColor =
    typeof node.properties.stickyNoteColor === 'string' &&
    node.properties.stickyNoteColor in CANVAS_STICKY_NOTE_COLOR_PRESETS
      ? (node.properties.stickyNoteColor as CanvasStickyNoteColor)
      : 'yellow'

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.stickyNotePopover,
        ...style
      }}
      role="dialog"
      aria-label="Sticky note"
      data-canvas-v3-sticky-note-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Color" theme={theme}>
        <div style={styles.shapeSwatchGrid}>
          {Object.entries(CANVAS_STICKY_NOTE_COLOR_PRESETS).map(([color, preset]) => {
            const active = color === selectedColor

            return (
              <button
                key={color}
                type="button"
                aria-label={`${STICKY_NOTE_COLOR_LABELS[color as CanvasStickyNoteColor]} sticky color`}
                title={`${STICKY_NOTE_COLOR_LABELS[color as CanvasStickyNoteColor]} sticky color`}
                style={{
                  ...styles.shapeStyleSwatch,
                  background: preset.fill,
                  borderColor: active ? theme.minimapViewportStroke : preset.stroke
                }}
                data-canvas-v3-sticky-color={color}
                data-active={active ? 'true' : 'false'}
                onClick={() =>
                  onUpdate({
                    stickyNoteColor: color,
                    fill: preset.fill,
                    stroke: preset.stroke,
                    labelColor: preset.labelColor
                  })
                }
              />
            )
          })}
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Text" theme={theme}>
        <input
          type="text"
          value={title}
          aria-label="Sticky note title"
          style={{
            ...styles.selectionPopoverInput,
            color: theme.panelText,
            background: theme.surfaceBackground,
            borderColor: theme.panelBorder
          }}
          onChange={(event) =>
            onUpdate({
              title: event.currentTarget.value,
              label: event.currentTarget.value
            })
          }
        />
        <textarea
          value={body}
          aria-label="Sticky note body"
          style={{
            ...styles.stickyNoteTextArea,
            color: theme.panelText,
            background: theme.surfaceBackground,
            borderColor: theme.panelBorder
          }}
          onChange={(event) => onUpdate({ body: event.currentTarget.value })}
        />
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Promote" theme={theme}>
        <div style={styles.stickyPromotionGrid}>
          {STICKY_NOTE_PROMOTION_TARGETS.map((target) => (
            <button
              key={target}
              type="button"
              aria-label={`Promote sticky note to ${STICKY_NOTE_PROMOTION_LABELS[target]}`}
              title={`Promote sticky note to ${STICKY_NOTE_PROMOTION_LABELS[target]}`}
              style={{
                ...styles.stickyPromotionButton,
                color: theme.panelText,
                background: theme.surfaceBackground,
                borderColor: theme.panelBorder
              }}
              data-canvas-v3-sticky-promote={target}
              onClick={() => onPromote(target)}
            >
              {STICKY_NOTE_PROMOTION_LABELS[target]}
            </button>
          ))}
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionFrameVariantPopover({
  node,
  theme,
  style,
  onSelect
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
  onSelect: (variant: CanvasFrameVariant) => void
}) {
  const selectedVariant = getCanvasFrameVariant(node)

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.frameVariantPopover,
        ...style
      }}
      role="dialog"
      aria-label="Frame variants"
      data-canvas-v3-frame-variant-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Frame type" theme={theme}>
        <div style={styles.frameVariantGrid}>
          {CANVAS_FRAME_VARIANT_DEFINITIONS.map((definition) => {
            const active = definition.variant === selectedVariant

            return (
              <button
                key={definition.variant}
                type="button"
                aria-label={`${definition.label} frame`}
                title={definition.description}
                style={{
                  ...styles.frameVariantButton,
                  color: theme.panelText,
                  background: active ? theme.minimapViewportFill : theme.surfaceBackground,
                  borderColor: active ? theme.minimapViewportStroke : theme.panelBorder
                }}
                data-canvas-v3-frame-variant={definition.variant}
                data-active={active ? 'true' : 'false'}
                onClick={() => onSelect(definition.variant)}
              >
                <span style={styles.frameVariantTitle}>{definition.label}</span>
                <span
                  style={{
                    ...styles.frameVariantDescription,
                    color: theme.panelMutedText
                  }}
                >
                  {definition.description}
                </span>
              </button>
            )
          })}
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionMediaFitPopover({
  node,
  theme,
  style,
  onUpdate
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
  onUpdate: (properties: CanvasNodeProperties) => void
}) {
  const selectedFit =
    node.properties.objectFit === 'cover' || node.properties.objectFit === 'fill'
      ? node.properties.objectFit
      : 'contain'
  const alt = typeof node.properties.alt === 'string' ? node.properties.alt : ''
  const caption = typeof node.properties.caption === 'string' ? node.properties.caption : ''
  const mimeType =
    typeof node.properties.mimeType === 'string' && node.properties.mimeType.trim().length > 0
      ? node.properties.mimeType
      : 'media'

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.mediaFitPopover,
        ...style
      }}
      role="dialog"
      aria-label="Media crop and fit"
      data-canvas-v3-media-fit-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Crop" theme={theme}>
        <div style={styles.popoverActionGrid}>
          {MEDIA_FIT_OPTIONS.map((option) => {
            const active = option.fit === selectedFit

            return (
              <button
                key={option.fit}
                type="button"
                aria-label={`${option.label} media`}
                title={option.description}
                style={{
                  ...styles.popoverActionButton,
                  color: theme.panelText,
                  background: active ? theme.minimapViewportFill : theme.surfaceBackground,
                  borderColor: active ? theme.minimapViewportStroke : theme.panelBorder
                }}
                data-canvas-v3-media-fit={option.fit}
                data-active={active ? 'true' : 'false'}
                onClick={() => onUpdate({ objectFit: option.fit })}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <span style={{ ...styles.popoverDescription, color: theme.panelMutedText }}>
          {mimeType}
        </span>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Alt" theme={theme}>
        <input
          type="text"
          value={alt}
          aria-label="Alt text"
          style={{
            ...styles.selectionPopoverInput,
            color: theme.panelText,
            background: theme.surfaceBackground,
            borderColor: theme.panelBorder
          }}
          onChange={(event) => onUpdate({ alt: event.currentTarget.value })}
        />
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Caption" theme={theme}>
        <textarea
          value={caption}
          aria-label="Caption"
          style={{
            ...styles.popoverTextarea,
            color: theme.panelText,
            background: theme.surfaceBackground,
            borderColor: theme.panelBorder
          }}
          onChange={(event) => onUpdate({ caption: event.currentTarget.value })}
        />
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionPdfPagePopover({
  node,
  theme,
  style,
  onUpdate
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
  onUpdate: (properties: CanvasNodeProperties) => void
}) {
  const pageCount = getPositiveIntegerProperty(node.properties, 'pageCount', 1)
  const pageNumber = clamp(
    getPositiveIntegerProperty(node.properties, 'pageNumber', 1),
    1,
    pageCount
  )
  const getPageAnchorId = (selectedPageNumber: number): string =>
    `${node.id}:page:${selectedPageNumber}`
  const pageAnchorId =
    typeof node.properties.pageAnchorId === 'string' && node.properties.pageAnchorId.length > 0
      ? node.properties.pageAnchorId
      : getPageAnchorId(pageNumber)
  const setPageNumber = (nextPageNumber: number) => {
    const clampedPageNumber = clamp(Math.round(nextPageNumber), 1, pageCount)

    onUpdate({
      pageNumber: clampedPageNumber,
      pageAnchorId: getPageAnchorId(clampedPageNumber)
    })
  }

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.pdfPagePopover,
        ...style
      }}
      role="dialog"
      aria-label="PDF page controls"
      data-canvas-v3-pdf-page-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Page" theme={theme}>
        <div style={styles.popoverActionGrid}>
          <button
            type="button"
            aria-label="Previous PDF page"
            title="Previous PDF page"
            disabled={pageNumber <= 1}
            style={{
              ...styles.popoverActionButton,
              color: pageNumber <= 1 ? theme.panelButtonDisabled : theme.panelText,
              background: theme.surfaceBackground,
              borderColor: theme.panelBorder
            }}
            onClick={() => setPageNumber(pageNumber - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            aria-label="Next PDF page"
            title="Next PDF page"
            disabled={pageNumber >= pageCount}
            style={{
              ...styles.popoverActionButton,
              color: pageNumber >= pageCount ? theme.panelButtonDisabled : theme.panelText,
              background: theme.surfaceBackground,
              borderColor: theme.panelBorder
            }}
            onClick={() => setPageNumber(pageNumber + 1)}
          >
            Next
          </button>
        </div>
      </CanvasShapePopoverSection>

      <label style={styles.selectionPopoverField}>
        <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>
          Page number
        </span>
        <input
          type="number"
          min={1}
          max={pageCount}
          value={pageNumber}
          aria-label="PDF page number"
          style={{
            ...styles.selectionPopoverInput,
            color: theme.panelText,
            background: theme.surfaceBackground,
            borderColor: theme.panelBorder
          }}
          onChange={(event) => {
            const value = Number(event.currentTarget.value)

            if (Number.isFinite(value)) {
              setPageNumber(value)
            }
          }}
        />
      </label>

      <CanvasShapePopoverSection label="Anchor" theme={theme}>
        <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>{pageAnchorId}</span>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionEdgeTypePopover({
  theme,
  style,
  currentKind,
  onSelect
}: {
  theme: CanvasThemeTokens
  style: React.CSSProperties
  currentKind: CanvasEdgeRelationshipKind | null
  onSelect: (kind: CanvasEdgeRelationshipKind) => void
}) {
  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.edgeTypePopover,
        ...style
      }}
      role="dialog"
      aria-label="Edge type"
      data-canvas-v3-edge-type-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Relationship" theme={theme}>
        <div style={styles.edgeTypeGrid}>
          {EDGE_TYPE_OPTIONS.map((option) => {
            const active = option.kind === currentKind

            return (
              <button
                key={option.kind}
                type="button"
                aria-label={`${option.label} edge`}
                title={option.description}
                style={{
                  ...styles.frameVariantButton,
                  color: theme.panelText,
                  background: active ? theme.minimapViewportFill : theme.surfaceBackground,
                  borderColor: active ? theme.minimapViewportStroke : theme.panelBorder
                }}
                data-canvas-v3-edge-type={option.kind}
                data-active={active ? 'true' : 'false'}
                onClick={() => onSelect(option.kind)}
              >
                <span style={styles.frameVariantTitle}>{option.label}</span>
                <span style={{ ...styles.frameVariantDescription, color: theme.panelMutedText }}>
                  {option.description}
                </span>
              </button>
            )
          })}
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionReferencesPopover({
  node,
  theme,
  style
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
}) {
  const sourceNodeId = node.sourceNodeId ?? node.linkedNodeId ?? 'canvas-local'
  const sourceSchemaId = node.sourceSchemaId ?? 'untyped'

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.referencesPopover,
        ...style
      }}
      role="dialog"
      aria-label="Source reference"
      data-canvas-v3-references-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Reference" theme={theme}>
        <div style={styles.popoverMetaGrid}>
          <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>Node</span>
          <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>{sourceNodeId}</span>
          <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>
            Schema
          </span>
          <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
            {sourceSchemaId}
          </span>
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionSourceBulkPopover({
  nodes,
  theme,
  style
}: {
  nodes: readonly CanvasNode[]
  theme: CanvasThemeTokens
  style: React.CSSProperties
}) {
  const sourceBackedNodes = nodes.filter(isCanvasSourceBackedNode)

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.referencesPopover,
        ...style
      }}
      role="dialog"
      aria-label="Source references"
      data-canvas-v3-source-bulk-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Selected sources" theme={theme}>
        <div style={styles.popoverList}>
          {sourceBackedNodes.map((node) => (
            <span key={node.id} style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
              {node.sourceNodeId ?? node.linkedNodeId}
            </span>
          ))}
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasSelectionPluginFieldsPopover({
  node,
  theme,
  style
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
  style: React.CSSProperties
}) {
  const fields = getCanvasPluginFieldEntries(node)
  const pluginId = typeof node.properties.pluginId === 'string' ? node.properties.pluginId : null
  const contributionId =
    typeof node.properties.pluginContributionId === 'string'
      ? node.properties.pluginContributionId
      : null

  return (
    <div
      style={{
        ...styles.selectionPopover,
        ...styles.pluginFieldsPopover,
        ...style
      }}
      role="dialog"
      aria-label="Plugin fields"
      data-canvas-v3-plugin-fields-popover="true"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <CanvasShapePopoverSection label="Plugin" theme={theme}>
        <div style={styles.popoverMetaGrid}>
          <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>ID</span>
          <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
            {pluginId ?? 'canvas-native'}
          </span>
          <span style={{ ...styles.selectionPopoverLabel, color: theme.panelMutedText }}>Card</span>
          <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
            {contributionId ?? 'default'}
          </span>
        </div>
      </CanvasShapePopoverSection>

      <CanvasShapePopoverSection label="Fields" theme={theme}>
        <div style={styles.popoverList}>
          {fields.length > 0 ? (
            fields.map((field) => (
              <span key={field} style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
                {field}
              </span>
            ))
          ) : (
            <span style={{ ...styles.popoverDescription, color: theme.panelMutedText }}>
              No custom fields advertised.
            </span>
          )}
        </div>
      </CanvasShapePopoverSection>
    </div>
  )
}

function CanvasPluginFallbackContent({
  node,
  theme
}: {
  node: CanvasNode
  theme: CanvasThemeTokens
}) {
  const state = getCanvasPluginFallbackState(node)
  const pluginId = typeof node.properties.pluginId === 'string' ? node.properties.pluginId : null
  const contributionId =
    typeof node.properties.pluginContributionId === 'string'
      ? node.properties.pluginContributionId
      : null
  const fields = getCanvasPluginFieldEntries(node)

  if (!state) {
    return null
  }

  return (
    <div
      style={{
        ...styles.pluginFallbackContent,
        borderColor: theme.panelBorder,
        background: theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)',
        color: theme.panelText
      }}
      data-canvas-v3-plugin-fallback="true"
      data-canvas-plugin-state={state}
      data-canvas-plugin-id={pluginId ?? undefined}
      data-canvas-plugin-contribution-id={contributionId ?? undefined}
    >
      <div style={styles.pluginFallbackHeader}>
        <span
          style={{
            ...styles.pluginFallbackState,
            color: theme.panelMutedText,
            background: theme.minimapViewportFill,
            borderColor: theme.panelBorder
          }}
        >
          {getCanvasPluginStateLabel(state)}
        </span>
        <span style={{ ...styles.pluginFallbackTitle, color: theme.panelText }}>
          {getCanvasPluginFallbackLabel(node)}
        </span>
      </div>

      <div style={styles.pluginFallbackMeta}>
        <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
          {pluginId ?? 'unknown-plugin'}
        </span>
        <span style={{ ...styles.popoverCodeValue, color: theme.panelText }}>
          {contributionId ?? 'default-card'}
        </span>
      </div>

      {fields.length > 0 ? (
        <div style={styles.pluginFallbackFields}>
          {fields.slice(0, 4).map((field) => (
            <span
              key={field}
              style={{
                ...styles.pluginFallbackField,
                color: theme.panelMutedText,
                borderColor: theme.panelBorder
              }}
            >
              {field}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function isFiniteRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') {
    return false
  }

  const rect = value as Partial<Rect>

  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
}

function readCanvasRemoteInteraction(value: unknown): CanvasRemoteInteraction | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const interaction = value as Partial<CanvasRemoteInteraction>
  const type = interaction.type
  const nodeIds = Array.isArray(interaction.nodeIds)
    ? interaction.nodeIds.filter((id): id is string => typeof id === 'string')
    : []

  if ((type !== 'dragging' && type !== 'resizing') || nodeIds.length === 0) {
    return undefined
  }

  if (!isFiniteRect(interaction.bounds)) {
    return undefined
  }

  return {
    type,
    nodeIds,
    bounds: interaction.bounds
  }
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
      const interaction = readCanvasRemoteInteraction(state.canvasInteraction)

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
        editingNodeId: typeof state.editingNodeId === 'string' ? state.editingNodeId : undefined,
        interaction
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
  const snapGridSize = getActiveSnapGridSize(config)
  const [viewport, setViewport] = useState<ViewportState>({
    x: initialViewport?.x ?? 0,
    y: initialViewport?.y ?? 0,
    zoom: initialViewport?.zoom ?? 1
  })
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set())
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null)
  const [resizePreview, setResizePreview] = useState<ResizePreviewState | null>(null)
  const [activeSnapGuides, setActiveSnapGuides] = useState<CanvasSnapGuideSegment[]>([])
  const [connectorStart, setConnectorStart] = useState<ConnectorStart | null>(null)
  const [activeSelectionPopover, setActiveSelectionPopover] = useState<SelectionPopover | null>(
    null
  )
  const [remoteUsers, setRemoteUsers] = useState<CanvasRemoteUser[]>(() =>
    readRemoteUsers(awareness)
  )
  const vectorLayerAvailable = useVectorTileLayer({
    containerRef: vectorLayerRef,
    summaries: scene.summaries,
    viewport,
    viewportSize
  })
  const screenObjects = useMemo<ScreenObject[]>(() => {
    const candidates = scene.objects.map((object) => ({
      object,
      node: scene.sourceNodesById.get(object.id) ?? createFallbackCanvasNode(object),
      rect: getScreenRectForObject(object, viewport, viewportSize)
    }))
    const visibility = createCanvasMindMapVisibilityState(candidates.map((item) => item.node))
    const inheritedStyles = createCanvasMindMapInheritedStyleMap(
      candidates.map((item) => item.node)
    )

    return candidates
      .filter((item) => !visibility.hiddenNodeIds.has(item.object.id))
      .map((item) => ({
        ...item,
        node: applyMindMapInheritedStyle(item.node, inheritedStyles.get(item.object.id))
      }))
      .filter((item) => intersectsViewport(item.rect, viewportSize))
  }, [scene.objects, scene.sourceNodesById, viewport, viewportSize])

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
    setConnectorStart(null)
    setActiveSnapGuides([])
  }, [])

  const selectNodes = useCallback((nodeIds: string[]) => {
    setSelectedNodeIds(new Set(nodeIds))
    setFocusedNodeId(nodeIds[0] ?? null)
    setConnectorStart(null)
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

  const applyNodePropertiesUpdates = useCallback(
    (updates: CanvasNodePropertiesUpdate[]): boolean => {
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
            properties: {
              ...node.properties,
              ...update.properties
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

  const applySelectionPositionUpdates = useCallback(
    (updates: CanvasPositionUpdate[]): boolean => {
      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const nodesById = new Map(Array.from(objects.entries()))

      return applyPositionUpdates(expandContainerPositionUpdates(nodesById, updates))
    },
    [applyPositionUpdates, doc]
  )

  const updateSelectionDimension = useCallback(
    (field: DimensionField, value: number): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (selectedNodes.length !== 1 || !node || node.locked || !Number.isFinite(value)) {
        return false
      }

      const nextValue =
        field === 'width'
          ? Math.max(MIN_SELECTION_DIMENSION_WIDTH, value)
          : field === 'height'
            ? Math.max(MIN_SELECTION_DIMENSION_HEIGHT, value)
            : value

      return applySelectionPositionUpdates([
        {
          id: node.id,
          position: {
            [field]: Math.round(nextValue)
          }
        }
      ])
    },
    [applySelectionPositionUpdates, getSelectedNodes]
  )

  const updateSelectionShapeProperties = useCallback(
    (properties: CanvasNodeProperties): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (selectedNodes.length !== 1 || !node || node.locked || node.type !== 'shape') {
        return false
      }

      return applyNodePropertiesUpdates([
        {
          id: node.id,
          properties
        }
      ])
    },
    [applyNodePropertiesUpdates, getSelectedNodes]
  )

  const updateSelectionStickyNoteProperties = useCallback(
    (properties: CanvasNodeProperties): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (selectedNodes.length !== 1 || !node || node.locked || !isCanvasStickyNoteNode(node)) {
        return false
      }

      return applyNodePropertiesUpdates([
        {
          id: node.id,
          properties
        }
      ])
    },
    [applyNodePropertiesUpdates, getSelectedNodes]
  )

  const promoteSelectionStickyNote = useCallback(
    (target: CanvasStickyNotePromotionTarget): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (selectedNodes.length !== 1 || !node || node.locked || !isCanvasStickyNoteNode(node)) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const promotedNode = promoteCanvasStickyNoteNode(node, target)

      doc.transact(() => {
        objects.set(promotedNode.id, promotedNode)
      })
      onSceneMutation?.()

      return true
    },
    [doc, getSelectedNodes, onSceneMutation]
  )

  const updateSelectionFrameVariant = useCallback(
    (variant: CanvasFrameVariant): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (
        selectedNodes.length !== 1 ||
        !node ||
        node.locked ||
        getCanvasContainerRole(node) !== 'frame'
      ) {
        return false
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const updatedNode = applyCanvasFrameVariant(node, variant)

      doc.transact(() => {
        objects.set(updatedNode.id, updatedNode)
      })
      onSceneMutation?.()

      return true
    },
    [doc, getSelectedNodes, onSceneMutation]
  )

  const updateSelectionMediaProperties = useCallback(
    (properties: CanvasNodeProperties): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (selectedNodes.length !== 1 || !node || node.locked || !isCanvasMediaLikeNode(node)) {
        return false
      }

      return applyNodePropertiesUpdates([
        {
          id: node.id,
          properties
        }
      ])
    },
    [applyNodePropertiesUpdates, getSelectedNodes]
  )

  const updateSelectionPdfProperties = useCallback(
    (properties: CanvasNodeProperties): boolean => {
      const selectedNodes = getSelectedNodes()
      const node = selectedNodes[0] ?? null

      if (selectedNodes.length !== 1 || !node || node.locked || !isCanvasPdfNode(node)) {
        return false
      }

      return applyNodePropertiesUpdates([
        {
          id: node.id,
          properties
        }
      ])
    },
    [applyNodePropertiesUpdates, getSelectedNodes]
  )

  const updateSelectionEdgeRelationship = useCallback(
    (kind: CanvasEdgeRelationshipKind): boolean => {
      const selectedNodes = getSelectedNodes()
      if (selectedNodes.length !== 2 || selectedNodes.some((node) => node.locked)) {
        return false
      }

      const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)
      const sourceNode = selectedNodes[0]
      const targetNode = selectedNodes[1]
      if (!sourceNode || !targetNode) {
        return false
      }

      const existingEdge = findCanvasEdgeEntryBetweenNodes(connectors, sourceNode.id, targetNode.id)
      const relationship = createCanvasSemanticEdgeRelationshipForNodes({
        sourceNode,
        targetNode,
        relationshipKind: kind
      })
      const newEdge = existingEdge
        ? null
        : createEdge(sourceNode.id, targetNode.id, {
            ...createCanvasSemanticEdgeDraft({
              sourceNode,
              targetNode,
              relationshipKind: kind
            })
          })

      doc.transact(() => {
        if (existingEdge) {
          const [edgeId, edge] = existingEdge
          connectors.set(edgeId, {
            ...edge,
            relationship
          })
          return
        }

        if (newEdge) {
          connectors.set(newEdge.id, newEdge)
        }
      })
      onSceneMutation?.()

      return true
    },
    [doc, getSelectedNodes, onSceneMutation]
  )

  const toggleSelectionLock = useCallback((): boolean => {
    return applyLockUpdates(createLockUpdates(getSelectedNodes()))
  }, [applyLockUpdates, getSelectedNodes])

  const toggleMindMapBranchCollapse = useCallback((): boolean => {
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const selectedNodes = getSelectedNodes()
    const selectedNode = selectedNodes[0] ?? null
    if (selectedNodes.length !== 1 || !selectedNode || selectedNode.locked) {
      return false
    }

    return applyNodePropertiesUpdates(
      createCanvasMindMapCollapseUpdates(Array.from(objects.values()), selectedNode.id)
    )
  }, [applyNodePropertiesUpdates, doc, getSelectedNodes])

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

  const clusterSelection = useCallback((): boolean => {
    return applySelectionPositionUpdates(
      createClusterSelectionUpdates(getUnlockedSelection(getSelectedNodes()))
    )
  }, [applySelectionPositionUpdates, getSelectedNodes])

  const stackSelection = useCallback((): boolean => {
    return applySelectionPositionUpdates(
      createStackSelectionUpdates(getUnlockedSelection(getSelectedNodes()))
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

    const variantFrame = applyCanvasFrameVariant(frame, 'standard')
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    doc.transact(() => {
      objects.set(variantFrame.id, variantFrame)
    })
    setSelectedNodeIds(new Set([variantFrame.id]))
    setFocusedNodeId(variantFrame.id)
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation])

  const convertSelectionToMindMap = useCallback((): boolean => {
    const selectedNodes = getUnlockedSelection(getSelectedNodes())
    if (selectedNodes.length === 0) {
      return false
    }

    const bounds = getSelectionBounds(selectedNodes)
    if (!bounds) {
      return false
    }

    const rootRect = CANVAS_MIND_MAP_CREATION_TOOL.rootRect
    const mapId = `mindmap-${generateNodeId()}`
    const rootTitle =
      selectedNodes.length === 1 ? getNodeTitle(selectedNodes[0], 'Mind map') : 'Mind map'
    const rootProperties = createCanvasMindMapRootProperties({
      title: rootTitle,
      mapId
    })
    const rootNode = createCanvasPrimitiveNode({
      objectKind: CANVAS_MIND_MAP_CREATION_TOOL.objectKind,
      viewport,
      title: rootTitle,
      canvasPoint: {
        x: bounds.x - 96 - rootRect.width / 2,
        y: bounds.y + bounds.height / 2
      },
      rect: rootRect,
      properties: rootProperties
    })
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)

    doc.transact(() => {
      objects.set(rootNode.id, rootNode)

      selectedNodes.forEach((node, index) => {
        const title = getNodeTitle(node, `Branch ${index + 1}`)
        objects.set(node.id, {
          ...node,
          type: 'shape',
          properties: {
            ...createCanvasMindMapBranchProperties({
              title,
              mapId,
              parentId: rootNode.id,
              depth: 1,
              index
            }),
            convertedFrom: {
              nodeId: node.id,
              type: node.type,
              ...(node.sourceNodeId ? { sourceNodeId: node.sourceNodeId } : {}),
              ...(node.sourceSchemaId ? { sourceSchemaId: node.sourceSchemaId } : {})
            }
          }
        })

        const connector = {
          ...createEdge(rootNode.id, node.id),
          relationship: createCanvasEdgeRelationship({
            kind: 'contains',
            label: 'Branch'
          })
        }
        connectors.set(connector.id, connector)
      })
    })
    setSelectedNodeIds(new Set([rootNode.id, ...selectedNodes.map((node) => node.id)]))
    setFocusedNodeId(rootNode.id)
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation, viewport])

  const groupSelection = useCallback((): boolean => {
    const selectedNodes = getUnlockedSelection(getSelectedNodes())
    if (selectedNodes.length < 2) {
      return false
    }

    const group = createGroupSelectionNode(selectedNodes)
    if (!group) {
      return false
    }

    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    doc.transact(() => {
      objects.set(group.id, group)
    })
    setSelectedNodeIds(new Set([group.id]))
    setFocusedNodeId(group.id)
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation])

  const createShape = useCallback(
    (shapeType: ShapeType = 'rectangle'): boolean => {
      const title = SHAPE_LABELS[shapeType]
      const object = createCanvasPrimitiveNode({
        objectKind: 'shape',
        viewport,
        title,
        properties: {
          title,
          label: title,
          shapeType
        }
      })
      const objects = getCanvasObjectsMap<CanvasNode>(doc)

      doc.transact(() => {
        objects.set(object.id, object)
      })
      setSelectedNodeIds(new Set([object.id]))
      setFocusedNodeId(object.id)
      onSceneMutation?.()

      return true
    },
    [doc, onSceneMutation, viewport]
  )

  const createFrame = useCallback((): boolean => {
    const object = createCanvasFrameVariantNode({
      variant: 'standard',
      viewport,
      title: 'Frame'
    })
    const objects = getCanvasObjectsMap<CanvasNode>(doc)

    doc.transact(() => {
      objects.set(object.id, object)
    })
    setSelectedNodeIds(new Set([object.id]))
    setFocusedNodeId(object.id)
    onSceneMutation?.()

    return true
  }, [doc, onSceneMutation, viewport])

  const createMindMap = useCallback((): boolean => {
    const properties = createCanvasMindMapRootProperties()
    const object = createCanvasPrimitiveNode({
      objectKind: CANVAS_MIND_MAP_CREATION_TOOL.objectKind,
      viewport,
      title: properties.title,
      rect: CANVAS_MIND_MAP_CREATION_TOOL.rootRect,
      properties
    })
    const objects = getCanvasObjectsMap<CanvasNode>(doc)

    doc.transact(() => {
      objects.set(object.id, object)
    })
    setSelectedNodeIds(new Set([object.id]))
    setFocusedNodeId(object.id)
    onSceneMutation?.()

    return true
  }, [doc, onSceneMutation, viewport])

  const createPlanningTemplate = useCallback(
    (templateId: CanvasPlanningTemplateId): boolean => {
      const instance = createCanvasPlanningTemplateInstance({
        templateId,
        viewport
      })
      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)

      doc.transact(() => {
        instance.nodes.forEach((node) => {
          objects.set(node.id, node)
        })
        instance.edges.forEach((edge) => {
          connectors.set(edge.id, edge)
        })
      })
      setSelectedNodeIds(new Set([instance.rootNodeId]))
      setFocusedNodeId(instance.rootNodeId)
      onSceneMutation?.()

      return true
    },
    [doc, onSceneMutation, viewport]
  )

  const createStickyNote = useCallback((): boolean => {
    const object = createCanvasStickyNoteNode({
      viewport,
      title: 'Sticky note',
      color: 'yellow'
    })
    const objects = getCanvasObjectsMap<CanvasNode>(doc)

    doc.transact(() => {
      objects.set(object.id, object)
    })
    setSelectedNodeIds(new Set([object.id]))
    setFocusedNodeId(object.id)
    onSceneMutation?.()

    return true
  }, [doc, onSceneMutation, viewport])

  const connectSelection = useCallback((): boolean => {
    const selectedNodes = getSelectedNodes()
    const sourceNode = selectedNodes[0]
    const targetNode = selectedNodes[1]

    if (selectedNodes.length !== 2 || !sourceNode || !targetNode) {
      return false
    }

    const connectors = getCanvasConnectorsMap(doc)
    const edge = createEdge(sourceNode.id, targetNode.id, {
      ...createCanvasSemanticEdgeDraft({
        sourceNode,
        targetNode
      })
    })

    doc.transact(() => {
      connectors.set(edge.id, edge)
    })
    onSceneMutation?.()

    return true
  }, [doc, getSelectedNodes, onSceneMutation])

  const connectFromHandle = useCallback(
    (nodeId: string, placement: ConnectorHandlePlacement): boolean => {
      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const node = objects.get(nodeId)

      if (!node || node.locked) {
        return false
      }

      if (!connectorStart) {
        setConnectorStart({ nodeId, placement })
        setSelectedNodeIds(new Set([nodeId]))
        setFocusedNodeId(nodeId)
        return true
      }

      if (connectorStart.nodeId === nodeId) {
        setConnectorStart({ nodeId, placement })
        return false
      }

      const sourceNode = objects.get(connectorStart.nodeId)
      if (!sourceNode || sourceNode.locked) {
        setConnectorStart({ nodeId, placement })
        setSelectedNodeIds(new Set([nodeId]))
        setFocusedNodeId(nodeId)
        return false
      }

      const connectors = getCanvasConnectorsMap(doc)
      const edge = createEdge(connectorStart.nodeId, nodeId, {
        ...createCanvasSemanticEdgeDraft({
          sourceNode,
          targetNode: node,
          sourcePlacement: connectorStart.placement,
          targetPlacement: placement
        })
      })

      doc.transact(() => {
        connectors.set(edge.id, edge)
      })
      setConnectorStart(null)
      setSelectedNodeIds(new Set([connectorStart.nodeId, nodeId]))
      setFocusedNodeId(nodeId)
      onSceneMutation?.()

      return true
    },
    [connectorStart, doc, onSceneMutation]
  )

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
  const selectedNodesForBounds = useMemo(() => {
    if (!resizePreview) {
      return selectedNodes
    }

    return selectedNodes.map((node) => {
      const rect = resizePreview.rects.get(node.id)
      return rect
        ? {
            ...node,
            position: {
              ...node.position,
              ...rect
            }
          }
        : node
    })
  }, [resizePreview, selectedNodes])
  const selectionBounds = useMemo(
    () => getSelectionBounds(selectedNodesForBounds),
    [selectedNodesForBounds]
  )
  const selectionLockState = useMemo(() => getSelectionLockState(selectedNodes), [selectedNodes])
  const selectionCapabilities = useMemo(
    () =>
      createSelectionCapabilities({
        nodes: selectedNodes,
        hasOpenHandler: Boolean(onOpenSelection),
        hasAliasHandler: Boolean(onEditSelectionAlias),
        hasCommentHandler: Boolean(onCreateSelectionComment)
      }),
    [onCreateSelectionComment, onEditSelectionAlias, onOpenSelection, selectedNodes]
  )
  const selectedNodeKey = useMemo(
    () => Array.from(selectedNodeIds).sort().join('|'),
    [selectedNodeIds]
  )

  useEffect(() => {
    setActiveSelectionPopover(null)
  }, [selectedNodeKey])

  useEffect(() => {
    if (!connectorStart) {
      return
    }

    const sourceNode = getCanvasObjectsMap<CanvasNode>(doc).get(connectorStart.nodeId)
    if (!sourceNode || sourceNode.locked) {
      setConnectorStart(null)
    }
  }, [connectorStart, doc, scene.objects])

  useEffect(() => {
    if (
      (activeSelectionPopover === 'dimensions' && !selectionCapabilities.canEditDimensions) ||
      (activeSelectionPopover === 'shape-style' && !selectionCapabilities.canEditShapeStyle) ||
      (activeSelectionPopover === 'sticky-note' && !selectionCapabilities.canEditStickyNote) ||
      (activeSelectionPopover === 'frame-variant' && !selectionCapabilities.canEditFrameVariant) ||
      (activeSelectionPopover === 'media-fit' && !selectionCapabilities.canEditMediaFit) ||
      (activeSelectionPopover === 'pdf-page' && !selectionCapabilities.canInspectPdfPage) ||
      (activeSelectionPopover === 'edge-type' && !selectionCapabilities.canEditEdgeType) ||
      (activeSelectionPopover === 'references' && !selectionCapabilities.canInspectReferences) ||
      (activeSelectionPopover === 'source-bulk' && !selectionCapabilities.canInspectSourceBulk) ||
      (activeSelectionPopover === 'plugin-fields' && !selectionCapabilities.canInspectPluginFields)
    ) {
      setActiveSelectionPopover(null)
    }
  }, [
    activeSelectionPopover,
    selectionCapabilities.canEditDimensions,
    selectionCapabilities.canEditEdgeType,
    selectionCapabilities.canEditFrameVariant,
    selectionCapabilities.canEditMediaFit,
    selectionCapabilities.canEditShapeStyle,
    selectionCapabilities.canEditStickyNote,
    selectionCapabilities.canInspectPdfPage,
    selectionCapabilities.canInspectPluginFields,
    selectionCapabilities.canInspectReferences,
    selectionCapabilities.canInspectSourceBulk
  ])

  const firstSelectedNode = selectedNodes[0] ?? null
  const selectedPairEdgeKind = useMemo<CanvasEdgeRelationshipKind | null>(() => {
    if (selectedNodes.length !== 2) {
      return null
    }

    const firstNode = selectedNodes[0]
    const secondNode = selectedNodes[1]
    if (!firstNode || !secondNode) {
      return null
    }

    const edge = findCanvasEdgeEntryBetweenNodes(
      getCanvasConnectorsMap<CanvasEdge>(doc),
      firstNode.id,
      secondNode.id
    )

    return edge?.[1].relationship?.kind ?? null
  }, [doc, scene.connectors, selectedNodes])
  const firstSelectedMindMapMetadata = firstSelectedNode
    ? getCanvasMindMapMetadata(firstSelectedNode)
    : null
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
  const selectionBoundsStyle = useMemo<React.CSSProperties | null>(() => {
    if (!selectionToolbarRect || selectedNodes.length < 2) {
      return null
    }

    return {
      ...styles.selectionBounds,
      left: selectionToolbarRect.x + (selectionToolbarPreviewDelta?.x ?? 0),
      top: selectionToolbarRect.y + (selectionToolbarPreviewDelta?.y ?? 0),
      width: Math.max(2, selectionToolbarRect.width),
      height: Math.max(2, selectionToolbarRect.height),
      borderColor: theme.minimapViewportStroke,
      boxShadow: `0 0 0 1px ${theme.minimapViewportStroke}33`
    }
  }, [
    selectedNodes.length,
    selectionToolbarPreviewDelta,
    selectionToolbarRect,
    theme.minimapViewportStroke
  ])
  const selectionPopoverStyle = useMemo<React.CSSProperties | null>(() => {
    if (!selectionToolbarRect) {
      return null
    }

    const selectionCenter = selectionToolbarRect.x + selectionToolbarRect.width / 2
    const toolbarAboveSelection = selectionToolbarRect.y >= 58
    const toolbarTop = toolbarAboveSelection
      ? selectionToolbarRect.y - 48
      : Math.min(
          viewportSize.height - 48,
          selectionToolbarRect.y + selectionToolbarRect.height + 12
        )
    const popoverTop = toolbarTop + 48

    return {
      color: theme.panelText,
      background: theme.panelBackground,
      borderColor: theme.panelBorder,
      boxShadow: theme.panelShadow,
      left: clamp(
        selectionCenter + (selectionToolbarPreviewDelta?.x ?? 0),
        180,
        Math.max(180, viewportSize.width - 180)
      ),
      top: clamp(
        popoverTop + (selectionToolbarPreviewDelta?.y ?? 0),
        58,
        Math.max(58, viewportSize.height - 102)
      )
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

  const createSnappedDragPreviewState = useCallback(
    (
      dragState: NodeDragState,
      screenDelta: Point,
      snapDisabled: boolean
    ): { screenDelta: Point; guides: CanvasSnapGuideSegment[] } => {
      if (snapDisabled) {
        return {
          screenDelta,
          guides: []
        }
      }

      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const movingIds = new Set(dragState.nodeIds)
      const movingNodes = getUnlockedSelection(
        dragState.nodeIds
          .map((id) => {
            const node = objects.get(id)
            const origin = dragState.originPositions.get(id)

            return node && origin
              ? {
                  ...node,
                  position: {
                    ...node.position,
                    x: origin.x,
                    y: origin.y
                  }
                }
              : null
          })
          .filter((node): node is CanvasNode => node !== null)
      )
      const movingBounds = getSelectionBounds(movingNodes)
      const rawCanvasDelta = {
        x: screenDelta.x / viewport.zoom,
        y: screenDelta.y / viewport.zoom
      }

      if (!movingBounds) {
        return {
          screenDelta: snapGridSize
            ? {
                x: snapCanvasValue(rawCanvasDelta.x, snapGridSize) * viewport.zoom,
                y: snapCanvasValue(rawCanvasDelta.y, snapGridSize) * viewport.zoom
              }
            : screenDelta,
          guides: []
        }
      }

      const smartSnap = createCanvasSmartSnap({
        movingBounds,
        canvasDelta: rawCanvasDelta,
        stationaryNodes: screenObjects
          .map((item) => item.node)
          .filter((node) => !movingIds.has(node.id)),
        threshold: SMART_GUIDE_SCREEN_THRESHOLD / viewport.zoom
      })
      const hasVerticalGuide = smartSnap.guides.some((guide) => guide.orientation === 'vertical')
      const hasHorizontalGuide = smartSnap.guides.some(
        (guide) => guide.orientation === 'horizontal'
      )
      const canvasDelta = {
        x: hasVerticalGuide
          ? smartSnap.canvasDelta.x
          : snapGridSize
            ? snapCanvasValue(rawCanvasDelta.x, snapGridSize)
            : rawCanvasDelta.x,
        y: hasHorizontalGuide
          ? smartSnap.canvasDelta.y
          : snapGridSize
            ? snapCanvasValue(rawCanvasDelta.y, snapGridSize)
            : rawCanvasDelta.y
      }

      return {
        screenDelta: {
          x: canvasDelta.x * viewport.zoom,
          y: canvasDelta.y * viewport.zoom
        },
        guides: smartSnap.guides
      }
    },
    [doc, screenObjects, snapGridSize, viewport.zoom]
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

  const createDragInteraction = useCallback(
    (dragState: NodeDragState): CanvasRemoteInteraction | null => {
      const objects = getCanvasObjectsMap<CanvasNode>(doc)
      const deltaCanvas = {
        x: dragState.screenDelta.x / viewport.zoom,
        y: dragState.screenDelta.y / viewport.zoom
      }
      const movingNodes = getUnlockedSelection(
        dragState.nodeIds
          .map((id) => objects.get(id))
          .filter((node): node is CanvasNode => node !== undefined)
      )
        .map((node): CanvasNode | null => {
          const origin = dragState.originPositions.get(node.id)

          if (!origin) {
            return null
          }

          return {
            ...node,
            position: {
              ...node.position,
              x: Math.round(origin.x + deltaCanvas.x),
              y: Math.round(origin.y + deltaCanvas.y)
            }
          }
        })
        .filter((node): node is CanvasNode => node !== null)
      const bounds = getSelectionBounds(movingNodes)

      if (!bounds) {
        return null
      }

      return {
        type: 'dragging',
        nodeIds: movingNodes.map((node) => node.id),
        bounds
      }
    },
    [doc, viewport.zoom]
  )

  const createResizeInteraction = useCallback(
    (
      preview: ResizePreviewState | null,
      fallbackNodes: readonly CanvasNode[] = []
    ): CanvasRemoteInteraction | null => {
      const nodeIds = preview ? Array.from(preview.nodeIds) : fallbackNodes.map((node) => node.id)
      const rects = preview
        ? Array.from(preview.rects.values())
        : fallbackNodes.map(getNodePositionRect)
      const bounds = getBoundsForRects(rects)

      if (!bounds || nodeIds.length === 0) {
        return null
      }

      return {
        type: 'resizing',
        nodeIds,
        bounds
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
  const getResizePreviewRectForObject = useCallback(
    (objectId: string): Rect | null => {
      if (!resizePreview?.nodeIds.has(objectId)) {
        return null
      }

      return resizePreview.rects.get(objectId) ?? null
    },
    [resizePreview]
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

  const resizeSelectionByKeyboardDelta = useCallback(
    (nodeIds: string[], delta: Point): boolean => {
      if (nodeIds.length === 0 || (delta.x === 0 && delta.y === 0)) {
        return false
      }

      const handle: ResizeHandle = delta.x !== 0 ? 'right' : 'bottom'
      const nodes = getUnlockedSelection(
        nodeIds
          .map((id) => getCanvasObjectsMap<CanvasNode>(doc).get(id))
          .filter((node): node is CanvasNode => node !== undefined)
      )

      if (nodes.length === 0) {
        return false
      }

      const updates = nodes.map((node) =>
        createResizeUpdate(node, handle, delta, getCanvasResizePolicy(node, handle))
      )

      return applyPositionUpdates(updates)
    },
    [applyPositionUpdates, doc]
  )

  const commitResizeState = useCallback(
    (resizeState: NodeResizeState): boolean => {
      const updates = createResizeUpdatesFromOriginals({
        nodes: Array.from(resizeState.originNodes.values()),
        handle: resizeState.handle,
        screenDelta: resizeState.screenDelta,
        viewportZoom: resizeState.viewportZoom
      })

      return applyPositionUpdates(updates)
    },
    [applyPositionUpdates]
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
      clusterSelection,
      stackSelection,
      shiftSelectionLayer,
      groupSelection,
      wrapSelectionInFrame,
      convertSelectionToMindMap,
      connectSelection,
      duplicateSelection,
      deleteSelection,
      createShape,
      createFrame,
      createMindMap,
      createPlanningTemplate,
      undo: () => onUndoRedoShortcut?.('undo') ?? false,
      redo: () => onUndoRedoShortcut?.('redo') ?? false,
      screenToCanvas: screenToCanvasPoint,
      getPerformanceStats: () => EMPTY_FRAME_STATS,
      resetPerformanceStats: () => undefined
    }),
    [
      clearSelection,
      alignSelection,
      clusterSelection,
      connectSelection,
      convertSelectionToMindMap,
      createFrame,
      createMindMap,
      createPlanningTemplate,
      createShape,
      deleteSelection,
      distributeSelection,
      duplicateSelection,
      fitToRect,
      groupSelection,
      onUndoRedoShortcut,
      scene.bounds,
      screenToCanvasPoint,
      selectNodes,
      setViewportClamped,
      shiftSelectionLayer,
      stackSelection,
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

  const islandPlan = useMemo(() => {
    return planDomIslandPool({
      candidates: screenObjects.map((item) => ({
        object: item.object,
        screenRect: item.rect,
        selected: selectedNodeIds.has(item.object.id),
        focused: focusedNodeId === item.object.id,
        editing: presenceIntent?.editingNodeId === item.object.id,
        liveIframe: hasLiveIframeSurface(item.node),
        distanceToViewportCenterPx: Math.hypot(
          item.rect.x + item.rect.width / 2 - viewportSize.width / 2,
          item.rect.y + item.rect.height / 2 - viewportSize.height / 2
        )
      })),
      budgets: getDomIslandBudgetsForZoom(viewport.zoom)
    })
  }, [
    focusedNodeId,
    presenceIntent?.editingNodeId,
    screenObjects,
    selectedNodeIds,
    viewport.zoom,
    viewportSize
  ])
  const domIslandIds = useMemo(
    () => new Set(islandPlan.assignments.map((assignment) => assignment.objectId)),
    [islandPlan.assignments]
  )
  const liveIframeObjectIds = useMemo(
    () => new Set(islandPlan.liveIframeAssignments.map((assignment) => assignment.objectId)),
    [islandPlan.liveIframeAssignments]
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
    const fullEdges = getCanvasConnectorsMap<CanvasEdge>(doc)
    const fullEdgesById = new Map(Array.from(fullEdges.values()).map((edge) => [edge.id, edge]))

    return scene.connectors
      .map((connector) => {
        const edge = fullEdgesById.get(connector.id) ?? fullEdges.get(connector.id)
        const presentation = edge ? getCanvasEdgePresentation(edge) : null
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
          y2: targetRect.y + getDragPreviewDeltaForConnectorEndpoint(connector.target.objectId).y,
          label: presentation?.label,
          stroke: presentation?.stroke ?? theme.minimapEdge,
          strokeWidth: presentation?.strokeWidth ?? 1.5,
          strokeDasharray: presentation?.strokeDasharray,
          markerEnd: presentation?.markerEnd
        }
      })
      .filter((line) => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite))
  }, [
    doc,
    getDragPreviewDeltaForConnectorEndpoint,
    scene.connectors,
    theme.minimapEdge,
    viewport,
    viewportSize
  ])
  const visibleSnapGuideLines = useMemo(() => {
    return activeSnapGuides
      .map((guide) => ({
        ...guide,
        ...getScreenLineForSnapGuide(guide, viewport, viewportSize)
      }))
      .filter((line) => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite))
  }, [activeSnapGuides, viewport, viewportSize])

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
        setActiveSnapGuides([])
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

      const candidateIds = selectedNodeIds.has(objectId) ? Array.from(selectedNodeIds) : [objectId]
      const resizeNodes = getUnlockedSelection(
        candidateIds
          .map((id) => getCanvasObjectsMap<CanvasNode>(doc).get(id))
          .filter((candidate): candidate is CanvasNode => candidate !== undefined)
      )

      if (resizeNodes.length === 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setFocusedNodeId(objectId)
      setSelectedNodeIds(new Set(candidateIds))
      setActiveSnapGuides([])
      setResizePreview(null)
      nodeResizeRef.current = {
        pointerId: event.pointerId,
        nodeIds: resizeNodes.map((resizeNode) => resizeNode.id),
        originNodes: new Map(resizeNodes.map((resizeNode) => [resizeNode.id, resizeNode] as const)),
        screenDelta: { x: 0, y: 0 },
        startClientPoint: { x: event.clientX, y: event.clientY },
        handle,
        viewportZoom: viewport.zoom
      }
      containerRef.current?.setPointerCapture?.(event.pointerId)
      awareness?.setLocalStateField('activity', 'resizing')
      const interaction = createResizeInteraction(null, resizeNodes)

      if (interaction) {
        awareness?.setLocalStateField('canvasInteraction', interaction)
      }
    },
    [awareness, createResizeInteraction, doc, selectedNodeIds, viewport.zoom]
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
        const screenDelta = {
          x: event.clientX - nodeResize.startClientPoint.x,
          y: event.clientY - nodeResize.startClientPoint.y
        }
        const resizeNodes = Array.from(nodeResize.originNodes.values())
        const preview = createResizePreviewState({
          nodes: resizeNodes,
          handle: nodeResize.handle,
          screenDelta,
          viewportZoom: nodeResize.viewportZoom
        })

        nodeResizeRef.current = {
          ...nodeResize,
          screenDelta
        }
        setResizePreview(preview)
        awareness?.setLocalStateField('activity', 'resizing')
        const interaction = createResizeInteraction(preview, resizeNodes)

        if (interaction) {
          awareness?.setLocalStateField('canvasInteraction', interaction)
        }

        return
      }

      const nodeDrag = nodeDragRef.current
      if (nodeDrag && nodeDrag.pointerId === event.pointerId) {
        const rawScreenDelta = {
          x: event.clientX - nodeDrag.startClientPoint.x,
          y: event.clientY - nodeDrag.startClientPoint.y
        }
        if (Math.hypot(rawScreenDelta.x, rawScreenDelta.y) < CANVAS_DRAG_START_THRESHOLD_PX) {
          setDragPreview(null)
          setActiveSnapGuides([])
          return
        }
        const snapPreview = createSnappedDragPreviewState(nodeDrag, rawScreenDelta, event.altKey)

        nodeDragRef.current = {
          ...nodeDrag,
          screenDelta: snapPreview.screenDelta
        }
        setDragPreview(createDragPreview(nodeDrag.nodeIds, snapPreview.screenDelta))
        setActiveSnapGuides(snapPreview.guides)
        awareness?.setLocalStateField('activity', 'dragging')
        const interaction = createDragInteraction({
          ...nodeDrag,
          screenDelta: snapPreview.screenDelta
        })

        if (interaction) {
          awareness?.setLocalStateField('canvasInteraction', interaction)
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
    [
      awareness,
      createDragInteraction,
      createDragPreview,
      createResizeInteraction,
      createSnappedDragPreviewState,
      screenToCanvasPoint,
      setViewportClamped
    ]
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (nodeResizeRef.current?.pointerId === event.pointerId) {
        if (event.type !== 'pointercancel') {
          commitResizeState(nodeResizeRef.current)
        }

        nodeResizeRef.current = null
        setResizePreview(null)
        setActiveSnapGuides([])
        awareness?.setLocalStateField('activity', presenceIntent?.activity ?? 'idle')
        awareness?.setLocalStateField('canvasInteraction', null)
      }

      const nodeDrag = nodeDragRef.current
      if (nodeDrag?.pointerId === event.pointerId) {
        if (event.type !== 'pointercancel') {
          commitSelectionDragByScreenDelta(nodeDrag)
        }

        nodeDragRef.current = null
        setDragPreview(null)
        setActiveSnapGuides([])
        awareness?.setLocalStateField('activity', presenceIntent?.activity ?? 'idle')
        awareness?.setLocalStateField('canvasInteraction', null)
      }

      if (lastPointerRef.current || event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }
      lastPointerRef.current = null
    },
    [awareness, commitResizeState, commitSelectionDragByScreenDelta, presenceIntent?.activity]
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

  const selectNextVisibleObject = useCallback(
    (reverse: boolean): boolean => {
      const ordered = sortNodesByVisualOrder(screenObjects.map((item) => item.node))

      if (ordered.length === 0) {
        return false
      }

      const anchorId = focusedNodeId ?? Array.from(selectedNodeIds)[0] ?? null
      const currentIndex = anchorId ? ordered.findIndex((node) => node.id === anchorId) : -1
      const nextIndex =
        currentIndex < 0
          ? reverse
            ? ordered.length - 1
            : 0
          : (currentIndex + (reverse ? -1 : 1) + ordered.length) % ordered.length
      const nextNode = ordered[nextIndex]

      if (!nextNode) {
        return false
      }

      setFocusedNodeId(nextNode.id)
      setSelectedNodeIds(new Set([nextNode.id]))
      return true
    },
    [focusedNodeId, screenObjects, selectedNodeIds]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isTextInputLikeElement(event.target)) {
        return
      }

      const key = event.key.toLowerCase()
      const mod = event.metaKey || event.ctrlKey

      if (!mod && key === 'tab' && selectNextVisibleObject(event.shiftKey)) {
        event.preventDefault()
        return
      }

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

      if (!mod && event.altKey && selectedIds.length > 0 && nudgeDelta) {
        event.preventDefault()
        if (resizeSelectionByKeyboardDelta(selectedIds, nudgeDelta)) {
          awareness?.setLocalStateField('activity', 'resizing')
        }
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

      if (mod && !event.shiftKey && selectedIds.length > 1 && key === 'g') {
        event.preventDefault()
        groupSelection()
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
        if (onCreateObject) {
          onCreateObject('shape')
        } else {
          createShape()
        }
        return
      }

      if (key === 'f') {
        event.preventDefault()
        if (onCreateObject) {
          onCreateObject('frame')
        } else {
          createFrame()
        }
        return
      }

      if (key === 'n') {
        event.preventDefault()
        if (onCreateObject) {
          onCreateObject('note')
        } else {
          createStickyNote()
        }
        return
      }

      if (key === 'm' && selectedNodeIds.size === 0) {
        event.preventDefault()
        if (onCreateObject) {
          onCreateObject('mind-map')
        } else {
          createMindMap()
        }
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
      createFrame,
      createMindMap,
      createShape,
      createStickyNote,
      deleteSelection,
      duplicateSelection,
      fitToRect,
      groupSelection,
      nudgeSelectionByCanvasDelta,
      onCreateObject,
      onCreateSelectionComment,
      onDismissTransientUi,
      onEditSelectionAlias,
      onOpenSelection,
      onToggleShortcutHelp,
      onUndoRedoShortcut,
      resizeSelectionByKeyboardDelta,
      scene.bounds,
      selectedNodeIds,
      selectNextVisibleObject,
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

    if (getCanvasPluginFallbackState(item.node)) {
      return <CanvasPluginFallbackContent node={item.node} theme={theme} />
    }

    if (isCanvasStickyNoteNode(item.node)) {
      const fill =
        typeof item.node.properties.fill === 'string'
          ? item.node.properties.fill
          : CANVAS_STICKY_NOTE_COLOR_PRESETS.yellow.fill
      const stroke =
        typeof item.node.properties.stroke === 'string'
          ? item.node.properties.stroke
          : CANVAS_STICKY_NOTE_COLOR_PRESETS.yellow.stroke
      const labelColor =
        typeof item.node.properties.labelColor === 'string'
          ? item.node.properties.labelColor
          : CANVAS_STICKY_NOTE_COLOR_PRESETS.yellow.labelColor
      const title =
        typeof item.node.properties.title === 'string' ? item.node.properties.title : 'Sticky note'
      const body = typeof item.node.properties.body === 'string' ? item.node.properties.body : ''

      return (
        <div
          style={{
            ...styles.stickyNoteContent,
            background: fill,
            borderColor: stroke,
            color: labelColor
          }}
          data-canvas-v3-sticky-note="true"
        >
          <span style={styles.stickyNoteTitle}>{title}</span>
          {body ? <span style={styles.stickyNoteBody}>{body}</span> : null}
        </div>
      )
    }

    if (item.node.type === 'shape' || item.node.type === 'group') {
      return <CanvasPrimitiveNodeContent node={item.node} />
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
          {getCanvasObjectStatusLabel(item.node) ? (
            <span
              style={{
                ...styles.statusBadge,
                color: theme.panelText,
                background: theme.minimapViewportFill,
                borderColor: theme.panelBorder
              }}
              data-canvas-v3-status-badge="true"
            >
              {getCanvasObjectStatusLabel(item.node)}
            </span>
          ) : null}
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
      data-canvas-theme={theme.mode}
      data-canvas-renderer-version="3"
      data-canvas-v3-surface="true"
      data-canvas-object-count={scene.objects.length}
      data-canvas-dom-live-count={islandPlan.budgets.liveUsed}
      data-canvas-dom-shell-count={islandPlan.budgets.shellUsed}
      data-canvas-dom-live-iframe-count={islandPlan.budgets.liveIframeUsed}
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

      <svg
        style={styles.edgeLayer}
        role="group"
        aria-label="Canvas connectors"
        data-canvas-v3-edge-layer="true"
      >
        <defs>
          {visibleConnectorLines
            .filter((line) => line.markerEnd === 'arrow')
            .map((line) => (
              <marker
                key={`marker:${line.id}`}
                id={`canvas-v3-edge-arrow-${line.id}`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M 0 0 L 8 4 L 0 8 z" fill={line.stroke} />
              </marker>
            ))}
        </defs>
        {visibleConnectorLines.map((line) => {
          const midX = (line.x1 + line.x2) / 2
          const midY = (line.y1 + line.y2) / 2

          const connectorAccessibleLabel = line.label
            ? `Connector label ${line.label}`
            : 'Canvas connector'

          return (
            <g
              key={line.id}
              role="img"
              aria-label={connectorAccessibleLabel}
              data-canvas-v3-edge-id={line.id}
            >
              <line
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke={line.stroke}
                strokeWidth={line.strokeWidth}
                strokeDasharray={line.strokeDasharray}
                strokeOpacity={0.72}
                markerEnd={
                  line.markerEnd === 'arrow' ? `url(#canvas-v3-edge-arrow-${line.id})` : undefined
                }
              />
              {line.label ? (
                <text
                  x={midX}
                  y={midY - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={line.stroke}
                  paintOrder="stroke"
                  stroke={theme.panelBackground}
                  strokeWidth={3}
                  data-canvas-v3-edge-label="true"
                >
                  {line.label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {visibleSnapGuideLines.length > 0 ? (
        <svg
          style={styles.snapGuideLayer}
          aria-hidden="true"
          data-canvas-v3-snap-guide-layer="true"
        >
          {visibleSnapGuideLines.map((line) => (
            <line
              key={line.id}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={theme.minimapViewportStroke}
              strokeWidth={1.5}
              strokeDasharray={line.source === 'spacing' ? '3 5' : undefined}
              strokeLinecap="round"
              data-canvas-v3-snap-guide="true"
              data-canvas-snap-guide-source={line.source}
              data-canvas-snap-guide-orientation={line.orientation}
            />
          ))}
        </svg>
      ) : null}

      {!vectorLayerAvailable
        ? screenObjects
            .filter((item) => !domIslandIds.has(item.object.id))
            .map((item) => {
              const previewDelta = getDragPreviewDeltaForObject(item.object.id)
              const resizeRect = getResizePreviewRectForObject(item.object.id)
              const renderRect = resizeRect
                ? getScreenRectForCanvasRect(resizeRect, viewport, viewportSize)
                : item.rect

              return (
                <div
                  key={item.object.id}
                  style={{
                    ...styles.vectorFallbackObject,
                    left: renderRect.x + (previewDelta?.x ?? 0),
                    top: renderRect.y + (previewDelta?.y ?? 0),
                    width: Math.max(2, renderRect.width),
                    height: Math.max(2, renderRect.height),
                    borderColor: getObjectColor(item.object.kind),
                    background: `${getObjectColor(item.object.kind)}22`
                  }}
                  data-canvas-v3-vector-fallback="true"
                  data-canvas-object-id={item.object.id}
                />
              )
            })
        : null}

      {screenObjects.map((item) => {
        const previewDelta = getDragPreviewDeltaForObject(item.object.id)
        const resizeRect = getResizePreviewRectForObject(item.object.id)
        const renderRect = resizeRect
          ? getScreenRectForCanvasRect(resizeRect, viewport, viewportSize)
          : item.rect
        const hitRect = getCanvasObjectHitTargetRect(renderRect)
        const title = getObjectTitle(item.object)
        const locked = item.node.locked === true

        return (
          <div
            key={`hit-target:${item.object.id}`}
            style={{
              ...styles.objectHitTarget,
              left: hitRect.x + (previewDelta?.x ?? 0),
              top: hitRect.y + (previewDelta?.y ?? 0),
              width: Math.max(2, hitRect.width),
              height: Math.max(2, hitRect.height),
              cursor: locked ? 'default' : 'grab'
            }}
            aria-hidden="true"
            title={title}
            data-canvas-v3-hit-target="true"
            data-canvas-object-id={item.object.id}
            data-canvas-hit-target-dom-island={domIslandIds.has(item.object.id) ? 'true' : 'false'}
            onPointerDown={(event) => handleNodePointerDown(event, item.object.id)}
            onDoubleClick={() => onNodeDoubleClick?.(item.object.id)}
          />
        )
      })}

      {screenObjects
        .filter((item) => domIslandIds.has(item.object.id))
        .map((item) => {
          const selected = selectedNodeIds.has(item.object.id)
          const tier = domIslandTierById.get(item.object.id) ?? 'shell-dom'
          const title = getObjectTitle(item.object)
          const previewDelta = getDragPreviewDeltaForObject(item.object.id)
          const resizeRect = getResizePreviewRectForObject(item.object.id)
          const renderRect = resizeRect
            ? getScreenRectForCanvasRect(resizeRect, viewport, viewportSize)
            : item.rect
          const locked = item.node.locked === true
          const liveIframe = liveIframeObjectIds.has(item.object.id)
          const showConnectorHandles = !locked && (selected || connectorStart !== null)
          const mindMapMetadata = getCanvasMindMapMetadata(item.node)
          const liveIframeDescriptionId = `canvas-v3-live-iframe-help-${item.object.id}`
          const accessibleLabel = getCanvasObjectAccessibleLabel({
            node: item.node,
            selected,
            liveIframe,
            rect: resizeRect ?? item.object.position
          })

          return (
            <div
              key={item.object.id}
              className="canvas-node canvas-node--v3"
              style={{
                ...styles.domIsland,
                left: renderRect.x + (previewDelta?.x ?? 0),
                top: renderRect.y + (previewDelta?.y ?? 0),
                width: resizeRect?.width ?? item.object.position.width,
                height: resizeRect?.height ?? item.object.position.height,
                transform: `scale(${viewport.zoom})`,
                borderColor: selected ? theme.minimapViewportStroke : theme.panelBorder,
                boxShadow: selected
                  ? `0 0 0 2px ${theme.minimapViewportStroke}`
                  : theme.panelShadow,
                background: theme.panelBackground,
                cursor: locked ? 'default' : 'grab'
              }}
              data-canvas-v3-object="true"
              data-canvas-object-id={item.object.id}
              data-node-id={item.object.id}
              data-node-type={item.node.type}
              data-canvas-dom-island-tier={tier}
              data-canvas-live-iframe={liveIframe ? 'true' : 'false'}
              data-canvas-mind-map-node={mindMapMetadata ? 'true' : undefined}
              data-canvas-mind-map-collapsed={
                mindMapMetadata ? (mindMapMetadata.collapsed ? 'true' : 'false') : undefined
              }
              data-canvas-object-locked={locked ? 'true' : 'false'}
              data-selected={selected ? 'true' : 'false'}
              role="group"
              aria-roledescription={getCanvasObjectRoleDescription(item.node)}
              aria-label={accessibleLabel}
              aria-describedby={liveIframe ? liveIframeDescriptionId : undefined}
              aria-keyshortcuts={
                selected
                  ? 'ArrowUp ArrowDown ArrowLeft ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight'
                  : undefined
              }
              tabIndex={selected || focusedNodeId === item.object.id || liveIframe ? 0 : -1}
              onPointerDown={(event) => handleNodePointerDown(event, item.object.id)}
              onDoubleClick={() => onNodeDoubleClick?.(item.object.id)}
              onKeyDown={(event) => {
                if (liveIframe && event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  setFocusedNodeId(item.object.id)
                  containerRef.current?.focus()
                }
              }}
            >
              {renderObjectContent(item, tier)}
              {liveIframe ? (
                <span id={liveIframeDescriptionId} style={styles.screenReaderOnly}>
                  Live embed mode. Press Escape to return focus to the canvas.
                </span>
              ) : null}
              {locked ? (
                <div
                  style={{
                    ...styles.lockIndicator,
                    background: theme.mode === 'dark' ? 'rgba(15, 23, 42, 0.92)' : '#ffffff',
                    borderColor: theme.panelBorder,
                    color: theme.panelMutedText,
                    boxShadow: theme.panelShadow
                  }}
                  role="img"
                  aria-label={`Locked ${title}`}
                  title={`Locked ${title}`}
                  data-canvas-v3-lock-indicator="true"
                  data-canvas-object-id={item.object.id}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <rect
                      x="2.25"
                      y="5.25"
                      width="7.5"
                      height="5"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M3.75 5.25V3.75a2.25 2.25 0 0 1 4.5 0v1.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : null}
              {showConnectorHandles
                ? CONNECTOR_HANDLE_PLACEMENTS.map((placement) => {
                    const active =
                      connectorStart?.nodeId === item.object.id &&
                      connectorStart.placement === placement
                    const pendingConnector = connectorStart !== null
                    const connectorLabel = active
                      ? `Connector start from ${title} ${placement}`
                      : pendingConnector
                        ? `Finish connector at ${title} ${placement}`
                        : `Start connector from ${title} ${placement}`

                    return (
                      <button
                        key={placement}
                        type="button"
                        style={getConnectorHandleStyle(
                          placement,
                          {
                            background: theme.panelBackground,
                            border: theme.minimapViewportStroke,
                            activeBackground: theme.minimapViewportStroke,
                            activeBorder: theme.panelBackground,
                            shadow: theme.panelShadow
                          },
                          active
                        )}
                        aria-label={connectorLabel}
                        title={connectorLabel}
                        data-canvas-v3-connector-handle={placement}
                        data-canvas-connector-active={active ? 'true' : 'false'}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          connectFromHandle(item.object.id, placement)
                        }}
                      />
                    )
                  })
                : null}
              {selected && !locked
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

      {selectionBoundsStyle ? (
        <div
          style={selectionBoundsStyle}
          aria-hidden="true"
          data-canvas-v3-selection-bounds="true"
          data-canvas-selection-count={selectedNodes.length}
        />
      ) : null}

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

          {selectionCapabilities.canOpen && onOpenSelection ? (
            <CanvasSelectionToolbarButton
              action="open"
              label="Open"
              title="Open selection"
              theme={theme}
              onClick={() => onOpenSelection('peek')}
            />
          ) : null}

          {selectionCapabilities.canEditAlias && onEditSelectionAlias ? (
            <CanvasSelectionToolbarButton
              action="alias"
              label="Alias"
              title="Edit selection alias"
              theme={theme}
              onClick={onEditSelectionAlias}
            />
          ) : null}

          {selectionCapabilities.canComment && onCreateSelectionComment ? (
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
            disabled={!selectionCapabilities.canDuplicate}
            theme={theme}
            onClick={() => {
              duplicateSelection()
            }}
          />

          <CanvasSelectionToolbarButton
            action="lock"
            label={selectionLockState.allLocked ? 'Unlock' : 'Lock'}
            title={`${selectionLockState.allLocked ? 'Unlock' : 'Lock'} selection`}
            disabled={!selectionCapabilities.canToggleLock}
            theme={theme}
            onClick={() => {
              toggleSelectionLock()
            }}
          />

          {selectionCapabilities.canEditDimensions ? (
            <CanvasSelectionToolbarButton
              action="dimensions"
              label="Size"
              title="Edit selection dimensions"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'dimensions' ? null : 'dimensions'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canEditShapeStyle ? (
            <CanvasSelectionToolbarButton
              action="shape-style"
              label="Shape"
              title="Edit shape style"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'shape-style' ? null : 'shape-style'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canEditStickyNote ? (
            <CanvasSelectionToolbarButton
              action="sticky-note"
              label="Sticky"
              title="Edit sticky note"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'sticky-note' ? null : 'sticky-note'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canEditFrameVariant ? (
            <CanvasSelectionToolbarButton
              action="frame-variant"
              label="Frame"
              title="Edit frame variant"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'frame-variant' ? null : 'frame-variant'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canEditMediaFit ? (
            <CanvasSelectionToolbarButton
              action="media-fit"
              label="Crop"
              title="Edit media crop and fit"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'media-fit' ? null : 'media-fit'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canInspectPdfPage ? (
            <CanvasSelectionToolbarButton
              action="pdf-page"
              label="PDF"
              title="Edit PDF page"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) => (current === 'pdf-page' ? null : 'pdf-page'))
              }}
            />
          ) : null}

          {selectionCapabilities.canEditEdgeType ? (
            <CanvasSelectionToolbarButton
              action="edge-type"
              label="Edge"
              title="Edit edge type"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'edge-type' ? null : 'edge-type'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canInspectReferences ? (
            <CanvasSelectionToolbarButton
              action="references"
              label="Source"
              title="Open source reference"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'references' ? null : 'references'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canInspectSourceBulk ? (
            <CanvasSelectionToolbarButton
              action="source-bulk"
              label="Sources"
              title="Open source references"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'source-bulk' ? null : 'source-bulk'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canInspectPluginFields ? (
            <CanvasSelectionToolbarButton
              action="plugin-fields"
              label="Plugin"
              title="Open plugin fields"
              theme={theme}
              onClick={() => {
                setActiveSelectionPopover((current) =>
                  current === 'plugin-fields' ? null : 'plugin-fields'
                )
              }}
            />
          ) : null}

          {selectionCapabilities.canToggleMindMapCollapse ? (
            <CanvasSelectionToolbarButton
              action="mind-map-collapse"
              label={firstSelectedMindMapMetadata?.collapsed ? 'Expand' : 'Collapse'}
              title={
                firstSelectedMindMapMetadata?.collapsed
                  ? 'Expand mind map branch'
                  : 'Collapse mind map branch'
              }
              theme={theme}
              onClick={() => {
                toggleMindMapBranchCollapse()
              }}
            />
          ) : null}

          {selectedNodes.length === 2 ? (
            <CanvasSelectionToolbarButton
              action="connect"
              label="Connect"
              title="Connect selection"
              disabled={!selectionCapabilities.canConnect}
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
              disabled={!selectionCapabilities.canAlign}
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
              disabled={!selectionCapabilities.canDistribute}
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
              disabled={!selectionCapabilities.canTidy}
              theme={theme}
              onClick={() => {
                tidySelection()
              }}
            />
          ) : null}

          {selectedNodes.length > 1 ? (
            <CanvasSelectionToolbarButton
              action="cluster"
              label="Cluster"
              title="Cluster selection"
              disabled={!selectionCapabilities.canCluster}
              theme={theme}
              onClick={() => {
                clusterSelection()
              }}
            />
          ) : null}

          {selectedNodes.length > 1 ? (
            <CanvasSelectionToolbarButton
              action="stack"
              label="Stack"
              title="Stack selection"
              disabled={!selectionCapabilities.canStack}
              theme={theme}
              onClick={() => {
                stackSelection()
              }}
            />
          ) : null}

          {selectedNodes.length > 0 ? (
            <CanvasSelectionToolbarButton
              action="convert-mind-map"
              label="Mind map"
              title="Convert selection to mind map"
              disabled={!selectionCapabilities.canConvertToMindMap}
              theme={theme}
              onClick={() => {
                convertSelectionToMindMap()
              }}
            />
          ) : null}

          {selectedNodes.length > 1 ? (
            <CanvasSelectionToolbarButton
              action="group"
              label="Group"
              title="Group selection"
              disabled={!selectionCapabilities.canGroup}
              theme={theme}
              onClick={() => {
                groupSelection()
              }}
            />
          ) : null}

          <CanvasSelectionToolbarButton
            action="frame"
            label="Frame"
            title="Wrap selection in frame"
            disabled={!selectionCapabilities.canWrapInFrame}
            theme={theme}
            onClick={() => {
              wrapSelectionInFrame()
            }}
          />

          <CanvasSelectionToolbarButton
            action="send-backward"
            label="Back"
            title="Send selection backward"
            disabled={!selectionCapabilities.canShiftLayer}
            theme={theme}
            onClick={() => {
              shiftSelectionLayer('backward')
            }}
          />

          <CanvasSelectionToolbarButton
            action="bring-forward"
            label="Forward"
            title="Bring selection forward"
            disabled={!selectionCapabilities.canShiftLayer}
            theme={theme}
            onClick={() => {
              shiftSelectionLayer('forward')
            }}
          />

          <CanvasSelectionToolbarButton
            action="delete"
            label="Delete"
            title="Delete selection"
            disabled={!selectionCapabilities.canDelete}
            theme={theme}
            onClick={() => {
              deleteSelection()
            }}
          />

          <CanvasSelectionToolbarButton
            action="clear"
            label="Clear"
            title="Clear selection"
            disabled={!selectionCapabilities.canClear}
            theme={theme}
            onClick={clearSelection}
          />
        </div>
      ) : null}

      {activeSelectionPopover === 'dimensions' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canEditDimensions ? (
        <CanvasSelectionDimensionsPopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
          onUpdate={updateSelectionDimension}
        />
      ) : null}

      {activeSelectionPopover === 'shape-style' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canEditShapeStyle ? (
        <CanvasSelectionShapePopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
          onUpdate={updateSelectionShapeProperties}
        />
      ) : null}

      {activeSelectionPopover === 'sticky-note' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canEditStickyNote ? (
        <CanvasSelectionStickyNotePopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
          onUpdate={updateSelectionStickyNoteProperties}
          onPromote={promoteSelectionStickyNote}
        />
      ) : null}

      {activeSelectionPopover === 'frame-variant' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canEditFrameVariant ? (
        <CanvasSelectionFrameVariantPopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
          onSelect={updateSelectionFrameVariant}
        />
      ) : null}

      {activeSelectionPopover === 'media-fit' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canEditMediaFit ? (
        <CanvasSelectionMediaFitPopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
          onUpdate={updateSelectionMediaProperties}
        />
      ) : null}

      {activeSelectionPopover === 'pdf-page' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canInspectPdfPage ? (
        <CanvasSelectionPdfPagePopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
          onUpdate={updateSelectionPdfProperties}
        />
      ) : null}

      {activeSelectionPopover === 'edge-type' &&
      selectionPopoverStyle &&
      selectionCapabilities.canEditEdgeType ? (
        <CanvasSelectionEdgeTypePopover
          theme={theme}
          style={selectionPopoverStyle}
          currentKind={selectedPairEdgeKind}
          onSelect={updateSelectionEdgeRelationship}
        />
      ) : null}

      {activeSelectionPopover === 'references' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canInspectReferences ? (
        <CanvasSelectionReferencesPopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
        />
      ) : null}

      {activeSelectionPopover === 'source-bulk' &&
      selectionPopoverStyle &&
      selectionCapabilities.canInspectSourceBulk ? (
        <CanvasSelectionSourceBulkPopover
          nodes={selectedNodes}
          theme={theme}
          style={selectionPopoverStyle}
        />
      ) : null}

      {activeSelectionPopover === 'plugin-fields' &&
      firstSelectedNode &&
      selectionPopoverStyle &&
      selectionCapabilities.canInspectPluginFields ? (
        <CanvasSelectionPluginFieldsPopover
          node={firstSelectedNode}
          theme={theme}
          style={selectionPopoverStyle}
        />
      ) : null}

      {remoteUsers.map((user) => {
        if (!user.interaction) {
          return null
        }

        const interactionRect = getScreenRectForCanvasRect(
          user.interaction.bounds,
          viewport,
          viewportSize
        )

        return (
          <div
            key={`${user.clientId}:interaction`}
            style={{
              ...styles.remoteInteraction,
              left: interactionRect.x,
              top: interactionRect.y,
              width: Math.max(2, interactionRect.width),
              height: Math.max(2, interactionRect.height),
              borderColor: user.color,
              boxShadow: `0 0 0 1px ${user.color}33`
            }}
            aria-hidden="true"
            data-canvas-v3-remote-interaction="true"
            data-canvas-remote-client-id={user.clientId}
            data-canvas-remote-interaction-type={user.interaction.type}
          />
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
          relationshipHints={scene.relationshipHints}
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
  snapGuideLayer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'visible',
    zIndex: 15
  },
  vectorFallbackObject: {
    position: 'absolute',
    border: '1px solid',
    borderRadius: 3,
    opacity: 0.72,
    pointerEvents: 'none'
  },
  objectHitTarget: {
    position: 'absolute',
    border: 0,
    padding: 0,
    margin: 0,
    background: 'transparent',
    pointerEvents: 'auto',
    touchAction: 'none'
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
  lockIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    border: '1px solid',
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 3
  },
  selectionBounds: {
    position: 'absolute',
    border: '1.5px dashed',
    borderRadius: 10,
    pointerEvents: 'none',
    zIndex: 16
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
  selectionPopover: {
    position: 'absolute',
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(64px, 1fr))',
    gap: 8,
    width: 'min(360px, calc(100% - 24px))',
    padding: 10,
    border: '1px solid',
    borderRadius: 8,
    pointerEvents: 'auto',
    transform: 'translateX(-50%)',
    zIndex: 19
  },
  selectionPopoverField: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  selectionPopoverLabel: {
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
    textTransform: 'uppercase'
  },
  selectionPopoverInput: {
    width: '100%',
    minWidth: 0,
    height: 28,
    boxSizing: 'border-box',
    border: '1px solid',
    borderRadius: 6,
    padding: '0 6px',
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1
  },
  shapePopover: {
    gridTemplateColumns: '1fr',
    width: 'min(420px, calc(100% - 24px))',
    gap: 12
  },
  stickyNotePopover: {
    gridTemplateColumns: '1fr',
    width: 'min(380px, calc(100% - 24px))',
    gap: 12
  },
  frameVariantPopover: {
    gridTemplateColumns: '1fr',
    width: 'min(520px, calc(100% - 24px))',
    gap: 12
  },
  mediaFitPopover: {
    gridTemplateColumns: '1fr',
    width: 'min(420px, calc(100% - 24px))',
    gap: 12
  },
  pdfPagePopover: {
    gridTemplateColumns: 'minmax(0, 1fr) 96px minmax(0, 1fr)',
    width: 'min(460px, calc(100% - 24px))',
    gap: 12
  },
  edgeTypePopover: {
    gridTemplateColumns: '1fr',
    width: 'min(560px, calc(100% - 24px))',
    gap: 12
  },
  referencesPopover: {
    gridTemplateColumns: '1fr',
    width: 'min(460px, calc(100% - 24px))',
    gap: 12
  },
  pluginFieldsPopover: {
    gridTemplateColumns: '1fr',
    width: 'min(480px, calc(100% - 24px))',
    gap: 12
  },
  shapePopoverSection: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  shapeSwatchGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(8, 28px)',
    gap: 6
  },
  shapeVariantGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(40px, 1fr))',
    gap: 6
  },
  shapeStyleSwatch: {
    width: 28,
    height: 28,
    border: '2px solid',
    borderRadius: 6,
    cursor: 'pointer'
  },
  shapeColorSwatch: {
    width: 28,
    height: 28,
    border: '2px solid',
    borderRadius: 999,
    cursor: 'pointer'
  },
  shapeVariantButton: {
    minWidth: 0,
    height: 34,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer'
  },
  shapeStrokeWidthGrid: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap'
  },
  shapeStrokeWidthButton: {
    minWidth: 32,
    height: 28,
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700
  },
  stickyNoteTextArea: {
    width: '100%',
    minWidth: 0,
    minHeight: 72,
    boxSizing: 'border-box',
    border: '1px solid',
    borderRadius: 6,
    padding: 8,
    resize: 'vertical',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.35
  },
  stickyPromotionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 6
  },
  stickyPromotionButton: {
    minWidth: 0,
    height: 30,
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap'
  },
  popoverActionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 6
  },
  popoverActionButton: {
    minWidth: 0,
    height: 30,
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap'
  },
  popoverDescription: {
    minWidth: 0,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.25
  },
  popoverTextarea: {
    width: '100%',
    minWidth: 0,
    minHeight: 64,
    boxSizing: 'border-box',
    border: '1px solid',
    borderRadius: 6,
    padding: 8,
    resize: 'vertical',
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1.35
  },
  edgeTypeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8
  },
  popoverMetaGrid: {
    display: 'grid',
    gridTemplateColumns: '72px minmax(0, 1fr)',
    gap: '8px 10px',
    alignItems: 'center'
  },
  popoverCodeValue: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.25
  },
  popoverList: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 6
  },
  frameVariantGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8
  },
  frameVariantButton: {
    minWidth: 0,
    minHeight: 74,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: 6,
    border: '1px solid',
    borderRadius: 8,
    padding: 10,
    cursor: 'pointer',
    textAlign: 'left'
  },
  frameVariantTitle: {
    minWidth: 0,
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.1
  },
  frameVariantDescription: {
    minWidth: 0,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1.25
  },
  stickyNoteContent: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    border: '1px solid',
    borderRadius: 8,
    padding: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    boxShadow: 'inset 0 -18px 28px rgba(15, 23, 42, 0.06)'
  },
  stickyNoteTitle: {
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  stickyNoteBody: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.35,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 5
  },
  pluginFallbackContent: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    border: '1px solid',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 10
  },
  pluginFallbackHeader: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  pluginFallbackState: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    padding: '3px 8px',
    border: '1px solid',
    borderRadius: 999,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 10,
    fontWeight: 800,
    lineHeight: 1.1,
    textTransform: 'uppercase'
  },
  pluginFallbackTitle: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.2
  },
  pluginFallbackMeta: {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: 5
  },
  pluginFallbackFields: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    minWidth: 0
  },
  pluginFallbackField: {
    maxWidth: '100%',
    border: '1px solid',
    borderRadius: 999,
    padding: '2px 7px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.2
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
  statusBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    padding: '2px 6px',
    border: '1px solid',
    borderRadius: 999,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1.2
  },
  screenReaderOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0
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
  },
  remoteInteraction: {
    position: 'absolute',
    border: '2px dashed',
    borderRadius: 8,
    pointerEvents: 'none',
    zIndex: 17
  }
}
