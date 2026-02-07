/**
 * @xnet/canvas - Infinite Canvas for Spatial Visualization
 *
 * Provides graph-like visualization with:
 * - Spatial indexing with R-tree (rbush)
 * - Auto-layout with ELK.js
 * - Pan/zoom with smooth performance
 * - Node rendering for documents and databases
 * - Real-time collaboration via Yjs
 *
 * @example
 * ```tsx
 * import { Canvas, createCanvasDoc } from '@xnet/canvas'
 *
 * // Create a new canvas document
 * const doc = createCanvasDoc('canvas-1', 'My Canvas')
 *
 * // Render the canvas
 * <Canvas
 *   doc={doc}
 *   config={{ showGrid: true, gridSize: 20 }}
 *   onNodeDoubleClick={(id) => console.log('Opened:', id)}
 * />
 * ```
 */

// Types
export type {
  Point,
  Rect,
  CanvasNodePosition,
  CanvasNodeType,
  ShapeType,
  CanvasNode,
  EdgeAnchor,
  CanvasEdge,
  EdgeStyle,
  ViewportState,
  SelectionState,
  DragState,
  ResizeHandle,
  CanvasConfig,
  GridType
} from './types'

export { DEFAULT_CANVAS_CONFIG } from './types'

// Rendering layers
export {
  WebGLGridLayer,
  CSSGridFallback,
  createGridLayer,
  isWebGLAvailable,
  DEFAULT_GRID_CONFIG,
  EdgeRenderer,
  createEdgeRenderer,
  type GridLayer,
  type WebGLGridConfig,
  type EdgeRendererViewport
} from './layers/index'

// Spatial indexing
export { SpatialIndex, Viewport, createSpatialIndex, createViewport } from './spatial/index'

// Layout engine
export {
  LayoutEngine,
  createLayoutEngine,
  type LayoutAlgorithm,
  type LayoutDirection,
  type LayoutConfig,
  type LayoutResult
} from './layout/index'

// Canvas store
export {
  CanvasStore,
  createCanvasStore,
  createCanvasDoc,
  generateNodeId,
  generateEdgeId,
  createNode,
  createEdge,
  type CanvasStoreEvent,
  type CanvasStoreListener
} from './store'

// React components
export { Canvas } from './renderer/Canvas'
export type { CanvasProps, CanvasHandle, CanvasRemoteUser } from './renderer/Canvas'

export { CanvasNodeComponent } from './nodes/CanvasNodeComponent'
export type { CanvasNodeProps, NodeRemoteUser } from './nodes/CanvasNodeComponent'

export { CanvasEdgeComponent } from './edges/CanvasEdgeComponent'
export type { CanvasEdgeProps } from './edges/CanvasEdgeComponent'

// React hooks
export { useCanvas, type UseCanvasOptions, type UseCanvasReturn } from './hooks/useCanvas'

// Canvas comments
export {
  useCanvasComments,
  viewportToCanvas,
  canvasToViewport,
  findObjectAtPoint,
  isCanvasAnchorOrphaned,
  type CanvasTransform,
  type CanvasObject,
  type UseCanvasCommentsOptions,
  type UseCanvasCommentsResult,
  type ResolvedPin
} from './hooks/useCanvasComments'

export {
  CommentPin,
  CommentOverlay,
  type CommentPinProps,
  type CommentOverlayProps
} from './comments/index'
