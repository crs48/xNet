/**
 * Chunk Manager
 *
 * Manages chunk loading, eviction, and viewport-based updates.
 * Handles the lifecycle of chunks as the user pans and zooms.
 */

import type {
  Chunk,
  CrossChunkEdge,
  ChunkStats,
  ChunkEvent,
  ChunkEventListener,
  ChunkManagerOptions,
  ChunkStoreAdapter
} from './types'
import type { CanvasNode, CanvasEdge, CanvasNodePosition, Rect } from '../types'
import {
  getCanvasEdgeSourceObjectId,
  getCanvasEdgeTargetObjectId,
  normalizeCanvasEdgeBindings
} from '../edges/bindings'
import { Viewport } from '../spatial/index'
import {
  CHUNK_SIZE,
  LOAD_RADIUS,
  EVICT_RADIUS,
  MAX_LOADED_CHUNKS,
  type ChunkKey,
  chunkKeyFromPosition,
  parseChunkKey,
  chunkDistance,
  getChunksForRect
} from './config'

/**
 * ChunkManager
 *
 * Coordinates chunk loading and eviction based on viewport position.
 * Key features:
 * - Progressive loading (nearest chunks first)
 * - LRU eviction for memory management
 * - Cross-chunk edge handling
 * - requestIdleCallback for non-blocking loads
 */
export class ChunkManager {
  private chunks = new Map<ChunkKey, Chunk>()
  private crossChunkEdges: CrossChunkEdge[] = []
  private loadQueue: ChunkKey[] = []
  private isLoading = false
  private listeners = new Set<ChunkEventListener>()
  private disposed = false

  // Configuration
  private readonly chunkSize: number
  private readonly loadRadius: number
  private readonly evictRadius: number
  private readonly maxLoadedChunks: number

  constructor(
    private store: ChunkStoreAdapter,
    options: ChunkManagerOptions = {}
  ) {
    this.chunkSize = options.chunkSize ?? CHUNK_SIZE
    this.loadRadius = options.loadRadius ?? LOAD_RADIUS
    this.evictRadius = options.evictRadius ?? EVICT_RADIUS
    this.maxLoadedChunks = options.maxLoadedChunks ?? MAX_LOADED_CHUNKS
  }

  // ─── Event Handling ─────────────────────────────────────────────────────────

