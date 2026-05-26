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
  CanvasSceneNodeKind,
  CanvasObjectKind,
  CanvasSourceBackedNodeKind,
  LegacyCanvasNodeType,
  CanvasNodeType,
  CanvasDisplayDensity,
  CanvasDisplayState,
  CanvasNodeProperties,
  CanvasTitledNodeProperties,
  CanvasExternalReferenceNodeProperties,
  CanvasMediaNodeProperties,
  CanvasShapeNodeProperties,
  CanvasGroupNodeProperties,
  CanvasAlignment,
  CanvasDistributionAxis,
  CanvasLayerDirection,
  CanvasNodeBase,
  CanvasPageNode,
  CanvasDatabaseNode,
  CanvasExternalReferenceNode,
  CanvasMediaNode,
  CanvasNoteNode,
  CanvasShapeNode,
  CanvasGroupNode,
  CanvasFrameNode,
  CanvasSceneNode,
  CanvasSceneObject,
  CanvasLegacyNode,
  CanvasNode,
  EdgeAnchor,
  CanvasObjectAnchorPlacement,
  CanvasEdgeEndpoint,
  CanvasConnectorEndpoint,
  CanvasEdge,
  CanvasConnector,
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
  CANVAS_OBJECTS_MAP_KEY,
  CANVAS_CONNECTORS_MAP_KEY,
  CANVAS_GROUPS_MAP_KEY,
  CANVAS_METADATA_MAP_KEY,
  ensureCanvasDocMaps,
  getCanvasObjectsMap,
  getCanvasConnectorsMap,
  getCanvasGroupsMap,
  getCanvasMetadataMap
} from './scene/doc-layout'
export type { CanvasDocMaps } from './scene/doc-layout'

export {
  CANVAS_SCENE_NODE_KINDS,
  getCanvasResolvedNodeKind,
  isCanvasObjectKind,
  isFrameLikeCanvasNode
} from './scene/node-kind'
export type { CanvasResolvedNodeKind } from './scene/node-kind'

export {
  CANVAS_TILE_CONNECTORS_MAP_KEY,
  CANVAS_TILE_METADATA_MAP_KEY,
  CANVAS_TILE_OBJECTS_MAP_KEY,
  CANVAS_TILE_SCHEMA_VERSION,
  CANVAS_TILE_TOMBSTONES_MAP_KEY,
  canvasEdgeToConnectorRecord,
  canvasNodeToObjectRecord,
  convertFlatCanvasDocToTileDocs,
  createCanvasTileDoc,
  ensureCanvasTileDocMaps,
  readCanvasTileDocSnapshot,
  writeCanvasTileDocSnapshot
} from './scene/tile-doc-schema'
export type {
  CanvasTileDocMaps,
  CanvasTileDocSnapshot,
  CreateCanvasTileDocInput,
  FlatCanvasDocTileConversionInput,
  FlatCanvasDocTileConversionResult
} from './scene/tile-doc-schema'

