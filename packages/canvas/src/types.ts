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
 * Legacy canvas node types kept temporarily while the active app path
 * moves to Canvas V2 object kinds.
 */
export type LegacyCanvasNodeType = 'card' | 'frame' | 'image' | 'embed'

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
 * Canvas node types.
 */
export type CanvasNodeType = CanvasObjectKind | LegacyCanvasNodeType

/**
 * Shape types for shape nodes
 */
export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'line' | 'arrow'

/**
 * Canvas node as stored in Yjs
 */
export interface CanvasNode {
  id: string
  type: CanvasNodeType
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
  /** Position and dimensions */
  position: CanvasNodePosition
  /** Node-specific properties */
  properties: Record<string, unknown>
}

/**
 * Edge connection point
 */
export type EdgeAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center' | 'auto'

/**
 * Edge/connection between canvas nodes
 */
export interface CanvasEdge {
  id: string
  sourceId: string
  targetId: string
  sourceAnchor?: EdgeAnchor
  targetAnchor?: EdgeAnchor
  label?: string
  style?: EdgeStyle
}

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
