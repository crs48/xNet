/**
 * Canvas Store - Yjs-backed collaborative state
 *
 * Stores canvas nodes and edges in a Y.Doc for real-time collaboration.
 * The canvas document uses the schema system with document: 'yjs'.
 */

import * as Y from 'yjs'
import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodePosition,
  CanvasNodeType,
  ViewportState
} from './types'
import { SpatialIndex, createSpatialIndex } from './spatial/index'

/**
 * Y.Doc structure for canvas:
 * - metadata: Y.Map (title, created, etc.)
 * - nodes: Y.Map<string, CanvasNode>
 * - edges: Y.Map<string, CanvasEdge>
 * - viewport: Y.Map (shared viewport state - optional)
 */

/**
 * Canvas store events
 */
export type CanvasStoreEvent =
  | { type: 'node-added'; node: CanvasNode }
  | { type: 'node-updated'; node: CanvasNode; changes: Partial<CanvasNode> }
  | { type: 'node-removed'; id: string }
  | { type: 'edge-added'; edge: CanvasEdge }
  | { type: 'edge-removed'; id: string }
  | { type: 'bulk-update'; nodeIds: string[] }

/**
 * Event listener type
 */
export type CanvasStoreListener = (event: CanvasStoreEvent) => void

/**
 * Canvas Store
 *
 * Manages canvas state in a Yjs document for real-time collaboration.
 */
export class CanvasStore {
  private ydoc: Y.Doc
  private nodesMap: Y.Map<unknown>
  private edgesMap: Y.Map<unknown>
  private metaMap: Y.Map<unknown>
  private spatialIndex: SpatialIndex
  private listeners: Set<CanvasStoreListener>
  private disposed = false

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc
    this.nodesMap = ydoc.getMap('nodes')
    this.edgesMap = ydoc.getMap('edges')
    this.metaMap = ydoc.getMap('metadata')
    this.spatialIndex = createSpatialIndex()
    this.listeners = new Set()

    // Initialize spatial index from existing nodes
    this.rebuildSpatialIndex()