export { createMinimapSummaryFromCanvasScene } from './scene/minimap-summary'
export { createCanvasPreviewModel, getCanvasPreviewCacheKey } from './preview/model'
export {
  cancelCanvasPreviewJob,
  claimNextCanvasPreviewJob,
  completeCanvasPreviewJob,
  createCanvasPreviewQueueState,
  enqueueCanvasPreviewJob,
  failCanvasPreviewJob,
  getCanvasPreviewJobKey
} from './preview/queue'
export {
  createCanvasThumbnailOutput,
  getCanvasThumbnailOutputCacheKey
} from './preview/thumbnail-output'
export {
  createCanvasStoragePolicyPrompt,
  createCanvasStoragePolicyDecision,
  getCanvasStoragePolicies,
  getCanvasStoragePolicyCapability,
  isCanvasStoragePolicy,
  normalizeCanvasStoragePolicy
} from './storage-policy'
export type {
  CanvasPreviewAction,
  CanvasPreviewActionKind,
  CanvasPreviewAnchor,
  CanvasPreviewLifecycleStatus,
  CanvasPreviewLiveSurface,
  CanvasPreviewModel,
  CanvasPreviewShell,
  CanvasPreviewSourceRef,
  CanvasPreviewSummary,
  CanvasPreviewThumbnail,
  CanvasPreviewTier,
  CreateCanvasPreviewModelInput
} from './preview/model'
export type {
  CanvasPreviewQueueClaimResult,
  CanvasPreviewQueueFailureOptions,
  CanvasPreviewQueueJob,
  CanvasPreviewQueueJobInput,
  CanvasPreviewQueueJobStatus,
  CanvasPreviewQueueState
} from './preview/queue'
export type {
  CanvasThumbnailOutput,
  CanvasThumbnailOutputKind,
  CreateCanvasThumbnailOutputInput
} from './preview/thumbnail-output'
export type {
  CanvasStoragePolicy,
  CanvasStoragePolicyCapability,
  CanvasStoragePolicyDecision,
  CanvasStoragePolicyPrompt,
  CanvasStoragePolicyPromptIntent,
  CanvasStoragePolicyPromptOption,
  CanvasStorageSourceKind,
  CreateCanvasStoragePolicyDecisionInput,
  CreateCanvasStoragePolicyPromptInput
} from './storage-policy'
export {
  createCanvasInteractionController,
  createCanvasInteractionResult,
  getCanvasInteractionUndoGroupId
} from './interaction/controller'
export type {
  CanvasConnectCommand,
  CanvasInteractionCommand,
  CanvasInteractionCommandKind,
  CanvasInteractionConnectorEndpoint,
  CanvasInteractionController,
  CanvasInteractionHandlerMap,
  CanvasInteractionPhase,
  CanvasInteractionResult,
  CanvasInteractionUndoScope,
  CanvasMoveCommand,
  CanvasNudgeCommand,
  CanvasResizeCommand,
  CanvasSelectCommand,
  CanvasSelectionInteractionMode,
  CanvasSnapCommand,
  CanvasSnapGuide,
  CanvasSnapGuideSource,
  CanvasSnapState,
  CanvasUndoGroupCommand
} from './interaction/controller'

export {
  DEFAULT_CANVAS_TILE_SIZE,
  anchorLocalToWorldPoint,
  chooseObjectLod,
  createCanvasCamera,
  createEmptyMinimapSummary,
  createMinimapSummaryFromTileSummaries,
  createSyntheticCanvasScene,
  createTileId,
  createWorldPointFromCanvasPoint,
  getCameraVisibleTileCoverage,
  getDominantCanvasObjectKind,
  getMinimapSummaryMode,
  getTileBounds,
  getTileCoverageForRect,
  normalizeWorldPoint,
  parseTileId,
  screenToWorldPoint,
  worldPointToAnchorLocal,
  worldToScreenPoint
} from '@xnetjs/canvas-core'
export type {
  CanvasCameraState,
  CanvasDensityGrid,
  CanvasLodTier,
  CanvasObjectRecord,
  CanvasSceneProvider,
  CanvasSceneSnapshot,
  CanvasTileSummary,
  MinimapSummary,
  MinimapSummaryMode,
  TileAddress,
  TileCoord,
  ViewportInterest,
  WorldPoint
} from '@xnetjs/canvas-core'

