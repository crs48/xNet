/**
 * Routing Types
 *
 * Type definitions for edge routing and pathfinding.
 */

/**
 * Point in 2D space
 */
export interface Point {
  x: number
  y: number
}

/**
 * Rectangle (bounding box)
 */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Edge anchor position
 */
export type EdgeAnchor = 'top' | 'right' | 'bottom' | 'left' | 'center' | 'auto'

/**
 * Direction for pathfinding
 */
export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Router configuration
 */
export interface RouterConfig {
  /** Routing grid size in pixels (e.g., 10) */
  gridSize: number
  /** Minimum distance from node edges (e.g., 20) */
  nodeMargin: number
  /** Cost penalty for each bend (higher = fewer bends) */
  bendPenalty: number
  /** Cost penalty for crossing other edges */
  crossingPenalty: number
  /** Maximum iterations for pathfinding */
  maxIterations: number
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  gridSize: 10,
  nodeMargin: 20,
  bendPenalty: 50,
  crossingPenalty: 100,
  maxIterations: 10000
}

/**
 * A* pathfinding node
 */
export interface PathNode {
  x: number
  y: number
  /** Cost from start */
  g: number
  /** Heuristic to end */
  h: number
  /** Parent node in path */
  parent: PathNode | null
  /** Direction to reach this node */
  direction: Direction | null
}
