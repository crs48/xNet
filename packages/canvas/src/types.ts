/**
 * Canvas Types
 *
 * Core type definitions for the infinite canvas.
 */

/**
 * 2D point
 */
export interface Point {
  x: number
  y: number
}

/**
 * Bounding box / rectangle
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Canvas node position stored in Yjs
 */
export interface CanvasNodePosition {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  zIndex?: number
  collapsed?: boolean
}

/**
 * Canvas V2 object kinds.
 */
export type CanvasObjectKind =
  | 'page'
  | 'database'
  | 'external-reference'
  | 'media'
  | 'shape'
  | 'note'
  | 'group'

/**
 * Primary Canvas V2 scene node kinds.
 */
export type CanvasSceneNodeKind = CanvasObjectKind

/**
 * Legacy canvas node types kept only for isolated legacy components/tests.
 */
export type LegacyCanvasNodeType = 'card' | 'frame' | 'image' | 'embed'

/**
 * Canvas node types.
 *
 * Canvas V2 should prefer CanvasSceneNodeKind everywhere in the active
 * product path. Legacy node types remain only as a compatibility escape
 * hatch for isolated legacy components.
 */
export type CanvasNodeType = CanvasSceneNodeKind | LegacyCanvasNodeType

export type CanvasSourceBackedNodeKind =
  | 'page'
  | 'database'
  | 'external-reference'
  | 'media'
  | 'note'

export type CanvasDisplayDensity = 'far' | 'mid' | 'near'

export type CanvasDisplayState = {
  collapsed?: boolean
  previewDensity?: CanvasDisplayDensity
  styleVariant?: string
}

export type CanvasNodeProperties = Record<string, unknown>

export type CanvasTitledNodeProperties = CanvasNodeProperties & {
  title?: string
  subtitle?: string
  status?: string
}

export type CanvasExternalReferenceNodeProperties = CanvasTitledNodeProperties & {
  url?: string
  provider?: string
  refId?: string
}

export type CanvasMediaNodeProperties = CanvasTitledNodeProperties & {
  alt?: string
  mimeType?: string
  kind?: string
}

export type CanvasShapeNodeProperties = CanvasTitledNodeProperties & {
  shapeType?: ShapeType
}

export type CanvasGroupNodeProperties = CanvasTitledNodeProperties & {
  containerRole?: 'frame' | 'group'
  memberIds?: string[]
}

/**
 * Selection alignment operations.
 */
export type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/**
 * Selection distribution axis.
 */
export type CanvasDistributionAxis = 'horizontal' | 'vertical'

/**
 * Selection layer movement direction.
 */
export type CanvasLayerDirection = 'forward' | 'backward'

/**
 * Shape types for shape nodes
 */
export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'star'
  | 'arrow'
  | 'cylinder'
  | 'cloud'

export interface CanvasNodeBase<
  TType extends CanvasNodeType = CanvasNodeType,
  TProperties extends CanvasNodeProperties = CanvasNodeProperties
> {
  id: string
  type: TType
  /** Reference to linked xNet node (legacy field, prefer sourceNodeId) */
  linkedNodeId?: string
  /** Stable reference to the source xNet node */
  sourceNodeId?: string
  /** Stable reference to the source schema IRI */
  sourceSchemaId?: string
  /** Optional canvas-local alias for the source object */
  alias?: string
  /** Whether this object is locked against accidental edits/moves */
  locked?: boolean
  /** Canvas-local display metadata */
  display?: CanvasDisplayState
  /** Position and dimensions */
  position: CanvasNodePosition
  /** Node-specific properties */
  properties: TProperties
}

export type CanvasPageNode = CanvasNodeBase<'page', CanvasTitledNodeProperties>

export type CanvasDatabaseNode = CanvasNodeBase<'database', CanvasTitledNodeProperties>

export type CanvasExternalReferenceNode = CanvasNodeBase<
  'external-reference',
  CanvasExternalReferenceNodeProperties
>

export type CanvasMediaNode = CanvasNodeBase<'media', CanvasMediaNodeProperties>

export type CanvasNoteNode = CanvasNodeBase<'note', CanvasTitledNodeProperties>

export type CanvasShapeNode = CanvasNodeBase<'shape', CanvasShapeNodeProperties>

export type CanvasGroupNode = CanvasNodeBase<'group', CanvasGroupNodeProperties>

export type CanvasFrameNode = CanvasGroupNode & {
  properties: CanvasGroupNodeProperties & {
    containerRole: 'frame'
  }
}