export {
  createAlignmentUpdates,
  createDistributionUpdates,
  createFrameSelectionNode,
  createGroupSelectionNode,
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
export { getCanvasResizePolicy } from './selection/resize-policy'
export { createCanvasSmartSnap } from './selection/snap-guides'
export type {
  CanvasContainerRole,
  CanvasLockUpdate,
  CanvasPositionUpdate,
  CreateFrameSelectionNodeOptions,
  CreateGroupSelectionNodeOptions
} from './selection/scene-operations'
export type { CanvasResizePolicy } from './selection/resize-policy'
export type { CanvasSmartSnapResult, CanvasSnapGuideSegment } from './selection/snap-guides'

export {
  CANVAS_INTERNAL_NODE_MIME,
  serializeCanvasInternalNodeDragData,
  parseCanvasInternalNodeDragData,
  normalizeExternalReferenceUrl,
  describeExternalReference,
  getExternalReferenceRect,
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
  WebGLVectorTileRenderer,
  createVectorTileInstances,
  createWebGLVectorTileRenderer,
  createRasterTileDrawPlan,
  createThumbnailInvalidationKey,
  createThumbnailSpriteInstances,
  createWebGLRasterTileRenderer,
  createWebGLThumbnailSpriteRenderer,
  isWebGL2Available,
  measureRasterTileTexturePressure,
  packThumbnailAtlases,
  packThumbnailSpriteInstances,
  packVectorTileInstances,
  RasterTileTextureLru,
  THUMBNAIL_SPRITE_INSTANCE_FLOATS,
  VECTOR_TILE_INSTANCE_FLOATS,
  WebGLRasterTileRenderer,
  WebGLThumbnailSpriteRenderer,
  type PackedThumbnailAtlas,
  type GridLayer,
  type WebGLGridConfig,
  type EdgeRendererViewport,
  type RasterTileDrawItem,
  type RasterTileDrawPlan,
  type RasterTileDrawPlanInput,
  type MeasureRasterTileTexturePressureInput,
  type RasterTileTextureResolver,
  type RasterTileTexturePressureMeasurement,
  type RasterTileTexturePressureRecord,
  type RasterTileTexturePressureSample,
  type RasterTileTextureSource,
  type RasterTileTransitionEntry,
  type RasterTileTransitionState,
  type RetiringRasterTileTransitionEntry,
  type ThumbnailAtlasPackingOptions,
  type ThumbnailAtlasPackingResult,
  type ThumbnailAtlasTextureResolver,
  type ThumbnailAtlasTextureSource,
  type ThumbnailSpriteInstance,
  type ThumbnailSpriteSource,
  type VectorTileInstance,
  type WebGLRasterTileConfig,
  type WebGLRasterTileViewport,
  type WebGLThumbnailSpriteViewport,
  type WebGLVectorTileConfig,
  type WebGLVectorTileViewport
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
  createLegacyNode,
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

export { DomIslandPool, planDomIslandPool } from './renderer/dom-island-pool'
export type {
  DomIslandAssignment,
  DomIslandCandidate,
  DomIslandPoolBudgets,
  DomIslandPoolPlan,
  DomIslandPoolUpdate,
  DomIslandTier,
  PlanDomIslandPoolInput
} from './renderer/dom-island-pool'

export {
  createCanvasDebugOverlayCommands,
  renderCanvasDebugOverlay
} from './renderer/debug-overlays'
export type {
  CanvasDebugCacheStatus,
  CanvasDebugOverlayCommand,
  CanvasDebugOverlayInput,
  CanvasDebugOverlayViewport,
  CanvasDebugTileOverlay
} from './renderer/debug-overlays'

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
export { Canvas } from './renderer/CanvasV3'
export type {
  CanvasProps,
  CanvasHandle,
  CanvasSelectionSnapshot,
  CanvasSurfaceEventContext,
  CanvasRemoteUser,
  CanvasNodeRenderContext
} from './renderer/CanvasV3'
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
export {
  dedupeCanvasIngressPayloads,
  getCanvasIngressPayloadDedupeKey,
  ingestCanvasPayloadBatch,
  resolveCanvasIngestOptions,
  selectCanvasIngestor
} from './ingestors'
export type {
  CanvasIngestBatchError,
  CanvasIngestBatchOptions,
  CanvasIngestBatchResult,
  CanvasIngestBatchSkippedPayload,
  CanvasIngestBatchSkippedReason,
  CanvasIngestOptions,
  CanvasResolvedIngestOptions,
  CanvasIngestResult,
  CanvasIngestor
} from './ingestors'

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
