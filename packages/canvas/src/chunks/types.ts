/**
 * Chunk Types
 *
 * Type definitions for the chunked storage system.
 */

import type { ChunkKey } from './config'
import type { CanvasNode, CanvasEdge, CanvasNodePosition } from '../types'

/**
 * A chunk is a tile of the infinite canvas.
 * Each chunk contains nodes and edges that belong to it spatially.
 */
export interface Chunk {
  /** Unique key for this chunk (e.g., "0,0", "-1,2") */
  key: ChunkKey
  /** Chunk X coordinate (not canvas coordinate) */
  x: number
  /** Chunk Y coordinate (not canvas coordinate) */
  y: number
  /** Nodes whose center is in this chunk */
  nodes: CanvasNode[]
  /** Edges where both endpoints are in this chunk */
  edges: CanvasEdge[]
  /** Whether this chunk has been loaded from storage */
  loaded: boolean
  /** Whether this chunk is currently being loaded */
  loading: boolean
  /** Timestamp of last access (for LRU eviction) */
  lastAccessed: number
}

/**
 * An edge that spans multiple chunks.
 * Cross-chunk edges are stored separately and rendered when both
 * source and target chunks are loaded.
 */
export interface CrossChunkEdge extends CanvasEdge {
  /** Chunk containing the source node */
  sourceChunk: ChunkKey
  /** Chunk containing the target node */
  targetChunk: ChunkKey
}

/**
 * Data loaded from a chunk.
 */
export interface ChunkData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/**
 * Storage contract used by the chunk manager.
 *
 * The primary Canvas V2 runtime can satisfy this either with the dedicated
 * chunked Y.Doc store or with an adapter over the current flat canvas maps.
 */
export interface ChunkStoreAdapter {
  loadChunk(key: ChunkKey): Promise<ChunkData>
  loadCrossChunkEdgesFor(chunkKey: ChunkKey): Promise<CrossChunkEdge[]>
  addNode(node: CanvasNode, chunkKey: ChunkKey): void
  getNodeChunk(nodeId: string): ChunkKey | null
  updateNodePosition(nodeId: string, position: CanvasNodePosition): void
  moveNodeToChunk(
    nodeId: string,
    fromKey: ChunkKey,
    toKey: ChunkKey,
    newPosition: CanvasNodePosition
  ): void
  removeNode(nodeId: string): void
  getNode(nodeId: string): CanvasNode | null
  addEdge(edge: CanvasEdge, sourceChunk: ChunkKey, targetChunk: ChunkKey): void
  removeEdge(edgeId: string): void
  updateEdgeChunkAssignment(edgeId: string, sourceChunk: ChunkKey, targetChunk: ChunkKey): void
}

/**
 * Chunk load status for UI feedback.
 */
export type ChunkLoadStatus = 'pending' | 'loading' | 'loaded' | 'error'

/**
 * Chunk statistics for debugging/monitoring.
 */
export interface ChunkStats {
  /** Total chunks in memory */
  loadedCount: number
  /** Chunks currently being loaded */
  loadingCount: number
  /** Total nodes across all loaded chunks */
  totalNodes: number
  /** Total edges across all loaded chunks */
  totalEdges: number
  /** Cross-chunk edges count */
  crossChunkEdgeCount: number
  /** Chunks in the load queue */
  queuedCount: number
}

/**
 * Event emitted when a chunk is loaded.
 */
export interface ChunkLoadedEvent {
  type: 'chunk-loaded'
  chunk: Chunk
}

/**
 * Event emitted when a chunk is evicted.
 */
export interface ChunkEvictedEvent {
  type: 'chunk-evicted'
  chunkKey: ChunkKey
}

/**
 * Union of chunk events.
 */
export type ChunkEvent = ChunkLoadedEvent | ChunkEvictedEvent

/**
 * Listener for chunk events.
 */
export type ChunkEventListener = (event: ChunkEvent) => void

/**
 * Options for creating a ChunkManager.
 */
export interface ChunkManagerOptions {
  /** Custom chunk size (default: CHUNK_SIZE from config) */
  chunkSize?: number
  /** Custom load radius (default: LOAD_RADIUS from config) */
  loadRadius?: number
  /** Custom evict radius (default: EVICT_RADIUS from config) */
  evictRadius?: number
  /** Maximum chunks to keep in memory (default: MAX_LOADED_CHUNKS from config) */
  maxLoadedChunks?: number
}

/**
 * Node position update for chunk movement.
 */
export interface NodePositionUpdate {
  nodeId: string
  position: CanvasNodePosition
  fromChunk?: ChunkKey
  toChunk: ChunkKey
}
