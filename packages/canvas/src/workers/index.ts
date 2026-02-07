/**
 * Workers Module
 *
 * Web Worker-based layout computation.
 */

// Layout Manager
export {
  LayoutManager,
  createLayoutManager,
  type LayoutAlgorithm,
  type LayoutNode,
  type LayoutEdge,
  type LayoutRequest,
  type LayoutManagerConfig
} from './layout-manager'

// Layout Worker types
export type { LayoutWorkerRequest, LayoutWorkerResponse } from './layout-worker'

// Hook
export { useLayout } from './useLayout'
export type { UseLayoutOptions, UseLayoutReturn } from './useLayout'
