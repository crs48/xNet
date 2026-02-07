/**
 * Swimlane Module
 *
 * Container nodes that organize child nodes into distinct regions.
 */

// Types
export type {
  SwimlaneOrientation,
  SwimlaneProperties,
  SwimlaneNode,
  GenericCanvasNode,
  SwimlaneConfig,
  ContentBounds
} from './types'

export { DEFAULT_SWIMLANE_CONFIG, getContentBounds } from './types'

// Manager
export { SwimlaneManager, createSwimlaneManager } from './swimlane-manager'

// Component
export { SwimlaneNodeComponent } from './SwimlaneNode'
export type { SwimlaneNodeProps } from './SwimlaneNode'

// Hook
export { useSwimlanes } from './useSwimlanes'
export type { UseSwimlaneOptions, UseSwimlaneReturn } from './useSwimlanes'
