/**
 * Routing Module
 *
 * Edge routing and pathfinding for canvas.
 */

// Types
export type { Point, Rect, EdgeAnchor, Direction, RouterConfig, PathNode } from './types'

export { DEFAULT_ROUTER_CONFIG } from './types'

// Min Heap
export { MinHeap } from './min-heap'

// Orthogonal Router
export { OrthogonalRouter, createOrthogonalRouter } from './orthogonal-router'

// Edge Bundler
export {
  EdgeBundler,
  createEdgeBundler,
  DEFAULT_BUNDLE_CONFIG,
  type EdgeStyle,
  type CanvasEdge,
  type BundledEdge,
  type BundleConfig
} from './edge-bundler'
