/**
 * Chunked Canvas Store
 *
 * Yjs-backed storage for chunked canvas data.
 * Each chunk is a separate Y.Map within the canvas Y.Doc, enabling:
 * - Progressive loading (nearest chunks first)
 * - Memory management through eviction
 * - Independent sync per chunk
 */

import type { ChunkKey } from './config'
import type { ChunkData, CrossChunkEdge } from './types'
import type { CanvasNode, CanvasEdge, CanvasNodePosition } from '../types'
import * as Y from 'yjs'
import { CANVAS_CONNECTORS_MAP_KEY, CANVAS_OBJECTS_MAP_KEY } from '../scene/doc-layout'

/**
 * Y.Doc structure for chunked canvas:
 * - metadata: Y.Map (title, created, etc.)
 * - chunks: Y.Map<ChunkKey, Y.Map> (each chunk contains objects and connectors)
 * - crossEdges: Y.Map<edgeId, CrossChunkEdge>
 * - index: Y.Map<nodeId, ChunkKey> (node-to-chunk lookup)
 */

/**
 * ChunkedCanvasStore
 *
 * Manages canvas state with spatial chunking for truly infinite canvases.
 */
export class ChunkedCanvasStore {
  private ydoc: Y.Doc
  private metadata: Y.Map<unknown>
  private chunks: Y.Map<Y.Map<unknown>>
  private crossEdges: Y.Map<unknown>
  private index: Y.Map<string>

  constructor(id: string) {
    this.ydoc = new Y.Doc({ guid: id, gc: false })
    this.metadata = this.ydoc.getMap('metadata')
    this.chunks = this.ydoc.getMap('chunks') as Y.Map<Y.Map<unknown>>
    this.crossEdges = this.ydoc.getMap('crossEdges')
    this.index = this.ydoc.getMap('index') as Y.Map<string>
  }

  /**
   * Get the underlying Y.Doc
   */
  getYDoc(): Y.Doc {
    return this.ydoc
  }

  // ─── Chunk Operations ─────────────────────────────────────────────────────

  /**
   * Load a chunk's data from Yjs.
   * Returns nodes and edges stored in that chunk.
   */
  async loadChunk(key: ChunkKey): Promise<ChunkData> {
    const chunkMap = this.chunks.get(key)

    if (!chunkMap) {
      return { nodes: [], edges: [] }
    }

    const nodesMap = chunkMap.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown> | undefined
    const edgesMap = chunkMap.get(CANVAS_CONNECTORS_MAP_KEY) as Y.Map<unknown> | undefined

    const nodes: CanvasNode[] = []
    const edges: CanvasEdge[] = []

    nodesMap?.forEach((value) => {
      nodes.push(value as CanvasNode)
    })

    edgesMap?.forEach((value) => {
      edges.push(value as CanvasEdge)
    })

    return { nodes, edges }
  }

  /**
   * Load cross-chunk edges that involve a specific chunk.
   */
  async loadCrossChunkEdgesFor(chunkKey: ChunkKey): Promise<CrossChunkEdge[]> {
    const edges: CrossChunkEdge[] = []

    this.crossEdges.forEach((value) => {
      const edge = value as CrossChunkEdge
      if (edge.sourceChunk === chunkKey || edge.targetChunk === chunkKey) {
        edges.push(edge)
      }
    })

    return edges
  }

  /**
   * Ensure a chunk exists in Yjs, creating it if necessary.
   */
  private ensureChunk(chunkKey: ChunkKey): Y.Map<unknown> {
    let chunk = this.chunks.get(chunkKey)
    if (!chunk) {
      chunk = new Y.Map()
      chunk.set(CANVAS_OBJECTS_MAP_KEY, new Y.Map())
      chunk.set(CANVAS_CONNECTORS_MAP_KEY, new Y.Map())
      this.chunks.set(chunkKey, chunk)
    }
    return chunk
  }

  // ─── Node Operations ──────────────────────────────────────────────────────

  /**
   * Add a node to the specified chunk.
   */
  addNode(node: CanvasNode, chunkKey: ChunkKey): void {
    this.ydoc.transact(() => {
      const chunk = this.ensureChunk(chunkKey)
      const nodes = chunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
      nodes.set(node.id, node)
      this.index.set(node.id, chunkKey)
    })
  }

  /**
   * Get the chunk key for a node.
   */
  getNodeChunk(nodeId: string): ChunkKey | null {
    return (this.index.get(nodeId) as ChunkKey) ?? null
  }

