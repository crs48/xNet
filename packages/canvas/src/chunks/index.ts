/**
 * Chunked Storage Module
 *
 * Tile-based Y.Doc storage for truly infinite canvases with lazy-loading and eviction.
 *
 * @example
 * ```ts
 * import { createChunkedCanvasStore, createChunkManager } from '@xnetjs/canvas'
 *
 * // Create store and manager
 * const store = createChunkedCanvasStore('canvas-1')
 * const manager = createChunkManager(store)
 *
 * // Update on viewport changes
 * manager.updateViewport(viewport)
 *
 * // Get visible data
 * const nodes = manager.getAllNodes()
 * const edges = manager.getAllEdges()
 * ```
 */

// Configuration
export {
  CHUNK_SIZE,
  LOAD_RADIUS,
  EVICT_RADIUS,
  MAX_LOADED_CHUNKS,
  type ChunkKey,
  chunkKeyFromPosition,
  parseChunkKey,
  positionFromChunkKey,
  chunkBounds,
  chunkCenter,
  chunkDistance,
  getChunksInRadius,
  getChunksForRect
} from './config'

// Types
export type {
  Chunk,
  CrossChunkEdge,
  ChunkData,
  ChunkLoadStatus,
  ChunkStats,
  ChunkLoadedEvent,
  ChunkEvictedEvent,
  ChunkEvent,
  ChunkEventListener,
  ChunkManagerOptions,
  NodePositionUpdate
} from './types'

// Chunk Manager
export { ChunkManager, createChunkManager } from './chunk-manager'

// Chunked Canvas Store
export {
  ChunkedCanvasStore,
  createChunkedCanvasStore,
  createChunkedCanvasStoreFromDoc
} from './chunked-canvas-store'