    // Observe changes for spatial index updates
    this.nodesMap.observe(this.handleNodesChange.bind(this))
  }

  /**
   * Get the underlying Y.Doc
   */
  getDoc(): Y.Doc {
    return this.ydoc
  }

  // ============================================================================
  // Node operations
  // ============================================================================

  /**
   * Add a new node to the canvas
   */
  addNode(node: CanvasNode): void {
    this.ydoc.transact(() => {
      this.nodesMap.set(node.id, node)
    })
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): CanvasNode | undefined {
    return this.nodesMap.get(id) as CanvasNode | undefined
  }

  /**
   * Get all nodes
   */
  getNodes(): CanvasNode[] {
    const nodes: CanvasNode[] = []
    this.nodesMap.forEach((value: unknown) => {
      nodes.push(value as CanvasNode)
    })
    return nodes
  }

  /**
   * Get nodes as a Map
   */
  getNodesMap(): Map<string, CanvasNode> {
    const map = new Map<string, CanvasNode>()
    this.nodesMap.forEach((value: unknown, key: string) => {
      map.set(key, value as CanvasNode)
    })
    return map
  }

  /**
   * Update a node's position
   */
  updateNodePosition(id: string, position: Partial<CanvasNodePosition>): void {
    const node = this.getNode(id)
    if (!node) return

    this.ydoc.transact(() => {
      const updated: CanvasNode = {
        ...node,
        position: { ...node.position, ...position }
      }
      this.nodesMap.set(id, updated)
    })
  }

  /**
   * Update multiple nodes' positions (for drag operations)
   */
  updateNodePositions(updates: Array<{ id: string; position: Partial<CanvasNodePosition> }>): void {
    this.ydoc.transact(() => {
      for (const { id, position } of updates) {
        const node = this.getNode(id)
        if (node) {
          const updated: CanvasNode = {
            ...node,
            position: { ...node.position, ...position }
          }
          this.nodesMap.set(id, updated)
        }
      }
    })
  }

  /**
   * Update node properties
   */
  updateNodeProperties(id: string, properties: Record<string, unknown>): void {
    const node = this.getNode(id)
    if (!node) return

    this.ydoc.transact(() => {
      const updated: CanvasNode = {
        ...node,
        properties: { ...node.properties, ...properties }
      }
      this.nodesMap.set(id, updated)
    })
  }

  /**
   * Remove a node
   */
  removeNode(id: string): boolean {
    if (!this.nodesMap.has(id)) return false

    this.ydoc.transact(() => {
      this.nodesMap.delete(id)
      // Also remove connected edges
      this.edgesMap.forEach((edge: unknown, edgeId: string) => {
        const e = edge as CanvasEdge
        if (e.sourceId === id || e.targetId === id) {
          this.edgesMap.delete(edgeId)
        }
      })
    })
    return true
  }

  /**
   * Remove multiple nodes
   */
  removeNodes(ids: string[]): void {
    this.ydoc.transact(() => {
      for (const id of ids) {
        this.nodesMap.delete(id)
      }
      // Remove connected edges
      const idSet = new Set(ids)
      this.edgesMap.forEach((edge: unknown, edgeId: string) => {
        const e = edge as CanvasEdge
        if (idSet.has(e.sourceId) || idSet.has(e.targetId)) {
          this.edgesMap.delete(edgeId)
        }
      })
    })
  }

  // ============================================================================
  // Edge operations
  // ============================================================================

  /**
   * Add an edge between nodes
   */
  addEdge(edge: CanvasEdge): void {
    this.ydoc.transact(() => {
      this.edgesMap.set(edge.id, edge)
    })
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): CanvasEdge | undefined {
    return this.edgesMap.get(id) as CanvasEdge | undefined
  }

  /**
   * Get all edges
   */
  getEdges(): CanvasEdge[] {
    const edges: CanvasEdge[] = []
    this.edgesMap.forEach((value: unknown) => {
      edges.push(value as CanvasEdge)
    })
    return edges
  }

  /**
   * Get edges connected to a node
   */
  getNodeEdges(nodeId: string): CanvasEdge[] {
    const edges: CanvasEdge[] = []
    this.edgesMap.forEach((value: unknown) => {
      const edge = value as CanvasEdge
      if (edge.sourceId === nodeId || edge.targetId === nodeId) {
        edges.push(edge)
      }
    })
    return edges
  }

  /**
   * Remove an edge
   */
  removeEdge(id: string): boolean {
    if (!this.edgesMap.has(id)) return false
    this.edgesMap.delete(id)
    return true
  }

  // ============================================================================
  // Spatial queries (using R-tree index)
  // ============================================================================

  /**
   * Get nodes visible in a viewport rect
   */
  getVisibleNodes(viewport: { x: number; y: number; width: number; height: number }): CanvasNode[] {
    const ids = this.spatialIndex.search(viewport)
    return ids.map((id) => this.getNode(id)).filter((n): n is CanvasNode => n !== undefined)
  }

  /**
   * Find node at a point (topmost by z-index)
   */
  findNodeAt(x: number, y: number): CanvasNode | undefined {
    const id = this.spatialIndex.findNodeAt({ x, y }, this.getNodesMap())
    return id ? this.getNode(id) : undefined
  }

  /**
   * Find nodes in a selection rectangle
   */
  findNodesInRect(rect: { x: number; y: number; width: number; height: number }): CanvasNode[] {
    const ids = this.spatialIndex.search(rect)
    return ids.map((id) => this.getNode(id)).filter((n): n is CanvasNode => n !== undefined)
  }

  /**
   * Get the bounding box of all nodes
   */
  getBounds(): { x: number; y: number; width: number; height: number } | null {
    return this.spatialIndex.getBounds()
  }

  // ============================================================================
  // Metadata
  // ============================================================================

  /**
   * Get canvas title
   */
  getTitle(): string {
    return (this.metaMap.get('title') as string) ?? 'Untitled Canvas'
  }

  /**
   * Set canvas title
   */
  setTitle(title: string): void {
    this.metaMap.set('title', title)
    this.metaMap.set('updated', Date.now())
  }

  // ============================================================================
  // Event handling
  // ============================================================================

  /**
   * Subscribe to store changes
   */
  subscribe(listener: CanvasStoreListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: CanvasStoreEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }

  /**
   * Handle changes to the nodes Y.Map
   */
  private handleNodesChange(event: Y.YMapEvent<unknown>): void {
    // Update spatial index
    event.keysChanged.forEach((key: string) => {
      const node = this.nodesMap.get(key) as CanvasNode | undefined
      if (node) {
        this.spatialIndex.upsert(key, node.position)
        this.emit({ type: 'node-updated', node, changes: {} })
      } else {
        this.spatialIndex.remove(key)
        this.emit({ type: 'node-removed', id: key })
      }
    })
  }

  /**
   * Rebuild spatial index from all nodes
   */
  private rebuildSpatialIndex(): void {
    const nodes: Array<{ id: string; position: CanvasNodePosition }> = []
    this.nodesMap.forEach((value: unknown, key: string) => {
      const node = value as CanvasNode
      nodes.push({ id: key, position: node.position })
    })
    this.spatialIndex.load(nodes)
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get node count
   */
  nodeCount(): number {
    return this.nodesMap.size
  }

  /**
   * Get edge count
   */
  edgeCount(): number {
    return this.edgesMap.size
  }

  /**
   * Clear all nodes and edges
   */
  clear(): void {
    this.ydoc.transact(() => {
      this.nodesMap.clear()
      this.edgesMap.clear()
    })
    this.spatialIndex.clear()
  }

  /**
   * Dispose the store and clean up observers
   */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.spatialIndex.clear()
  }
}

/**
 * Create a new canvas store from a Y.Doc
 */
export function createCanvasStore(ydoc: Y.Doc): CanvasStore {
  return new CanvasStore(ydoc)
}

/**
 * Create a new empty canvas document
 */
export function createCanvasDoc(id: string, title = 'Untitled Canvas'): Y.Doc {
  const ydoc = new Y.Doc({ guid: id })

  // Initialize metadata
  const meta = ydoc.getMap('metadata')
  meta.set('title', title)
  meta.set('created', Date.now())
  meta.set('updated', Date.now())

  // Initialize empty maps
  ydoc.getMap('nodes')
  ydoc.getMap('edges')

  return ydoc
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Generate a unique edge ID
 */
export function generateEdgeId(): string {
  return `edge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Create a new canvas node
 */
export function createNode(
  type: CanvasNodeType,
  position: Partial<CanvasNodePosition> = {},
  properties: Record<string, unknown> = {}
): CanvasNode {
  return {
    id: generateNodeId(),
    type,
    position: {
      x: position.x ?? 0,
      y: position.y ?? 0,
      width: position.width ?? 200,
      height: position.height ?? 100,
      rotation: position.rotation,
      zIndex: position.zIndex ?? 0
    },
    properties
  }
}

/**
 * Create a new edge
 */
export function createEdge(
  sourceId: string,
  targetId: string,
  properties: Partial<Omit<CanvasEdge, 'id' | 'sourceId' | 'targetId'>> = {}
): CanvasEdge {
  return {
    id: generateEdgeId(),
    sourceId,
    targetId,
    ...properties
  }
}