  /**
   * Subscribe to chunk events.
   */
  subscribe(listener: ChunkEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: ChunkEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (err) {
        console.error('ChunkManager listener error:', err)
      }
    }
  }

  // ─── Viewport Updates ───────────────────────────────────────────────────────

  /**
   * Update which chunks should be loaded based on viewport position.
   * Called on every viewport change.
   */
  updateViewport(viewport: Viewport): void {
    if (this.disposed) return

    const visibleRect = viewport.getVisibleRect()
    const centerChunk = this.getChunkAtPoint(viewport.x, viewport.y)

    // Get chunks that should be visible
    const visibleChunks = this.getChunksForViewport(centerChunk, visibleRect)
    const evictableChunks = this.getChunksOutsideRadius(centerChunk)

    // Queue loading for missing chunks (prioritize by distance from center)
    const missingChunks = visibleChunks.filter(
      (key) => !this.chunks.has(key) || !this.chunks.get(key)!.loaded
    )

    const now = Date.now()
    for (const key of visibleChunks) {
      const chunk = this.chunks.get(key)
      if (chunk?.loaded) {
        chunk.lastAccessed = now
      }
    }

    // Sort by distance from viewport center
    const sorted = missingChunks.sort((a, b) => {
      const distA = chunkDistance(a, centerChunk)
      const distB = chunkDistance(b, centerChunk)
      return distA - distB
    })

    // Update load queue (keep existing entries that are still relevant)
    this.loadQueue = [
      ...sorted,
      ...this.loadQueue.filter((key) => !sorted.includes(key) && visibleChunks.includes(key))
    ]

    // Evict distant chunks
    for (const key of evictableChunks) {
      this.evictChunk(key)
    }

    // Enforce memory limit
    this.enforceMemoryLimit()

    // Start loading
    this.processLoadQueue()
  }

  // ─── Data Access ────────────────────────────────────────────────────────────

  /**
   * Get all loaded nodes (for rendering).
   */
  getAllNodes(): CanvasNode[] {
    const nodes: CanvasNode[] = []
    for (const chunk of this.chunks.values()) {
      if (chunk.loaded) {
        nodes.push(...chunk.nodes)
      }
    }
    return nodes
  }

  /**
   * Get all edges (including cross-chunk edges).
   */
  getAllEdges(): CanvasEdge[] {
    const edges: CanvasEdge[] = []
    for (const chunk of this.chunks.values()) {
      if (chunk.loaded) {
        edges.push(...chunk.edges)
      }
    }

    // Add cross-chunk edges where both chunks are loaded
    for (const edge of this.crossChunkEdges) {
      const sourceLoaded = this.chunks.get(edge.sourceChunk)?.loaded
      const targetLoaded = this.chunks.get(edge.targetChunk)?.loaded
      if (sourceLoaded && targetLoaded) {
        edges.push(edge)
      }
    }

    return edges
  }

  /**
   * Get a specific chunk (may not be loaded).
   */
  getChunk(key: ChunkKey): Chunk | undefined {
    return this.chunks.get(key)
  }

  /**
   * Check if a chunk is loaded.
   */
  isChunkLoaded(key: ChunkKey): boolean {
    return this.chunks.get(key)?.loaded ?? false
  }

  /**
   * Get statistics about loaded chunks.
   */
  getStats(): ChunkStats {
    let totalNodes = 0
    let totalEdges = 0
    let loadingCount = 0

    for (const chunk of this.chunks.values()) {
      if (chunk.loaded) {
        totalNodes += chunk.nodes.length
        totalEdges += chunk.edges.length
      }
      if (chunk.loading) {
        loadingCount++
      }
    }

    return {
      loadedCount: Array.from(this.chunks.values()).filter((c) => c.loaded).length,
      loadingCount,
      totalNodes,
      totalEdges,
      crossChunkEdgeCount: this.crossChunkEdges.length,
      queuedCount: this.loadQueue.length
    }
  }

  getLoadedChunkKeys(): ChunkKey[] {
    return Array.from(this.chunks.entries())
      .filter(([, chunk]) => chunk.loaded)
      .map(([key]) => key)
  }

  async refreshLoadedChunks(): Promise<void> {
    if (this.disposed) {
      return
    }

    const loadedKeys = this.getLoadedChunkKeys()
    const crossEdges = new Map<string, CrossChunkEdge>()

    for (const key of loadedKeys) {
      const chunk = this.chunks.get(key)
      if (!chunk?.loaded) {
        continue
      }

      const data = await this.store.loadChunk(key)
      chunk.nodes = data.nodes
      chunk.edges = data.edges
      chunk.lastAccessed = Date.now()

      const chunkCrossEdges = await this.store.loadCrossChunkEdgesFor(key)
      for (const edge of chunkCrossEdges) {
        crossEdges.set(edge.id, edge)
      }
    }

    this.crossChunkEdges = Array.from(crossEdges.values())
  }

  // ─── Node Operations ────────────────────────────────────────────────────────

  /**
   * Add a node to the appropriate chunk.
   */
  addNode(node: CanvasNode): void {
    const chunkKey = this.getChunkForNode(node)
    this.store.addNode(node, chunkKey)

    // Update local cache if chunk is loaded
    const chunk = this.chunks.get(chunkKey)
    if (chunk?.loaded) {
      chunk.nodes.push(node)
      chunk.lastAccessed = Date.now()
    }
  }

  /**
   * Move a node, potentially to a different chunk.
   */
  moveNode(nodeId: string, newPosition: CanvasNodePosition): void {
    const oldChunkKey = this.findNodeChunk(nodeId)
    const newChunkKey = chunkKeyFromPosition(
      newPosition.x + newPosition.width / 2,
      newPosition.y + newPosition.height / 2
    )

    if (oldChunkKey === newChunkKey) {
      // Same chunk, just update position
      this.store.updateNodePosition(nodeId, newPosition)
      this.updateLocalNodePosition(nodeId, newPosition)
    } else if (oldChunkKey) {
      // Moving to different chunk
      this.store.moveNodeToChunk(nodeId, oldChunkKey, newChunkKey, newPosition)
      this.moveLocalNode(nodeId, oldChunkKey, newChunkKey, newPosition)

      // Update edges that reference this node
      this.updateEdgesForMovedNode(nodeId, oldChunkKey, newChunkKey)
    }
  }

  /**
   * Remove a node.
   */
  removeNode(nodeId: string): void {
    const chunkKey = this.findNodeChunk(nodeId)
    if (!chunkKey) return

    // Remove from local cache
    const chunk = this.chunks.get(chunkKey)
    if (chunk?.loaded) {
      chunk.nodes = chunk.nodes.filter((n) => n.id !== nodeId)
      // Remove edges connected to this node
      chunk.edges = chunk.edges.filter((edge) => {
        const sourceId = getCanvasEdgeSourceObjectId(edge)
        const targetId = getCanvasEdgeTargetObjectId(edge)
        return sourceId !== nodeId && targetId !== nodeId
      })
    }

    // Remove cross-chunk edges
    this.crossChunkEdges = this.crossChunkEdges.filter((edge) => {
      const sourceId = getCanvasEdgeSourceObjectId(edge)
      const targetId = getCanvasEdgeTargetObjectId(edge)
      return sourceId !== nodeId && targetId !== nodeId
    })

    // Remove from store
    this.store.removeNode(nodeId)
  }

  // ─── Edge Operations ────────────────────────────────────────────────────────

  /**
   * Add an edge between nodes.
   */
  addEdge(edge: CanvasEdge): void {
    const existingSourceId = getCanvasEdgeSourceObjectId(edge)
    const existingTargetId = getCanvasEdgeTargetObjectId(edge)
    const normalizedEdge = normalizeCanvasEdgeBindings(edge, {
      sourceNode: existingSourceId ? this.store.getNode(existingSourceId) : null,
      targetNode: existingTargetId ? this.store.getNode(existingTargetId) : null
    })
    const sourceId = getCanvasEdgeSourceObjectId(normalizedEdge)
    const targetId = getCanvasEdgeTargetObjectId(normalizedEdge)
    const sourceChunk = sourceId ? this.findNodeChunk(sourceId) : null
    const targetChunk = targetId ? this.findNodeChunk(targetId) : null

    if (!sourceChunk || !targetChunk) {
      console.warn('Cannot add edge: one or both nodes not found')
      return
    }

    this.store.addEdge(normalizedEdge, sourceChunk, targetChunk)

    // Update local cache
    if (sourceChunk === targetChunk) {
      const chunk = this.chunks.get(sourceChunk)
      if (chunk?.loaded) {
        chunk.edges.push(normalizedEdge)
      }
    } else {
      this.crossChunkEdges.push({
        ...normalizedEdge,
        sourceChunk,
        targetChunk
      })
    }
  }

  /**
   * Remove an edge.
   */
  removeEdge(edgeId: string): void {
    // Remove from cross-chunk edges
    const crossIdx = this.crossChunkEdges.findIndex((e) => e.id === edgeId)
    if (crossIdx >= 0) {
      this.crossChunkEdges.splice(crossIdx, 1)
    }

    // Remove from chunk caches
    for (const chunk of this.chunks.values()) {
      if (chunk.loaded) {
        chunk.edges = chunk.edges.filter((e) => e.id !== edgeId)
      }
    }

    // Remove from store
    this.store.removeEdge(edgeId)
  }

  // ─── Private: Chunk Loading ─────────────────────────────────────────────────

  private getChunkAtPoint(x: number, y: number): ChunkKey {
    return chunkKeyFromPosition(x, y)
  }

  private getChunkForNode(node: CanvasNode): ChunkKey {
    // Use node center
    const cx = node.position.x + node.position.width / 2
    const cy = node.position.y + node.position.height / 2
    return chunkKeyFromPosition(cx, cy)
  }

  private getChunksForViewport(centerChunk: ChunkKey, visibleRect: Rect): ChunkKey[] {
    const { chunkX: cx, chunkY: cy } = parseChunkKey(centerChunk)
    const chunks: ChunkKey[] = []

    // Get chunks within load radius
    for (let x = cx - this.loadRadius; x <= cx + this.loadRadius; x++) {
      for (let y = cy - this.loadRadius; y <= cy + this.loadRadius; y++) {
        chunks.push(`${x},${y}`)
      }
    }

    // Also include any chunks that are actually visible
    const visibleChunks = getChunksForRect(visibleRect)
    for (const key of visibleChunks) {
      if (!chunks.includes(key)) {
        chunks.push(key)
      }
    }

    return chunks
  }

  private getChunksOutsideRadius(centerChunk: ChunkKey): ChunkKey[] {
    const { chunkX: cx, chunkY: cy } = parseChunkKey(centerChunk)
    const evictable: ChunkKey[] = []

    for (const key of this.chunks.keys()) {
      const { chunkX: x, chunkY: y } = parseChunkKey(key)
      if (Math.abs(x - cx) > this.evictRadius || Math.abs(y - cy) > this.evictRadius) {
        evictable.push(key)
      }
    }

    return evictable
  }

  private async processLoadQueue(): Promise<void> {
    if (this.isLoading || this.loadQueue.length === 0 || this.disposed) return

    this.isLoading = true
    const key = this.loadQueue.shift()!

    // Mark as loading
    if (!this.chunks.has(key)) {
      const { chunkX, chunkY } = parseChunkKey(key)
      this.chunks.set(key, {
        key,
        x: chunkX,
        y: chunkY,
        nodes: [],
        edges: [],
        loaded: false,
        loading: true,
        lastAccessed: Date.now()
      })
    } else {
      this.chunks.get(key)!.loading = true
    }

    try {
      const data = await this.store.loadChunk(key)
      const chunk = this.chunks.get(key)!
      chunk.nodes = data.nodes
      chunk.edges = data.edges
      chunk.loaded = true
      chunk.loading = false
      chunk.lastAccessed = Date.now()

      // Load cross-chunk edges that reference nodes in this chunk
      const newCrossEdges = await this.store.loadCrossChunkEdgesFor(key)

      // Only add edges we don't already have
      for (const edge of newCrossEdges) {
        if (!this.crossChunkEdges.some((e) => e.id === edge.id)) {
          this.crossChunkEdges.push(edge)
        }
      }

      this.emit({ type: 'chunk-loaded', chunk })
    } catch (err) {
      console.error(`Failed to load chunk ${key}:`, err)
      const chunk = this.chunks.get(key)
      if (chunk) {
        chunk.loading = false
      }
    } finally {
      this.isLoading = false

      // Continue processing queue with idle callback for non-blocking loads
      if (this.loadQueue.length > 0 && !this.disposed) {
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => this.processLoadQueue())
        } else {
          // Fallback for environments without requestIdleCallback
          setTimeout(() => this.processLoadQueue(), 0)
        }
      }
    }
  }

  private evictChunk(key: ChunkKey): void {
    const chunk = this.chunks.get(key)
    if (!chunk || !chunk.loaded) return

    // Remove from cache
    this.chunks.delete(key)

    // Remove cross-chunk edges that involve this chunk
    this.crossChunkEdges = this.crossChunkEdges.filter(
      (edge) => edge.sourceChunk !== key && edge.targetChunk !== key
    )

    this.emit({ type: 'chunk-evicted', chunkKey: key })
  }

  private enforceMemoryLimit(): void {
    // Sort by last accessed time (oldest first)
    const loadedChunks = Array.from(this.chunks.entries())
      .filter(([, chunk]) => chunk.loaded)
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)

    if (loadedChunks.length <= this.maxLoadedChunks) return

    // Evict oldest chunks until under limit
    const toEvict = loadedChunks.length - this.maxLoadedChunks
    for (let i = 0; i < toEvict; i++) {
      this.evictChunk(loadedChunks[i][0])
    }
  }

  // ─── Private: Node Helpers ──────────────────────────────────────────────────

  private findNodeChunk(nodeId: string): ChunkKey | null {
    // First check the store's index
    const storeChunk = this.store.getNodeChunk(nodeId)
    if (storeChunk) return storeChunk

    const storeNode = this.store.getNode(nodeId)
    if (storeNode) {
      return this.getChunkForNode(storeNode)
    }

    // Fallback: search loaded chunks
    for (const [key, chunk] of this.chunks) {
      if (chunk.loaded && chunk.nodes.some((n) => n.id === nodeId)) {
        return key
      }
    }
    return null
  }

  private updateLocalNodePosition(nodeId: string, position: CanvasNodePosition): void {
    for (const chunk of this.chunks.values()) {
      if (!chunk.loaded) continue
      const node = chunk.nodes.find((n) => n.id === nodeId)
      if (node) {
        node.position = position
        chunk.lastAccessed = Date.now()
        break
      }
    }
  }

  private moveLocalNode(
    nodeId: string,
    fromKey: ChunkKey,
    toKey: ChunkKey,
    position: CanvasNodePosition
  ): void {
    // Remove from old chunk
    const oldChunk = this.chunks.get(fromKey)
    if (oldChunk?.loaded) {
      const idx = oldChunk.nodes.findIndex((n) => n.id === nodeId)
      if (idx >= 0) {
        const node = oldChunk.nodes[idx]
        oldChunk.nodes.splice(idx, 1)

        // Add to new chunk if loaded
        const newChunk = this.chunks.get(toKey)
        if (newChunk?.loaded) {
          node.position = position
          newChunk.nodes.push(node)
          newChunk.lastAccessed = Date.now()
        }
      }
    }
  }

  private updateEdgesForMovedNode(nodeId: string, oldChunk: ChunkKey, newChunk: ChunkKey): void {
    // Find edges that involve this node and update their chunk assignments

    // Check in-chunk edges in old chunk
    const chunk = this.chunks.get(oldChunk)
    if (chunk?.loaded) {
      const edgesToMove = chunk.edges.filter((edge) => {
        const sourceId = getCanvasEdgeSourceObjectId(edge)
        const targetId = getCanvasEdgeTargetObjectId(edge)
        return sourceId === nodeId || targetId === nodeId
      })

      for (const edge of edgesToMove) {
        const sourceId = getCanvasEdgeSourceObjectId(edge)
        const targetId = getCanvasEdgeTargetObjectId(edge)
        const sourceChunk =
          sourceId === nodeId ? newChunk : sourceId ? this.findNodeChunk(sourceId) : null
        const targetChunk =
          targetId === nodeId ? newChunk : targetId ? this.findNodeChunk(targetId) : null

        if (sourceChunk && targetChunk && sourceChunk !== targetChunk) {
          // Now a cross-chunk edge
          chunk.edges = chunk.edges.filter((e) => e.id !== edge.id)
          this.crossChunkEdges.push({
            ...edge,
            sourceChunk,
            targetChunk
          })

          // Update in store
          this.store.updateEdgeChunkAssignment(edge.id, sourceChunk, targetChunk)
        }
      }
    }

    // Check cross-chunk edges that might now be same-chunk
    this.crossChunkEdges = this.crossChunkEdges.filter((edge) => {
      const sourceId = getCanvasEdgeSourceObjectId(edge)
      const targetId = getCanvasEdgeTargetObjectId(edge)
      if (sourceId === nodeId || targetId === nodeId) {
        const sourceChunk =
          sourceId === nodeId ? newChunk : sourceId ? this.findNodeChunk(sourceId) : null
        const targetChunk =
          targetId === nodeId ? newChunk : targetId ? this.findNodeChunk(targetId) : null

        if (sourceChunk === targetChunk && sourceChunk) {
          // Move back to chunk
          const targetChunkObj = this.chunks.get(sourceChunk)
          if (targetChunkObj?.loaded) {
            targetChunkObj.edges.push(edge)
          }

          // Update in store
          this.store.updateEdgeChunkAssignment(edge.id, sourceChunk, sourceChunk)
          return false // Remove from cross-chunk
        }

        // Update chunk assignments
        if (sourceChunk && targetChunk) {
          edge.sourceChunk = sourceChunk
          edge.targetChunk = targetChunk
        }
      }
      return true
    })
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Dispose the chunk manager and clean up.
   */
  dispose(): void {
    this.disposed = true
    this.listeners.clear()
    this.chunks.clear()
    this.crossChunkEdges = []
    this.loadQueue = []
  }
}

/**
 * Create a new chunk manager.
 */
export function createChunkManager(
  store: ChunkStoreAdapter,
  options?: ChunkManagerOptions
): ChunkManager {
  return new ChunkManager(store, options)
}
