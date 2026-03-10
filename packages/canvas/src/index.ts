/**
 * @xnetjs/canvas - Infinite Canvas for Spatial Visualization
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
 * import { Canvas, createCanvasDoc } from '@xnetjs/canvas'
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
  CanvasObjectKind,
  LegacyCanvasNodeType,
  CanvasNodeType,
  CanvasAlignment,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNode,
  EdgeAnchor,
  CanvasObjectAnchorPlacement,
  CanvasEdgeEndpoint,
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

export {
  createAlignmentUpdates,
  createDistributionUpdates,
  createFrameSelectionNode,
  createLayerShiftUpdates,
  createLockUpdates,
  createTidySelectionUpdates,
  expandContainerPositionUpdates,
  getCanvasContainerMemberIds,
  getCanvasContainerRole,
  getSelectionBounds,
  getSelectionLockState,
  isCanvasContainerNode,
  getUnlockedSelection
} from './selection/scene-operations'
export type {
  CanvasContainerRole,
  CanvasLockUpdate,
  CanvasPositionUpdate,
  CreateFrameSelectionNodeOptions
} from './selection/scene-operations'

export {
  CANVAS_INTERNAL_NODE_MIME,
  serializeCanvasInternalNodeDragData,
  parseCanvasInternalNodeDragData,
  normalizeExternalReferenceUrl,
  describeExternalReference,
  inferMediaKind,
  getMediaRect,
  readImageDimensions,
  getCanvasObjectKindFromSchema,
  resolveCanvasPlacementRect,
  resolveCanvasPrimitivePlacementRect,
  createCanvasPrimitiveNode,
  createSourceBackedCanvasNode,
  extractCanvasIngressPayloads
} from './ingestion'
export type {
  CanvasViewportSnapshot,
  CanvasInternalNodeDragData,
  CanvasIngressPayload,
  CanvasExternalReferenceProvider,
  CanvasExternalReferenceKind,
  CanvasExternalReferenceDescriptor,
  CanvasMediaKind,
  CanvasSourceBackedNodeInput,
  CanvasPrimitiveObjectKind,
  CanvasPrimitiveNodeInput
} from './ingestion'

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

export {
  createCanvasPerformanceSceneDoc,
  buildCanvasPerformanceScene,
  seedCanvasPerformanceScene,
  type CanvasPerformanceSceneOptions,
  type CanvasPerformanceSceneSummary,
  type CanvasPerformanceSceneSeedResult
} from './fixtures/performance-scene'

// Chunked storage (for infinite canvases)
export {
  // Configuration
  CHUNK_SIZE,
  LOAD_RADIUS,
  EVICT_RADIUS,
  MAX_LOADED_CHUNKS,
  chunkKeyFromPosition,
  parseChunkKey,
  positionFromChunkKey,
  chunkBounds,
  chunkCenter,
  chunkDistance,
  getChunksInRadius,
  getChunksForRect,
  // Types
  type ChunkKey,
  type Chunk,
  type CrossChunkEdge,
  type ChunkData,
  type ChunkStoreAdapter,
  type ChunkLoadStatus,
  type ChunkStats,
  type ChunkEvent,
  type ChunkEventListener,
  type ChunkManagerOptions,
  // Classes
  ChunkManager,
  createChunkManager,
  ChunkedCanvasStore,
  FlatCanvasChunkStore,
  createChunkedCanvasStore,
  createChunkedCanvasStoreFromDoc,
  createFlatCanvasChunkStore
} from './chunks/index'

// React components
export { Canvas } from './renderer/Canvas'
export type {
  CanvasProps,
  CanvasHandle,
  CanvasSelectionSnapshot,
  CanvasSurfaceEventContext,
  CanvasRemoteUser,
  CanvasNodeRenderContext
} from './renderer/Canvas'
export {
  useCanvasThemeTokens,
  resolveCanvasThemeMode,
  resolveCanvasThemeTokens
} from './theme/canvas-theme'
export type { CanvasThemeMode, CanvasThemeTokens } from './theme/canvas-theme'

export { CanvasNodeComponent, calculateLOD } from './nodes/CanvasNodeComponent'
export type { CanvasNodeProps, NodeRemoteUser, LODLevel } from './nodes/CanvasNodeComponent'

export { MermaidNodeComponent } from './nodes/mermaid-node'
export type { MermaidNodeData, MermaidNodeProps } from './nodes/mermaid-node'

export { ChecklistNodeComponent } from './nodes/checklist-node'
export type { ChecklistItem, ChecklistNodeData, ChecklistNodeProps } from './nodes/checklist-node'

export { ShapeNodeComponent, ShapePicker, createShapePath, SHAPE_TYPES } from './nodes/shape-node'
export type { ShapeType, ShapeNodeData, ShapeNodeProps, ShapePickerProps } from './nodes/shape-node'

export { EmbedNodeComponent } from './nodes/embed-node'
export type {
  EmbedViewType,
  EmbedNodeData,
  EmbedNodeProps,
  LinkedNodeData
} from './nodes/embed-node'

export { CanvasEdgeComponent } from './edges/CanvasEdgeComponent'
export type { CanvasEdgeProps } from './edges/CanvasEdgeComponent'
export {
  createCanvasObjectAnchorId,
  createCanvasEdgeEndpoint,
  getCanvasEdgeNodeIds,
  getCanvasEdgeSourceObjectId,
  getCanvasEdgeTargetObjectId,
  normalizeCanvasEdgeBindings,
  resolveAutoCanvasAnchorPlacement,
  resolveCanvasAnchorPoint,
  toLegacyEdgeAnchor
} from './edges/bindings'

// Minimap, navigation, and presence components
export {
  Minimap,
  CollapsibleMinimap,
  NavigationTools,
  RemoteCursor,
  PresenceOverlay,
  SelectionIndicator,
  RemoteSelectionsOverlay
} from './components/index'
export type {
  MinimapProps,
  CollapsibleMinimapProps,
  NavigationToolsProps,
  RemoteCursorProps,
  PresenceOverlayProps,
  SelectionIndicatorProps,
  RemoteSelectionsOverlayProps,
  CanvasNode as CanvasNodeData,
  CanvasNodePosition as CanvasNodePositionData
} from './components/index'

// Presence management
export {
  CanvasPresenceManager,
  createCanvasPresenceManager,
  SelectionLockManager,
  createSelectionLockManager,
  USER_COLORS,
  getUserColor,
  type CanvasActivity,
  type CanvasPresence,
  type AwarenessLike,
  type PresenceChangeCallback,
  type SelectionLock
} from './presence/index'

// Cursor tracking hook
export { useCursorTracking } from './hooks/useCursorTracking'
export type { UseCursorTrackingOptions } from './hooks/useCursorTracking'

// Navigation hooks
export { useCanvasKeyboard } from './hooks/useCanvasKeyboard'
export type { UseCanvasKeyboardOptions } from './hooks/useCanvasKeyboard'

export { useCanvasObjectIngestion } from './hooks/useCanvasObjectIngestion'
export type {
  UseCanvasObjectIngestionOptions,
  PlaceCanvasPrimitiveObjectInput,
  PlaceCanvasSourceObjectInput,
  CanvasIngestionResult
} from './hooks/useCanvasObjectIngestion'

export { useSpacePan } from './hooks/useSpacePan'
export type { UseSpacePanOptions } from './hooks/useSpacePan'

export { useWheelZoom } from './hooks/useWheelZoom'
export type { UseWheelZoomOptions } from './hooks/useWheelZoom'

// Edit lock hook
export { useEditLock } from './hooks/useEditLock'
export type { UseEditLockOptions, UseEditLockReturn } from './hooks/useEditLock'

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
  type CanvasObjectCommentOptions,
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

// Drawing tools
export {
  DrawingToolController,
  drawPath,
  drawPaths,
  DrawingLayer,
  DrawingToolbar,
  DEFAULT_DRAWING_TOOL,
  STROKE_COLORS,
  STROKE_SIZES
} from './drawing/index'
export type {
  Point as DrawingPoint,
  PressurePoint,
  DrawingPath,
  DrawingTool,
  DrawingLayerProps,
  DrawingLayerRef,
  DrawingToolbarProps
} from './drawing/index'

// Edge routing
export {
  OrthogonalRouter,
  createOrthogonalRouter,
  MinHeap,
  DEFAULT_ROUTER_CONFIG,
  EdgeBundler,
  createEdgeBundler,
  DEFAULT_BUNDLE_CONFIG
} from './routing/index'
export type {
  Point as RoutingPoint,
  Rect as RoutingRect,
  EdgeAnchor as RoutingEdgeAnchor,
  Direction,
  RouterConfig,
  PathNode,
  EdgeStyle as BundlerEdgeStyle,
  CanvasEdge as BundlerCanvasEdge,
  BundledEdge,
  BundleConfig
} from './routing/index'

// Swimlanes
export {
  SwimlaneManager,
  createSwimlaneManager,
  SwimlaneNodeComponent,
  useSwimlanes,
  DEFAULT_SWIMLANE_CONFIG,
  getContentBounds
} from './swimlane/index'
export type {
  SwimlaneOrientation,
  SwimlaneProperties,
  SwimlaneNode,
  GenericCanvasNode as SwimlaneGenericNode,
  SwimlaneConfig,
  ContentBounds,
  SwimlaneNodeProps,
  UseSwimlaneOptions,
  UseSwimlaneReturn
} from './swimlane/index'

// Worker Layout
export { LayoutManager, createLayoutManager, useLayout } from './workers/index'
export type {
  LayoutAlgorithm as WorkerLayoutAlgorithm,
  LayoutNode,
  LayoutEdge,
  LayoutRequest as WorkerLayoutRequest,
  LayoutManagerConfig,
  UseLayoutOptions,
  UseLayoutReturn
} from './workers/index'

// Performance utilities
export {
  FrameMonitor,
  createFrameMonitor,
  getMemoryUsage,
  formatBytes,
  profileMemory,
  MemoryTracker,
  createMemoryTracker
} from './performance/index'
export type { FrameStats, MemorySnapshot } from './performance/index'

// Accessibility
export {
  KeyboardNavigator,
  createKeyboardNavigator,
  Announcer,
  createAnnouncer,
  getAnnouncer,
  useHighContrast,
  useReducedMotion,
  isHighContrastEnabled,
  isReducedMotionPreferred,
  HIGH_CONTRAST_STYLES
} from './accessibility/index'
export type {
  NavigableNode,
  NavigationSpatialIndex,
  KeyboardNavigationOptions,
  AnnouncerNode,
  HighContrastStyles
} from './accessibility/index'