export type CanvasSceneNode =
  | CanvasPageNode
  | CanvasDatabaseNode
  | CanvasExternalReferenceNode
  | CanvasMediaNode
  | CanvasNoteNode
  | CanvasShapeNode
  | CanvasGroupNode

export type CanvasSceneObject = CanvasSceneNode

export type CanvasLegacyNode = CanvasNodeBase<LegacyCanvasNodeType>

/**
 * Canvas node as stored in Yjs.
 *
 * The active Canvas V2 product path should prefer `CanvasSceneNode`.
 */
export type CanvasNode = CanvasSceneNode | CanvasLegacyNode

/**
 * Edge connection point
 */
export type EdgeAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center' | 'auto'

/**
 * Stable anchor placements for object-bound connectors and comments.
 */
export type CanvasObjectAnchorPlacement =
  | EdgeAnchor
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

/**
 * Durable connector endpoint bound to a canvas object.
 */
export interface CanvasEdgeEndpoint {
  /** Stable canvas object reference */
  objectId: string
  /** Stable anchor ID for comment/deep-link reuse */
  anchorId?: string
  /** Logical attachment placement on the object */
  placement?: CanvasObjectAnchorPlacement
  /** Optional custom normalized anchor ratios (0..1) */
  xRatio?: number
  yRatio?: number
  /** Optional pixel offset from the resolved anchor point */
  offsetX?: number
  offsetY?: number
  /** Future block/deep-link target within the source content */
  blockAnchorId?: string
}

/**
 * Edge/connection between canvas nodes
 */
export interface CanvasEdge {
  id: string
  /** Legacy mirror of source.objectId for existing runtime paths */
  sourceId: string
  /** Legacy mirror of target.objectId for existing runtime paths */
  targetId: string
  /** Legacy mirror of source.placement */
  sourceAnchor?: EdgeAnchor
  /** Legacy mirror of target.placement */
  targetAnchor?: EdgeAnchor
  /** Durable source endpoint binding */
  source?: CanvasEdgeEndpoint
  /** Durable target endpoint binding */
  target?: CanvasEdgeEndpoint
  label?: string
  style?: EdgeStyle
}

export type CanvasConnector = CanvasEdge

export type CanvasConnectorEndpoint = CanvasEdgeEndpoint

/**
 * Edge styling
 */
export interface EdgeStyle {
  stroke?: string
  strokeWidth?: number
  strokeDasharray?: string
  markerStart?: 'arrow' | 'dot' | 'none'
  markerEnd?: 'arrow' | 'dot' | 'none'
  curved?: boolean
}

/**
 * Viewport state (camera)
 */
export interface ViewportState {
  /** Center X in canvas coordinates */
  x: number
  /** Center Y in canvas coordinates */
  y: number
  /** Zoom level (1 = 100%) */
  zoom: number
}

/**
 * Selection state
 */
export interface SelectionState {
  /** Selected node IDs */
  nodeIds: Set<string>
  /** Selected edge IDs */
  edgeIds: Set<string>
}

/**
 * Drag state during interactions
 */
export interface DragState {
  type: 'none' | 'pan' | 'select' | 'move' | 'resize' | 'connect'
  startPoint?: Point
  currentPoint?: Point
  nodeIds?: string[]
  handle?: ResizeHandle
}

/**
 * Resize handle positions
 */
export type ResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

/**
 * Grid rendering type
 */
export type GridType = 'lines' | 'dots' | 'none'

/**
 * Canvas configuration
 */
export interface CanvasConfig {
  /** Minimum zoom level */
  minZoom?: number
  /** Maximum zoom level */
  maxZoom?: number
  /** Grid size for snapping (0 = no snap) */
  gridSize?: number
  /** Show grid lines */
  showGrid?: boolean
  /** Grid rendering type: 'lines', 'dots', or 'none' */
  gridType?: GridType
  /** Enable infinite canvas (vs bounded) */
  infinite?: boolean
  /** Canvas bounds if not infinite */
  bounds?: Rect
}

/**
 * Default canvas configuration
 */
export const DEFAULT_CANVAS_CONFIG: Required<CanvasConfig> = {
  minZoom: 0.1,
  maxZoom: 4,
  gridSize: 20,
  showGrid: true,
  gridType: 'dots',
  infinite: true,
  bounds: { x: 0, y: 0, width: 10000, height: 10000 }
}