  /**
   * Update a node's position within the same chunk.
   */
  updateNodePosition(nodeId: string, position: CanvasNodePosition): void {
    const chunkKey = this.index.get(nodeId)
    if (!chunkKey) return

    const chunk = this.chunks.get(chunkKey as ChunkKey)
    if (!chunk) return

    const nodes = chunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
    const node = nodes.get(nodeId) as CanvasNode
    if (!node) return

    this.ydoc.transact(() => {
      nodes.set(nodeId, { ...node, position })
    })
  }

  /**
   * Move a node to a different chunk (when it crosses chunk boundaries).
   */
  moveNodeToChunk(
    nodeId: string,
    fromKey: ChunkKey,
    toKey: ChunkKey,
    newPosition: CanvasNodePosition
  ): void {
    this.ydoc.transact(() => {
      // Get node from old chunk
      const oldChunk = this.chunks.get(fromKey)
      if (!oldChunk) return

      const oldNodes = oldChunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
      const node = oldNodes.get(nodeId) as CanvasNode
      if (!node) return

      // Remove from old chunk
      oldNodes.delete(nodeId)

      // Add to new chunk
      const newChunk = this.ensureChunk(toKey)
      const newNodes = newChunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
      newNodes.set(nodeId, { ...node, position: newPosition })

      // Update index
      this.index.set(nodeId, toKey)
    })
  }

  /**
   * Remove a node from its chunk.
   */
  removeNode(nodeId: string): void {
    const chunkKey = this.index.get(nodeId)
    if (!chunkKey) return

    this.ydoc.transact(() => {
      const chunk = this.chunks.get(chunkKey as ChunkKey)
      if (chunk) {
        const nodes = chunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
        nodes.delete(nodeId)
      }
      this.index.delete(nodeId)

      // Remove edges connected to this node
      this.removeEdgesForNode(nodeId)
    })
  }

  /**
   * Get a node by ID (searches the index first for efficiency).
   */
  getNode(nodeId: string): CanvasNode | null {
    const chunkKey = this.index.get(nodeId)
    if (!chunkKey) return null

    const chunk = this.chunks.get(chunkKey as ChunkKey)
    if (!chunk) return null

    const nodes = chunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
    return (nodes.get(nodeId) as CanvasNode) ?? null
  }

  // ─── Edge Operations ──────────────────────────────────────────────────────

  /**
   * Add an edge. If both nodes are in the same chunk, the edge is stored
   * with that chunk. Otherwise, it's stored as a cross-chunk edge.
   */
  addEdge(edge: CanvasEdge, sourceChunk: ChunkKey, targetChunk: ChunkKey): void {
    this.ydoc.transact(() => {
      if (sourceChunk === targetChunk) {
        // Same chunk edge - store with the chunk
        const chunk = this.chunks.get(sourceChunk)
        if (chunk) {
          const edges = chunk.get(CANVAS_CONNECTORS_MAP_KEY) as Y.Map<unknown>
          edges.set(edge.id, edge)
        }
      } else {
        // Cross-chunk edge
        this.crossEdges.set(edge.id, {
          ...edge,
          sourceChunk,
          targetChunk
        } as CrossChunkEdge)
      }
    })
  }

  /**
   * Remove an edge by ID.
   */
  removeEdge(edgeId: string): void {
    this.ydoc.transact(() => {
      // Try removing from cross-chunk edges first
      if (this.crossEdges.has(edgeId)) {
        this.crossEdges.delete(edgeId)
        return
      }

      // Search in all chunks
      this.chunks.forEach((chunk) => {
        const edges = chunk.get(CANVAS_CONNECTORS_MAP_KEY) as Y.Map<unknown>
        if (edges.has(edgeId)) {
          edges.delete(edgeId)
        }
      })
    })
  }

  /**
   * Remove all edges connected to a node.
   */
  private removeEdgesForNode(nodeId: string): void {
    // Remove cross-chunk edges involving this node
    const crossEdgesToRemove: string[] = []
    this.crossEdges.forEach((value, key) => {
      const edge = value as CrossChunkEdge
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        crossEdgesToRemove.push(key)
      }
    })
    for (const key of crossEdgesToRemove) {
      this.crossEdges.delete(key)
    }

    // Remove in-chunk edges involving this node
    this.chunks.forEach((chunk) => {
      const edges = chunk.get(CANVAS_CONNECTORS_MAP_KEY) as Y.Map<unknown>
      const edgesToRemove: string[] = []
      edges.forEach((value, key) => {
        const edge = value as CanvasEdge
        if (edge.sourceId === nodeId || edge.targetId === nodeId) {
          edgesToRemove.push(key)
        }
      })
      for (const key of edgesToRemove) {
        edges.delete(key)
      }
    })
  }

  /**
   * Move an edge from in-chunk to cross-chunk or vice versa.
   * Called when a node moves between chunks.
   */
  updateEdgeChunkAssignment(edgeId: string, sourceChunk: ChunkKey, targetChunk: ChunkKey): void {
    this.ydoc.transact(() => {
      // Try to find the edge
      let edge: CanvasEdge | null = null

      // Check cross-chunk edges
      if (this.crossEdges.has(edgeId)) {
        edge = this.crossEdges.get(edgeId) as CanvasEdge
        this.crossEdges.delete(edgeId)
      } else {
        // Search in chunks
        this.chunks.forEach((chunk) => {
          const edges = chunk.get(CANVAS_CONNECTORS_MAP_KEY) as Y.Map<unknown>
          if (edges.has(edgeId)) {
            edge = edges.get(edgeId) as CanvasEdge
            edges.delete(edgeId)
          }
        })
      }

      if (!edge) return

      // Re-add with correct classification
      if (sourceChunk === targetChunk) {
        // Now a same-chunk edge
        const chunk = this.ensureChunk(sourceChunk)
        const edges = chunk.get(CANVAS_CONNECTORS_MAP_KEY) as Y.Map<unknown>
        edges.set(edgeId, edge)
      } else {
        // Now a cross-chunk edge
        this.crossEdges.set(edgeId, {
          ...edge,
          sourceChunk,
          targetChunk
        } as CrossChunkEdge)
      }
    })
  }

  /**
   * Get all cross-chunk edges.
   */
  getAllCrossChunkEdges(): CrossChunkEdge[] {
    const edges: CrossChunkEdge[] = []
    this.crossEdges.forEach((value) => {
      edges.push(value as CrossChunkEdge)
    })
    return edges
  }

  // ─── Metadata Operations ──────────────────────────────────────────────────

  /**
   * Get canvas title.
   */
  getTitle(): string {
    return (this.metadata.get('title') as string) ?? 'Untitled Canvas'
  }

  /**
   * Set canvas title.
   */
  setTitle(title: string): void {
    this.ydoc.transact(() => {
      this.metadata.set('title', title)
      this.metadata.set('updated', Date.now())
    })
  }

  /**
   * Initialize metadata for a new canvas.
   */
  initializeMetadata(title: string = 'Untitled Canvas'): void {
    this.ydoc.transact(() => {
      this.metadata.set('title', title)
      this.metadata.set('created', Date.now())
      this.metadata.set('updated', Date.now())
    })
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  /**
   * Get all chunk keys that have data.
   */
  getLoadedChunkKeys(): ChunkKey[] {
    const keys: ChunkKey[] = []
    this.chunks.forEach((_, key) => {
      keys.push(key as ChunkKey)
    })
    return keys
  }

  /**
   * Check if a chunk exists in storage.
   */
  hasChunk(key: ChunkKey): boolean {
    return this.chunks.has(key)
  }

  /**
   * Get stats about stored data.
   */
  getStats(): { chunkCount: number; nodeCount: number; crossEdgeCount: number } {
    let nodeCount = 0
    this.chunks.forEach((chunk) => {
      const nodes = chunk.get(CANVAS_OBJECTS_MAP_KEY) as Y.Map<unknown>
      nodeCount += nodes.size
    })

    return {
      chunkCount: this.chunks.size,
      nodeCount,
      crossEdgeCount: this.crossEdges.size
    }
  }

  /**
   * Clear all data.
   */
  clear(): void {
    this.ydoc.transact(() => {
      this.chunks.clear()
      this.crossEdges.clear()
      this.index.clear()
    })
  }
}

/**
 * Create a new chunked canvas store.
 */
export function createChunkedCanvasStore(id: string): ChunkedCanvasStore {
  return new ChunkedCanvasStore(id)
}

/**
 * Create a chunked canvas store from an existing Y.Doc.
 * Used when loading from persistence or syncing.
 */
export function createChunkedCanvasStoreFromDoc(ydoc: Y.Doc): ChunkedCanvasStore {
  const store = Object.create(ChunkedCanvasStore.prototype) as ChunkedCanvasStore
  // @ts-expect-error - accessing private field for initialization
  store.ydoc = ydoc
  // @ts-expect-error - accessing private field for initialization
  store.metadata = ydoc.getMap('metadata')
  // @ts-expect-error - accessing private field for initialization
  store.chunks = ydoc.getMap('chunks')
  // @ts-expect-error - accessing private field for initialization
  store.crossEdges = ydoc.getMap('crossEdges')
  // @ts-expect-error - accessing private field for initialization
  store.index = ydoc.getMap('index')
  return store
}
