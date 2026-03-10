/**
 * Canvas Store - Yjs-backed collaborative state
 *
 * Stores canvas nodes and edges in a Y.Doc for real-time collaboration.
 * The canvas document uses the schema system with document: 'yjs'.
 */

import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodePosition,
  CanvasNodeType,
  CanvasSceneNodeKind,
  LegacyCanvasNodeType
} from './types'
import * as Y from 'yjs'
import { normalizeCanvasEdgeBindings, getCanvasEdgeNodeIds } from './edges/bindings'
import {
  ensureCanvasDocMaps,
  getCanvasConnectorsMap,
  getCanvasMetadataMap,
  getCanvasObjectsMap
} from './scene/doc-layout'
import { SpatialIndex, createSpatialIndex } from './spatial/index'

type CanvasNodeChanges = Partial<Omit<CanvasNode, 'id'>>

function mergeNodeChanges(node: CanvasNode, changes: CanvasNodeChanges): CanvasNode {
  return {
    ...node,
    ...changes,
    ...(changes.position ? { position: { ...node.position, ...changes.position } } : {}),
    ...(changes.properties ? { properties: { ...node.properties, ...changes.properties } } : {})
  }
}

/**
 * Y.Doc structure for canvas:
 * - metadata: Y.Map (title, created, etc.)
 * - objects: Y.Map<string, CanvasNode>
 * - connectors: Y.Map<string, CanvasEdge>
 * - groups: Y.Map<string, unknown> (reserved for future group metadata)
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
    const maps = ensureCanvasDocMaps(ydoc)
    this.nodesMap = maps.objects
    this.edgesMap = maps.connectors
    this.metaMap = maps.metadata
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
      this.nodesMap.set(id, mergeNodeChanges(node, { properties }))
    })
  }

  /**
   * Update a node with partial changes.
   */
  updateNode(id: string, changes: CanvasNodeChanges): void {
    const node = this.getNode(id)
    if (!node) return

    this.ydoc.transact(() => {
      this.nodesMap.set(id, mergeNodeChanges(node, changes))
    })
  }

  /**
   * Update multiple nodes with partial changes.
   */
  updateNodes(updates: Array<{ id: string; changes: CanvasNodeChanges }>): void {
    this.ydoc.transact(() => {
      for (const update of updates) {
        const node = this.getNode(update.id)
        if (!node) {
          continue
        }

        this.nodesMap.set(update.id, mergeNodeChanges(node, update.changes))
      }
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
        const [sourceId, targetId] = getCanvasEdgeNodeIds(e)
        if (sourceId === id || targetId === id) {
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
        const [sourceId, targetId] = getCanvasEdgeNodeIds(e)
        if ((sourceId && idSet.has(sourceId)) || (targetId && idSet.has(targetId))) {
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
    const [sourceId, targetId] = getCanvasEdgeNodeIds(edge)
    const normalizedEdge = normalizeCanvasEdgeBindings(edge, {
      sourceNode: sourceId ? (this.getNode(sourceId) ?? null) : null,
      targetNode: targetId ? (this.getNode(targetId) ?? null) : null
    })

    this.ydoc.transact(() => {
      this.edgesMap.set(normalizedEdge.id, normalizedEdge)
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
      const [sourceId, targetId] = getCanvasEdgeNodeIds(edge)
      if (sourceId === nodeId || targetId === nodeId) {
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
    // Update spatial index and emit events with change info
    event.changes.keys.forEach((change, key) => {
      const node = this.nodesMap.get(key) as CanvasNode | undefined

      if (change.action === 'add') {
        if (node) {
          this.spatialIndex.upsert(key, node.position)
          this.emit({ type: 'node-added', node })
        }
      } else if (change.action === 'delete') {
        this.spatialIndex.remove(key)
        this.emit({ type: 'node-removed', id: key })
      } else if (change.action === 'update') {
        if (node) {
          this.spatialIndex.upsert(key, node.position)
          // Compute changes by comparing with old value
          const oldNode = change.oldValue as CanvasNode | undefined
          const changes: Partial<CanvasNode> = {}
          if (oldNode) {
            // Check each property for changes
            const posChanged =
              oldNode.position?.x !== node.position?.x ||
              oldNode.position?.y !== node.position?.y ||
              oldNode.position?.width !== node.position?.width ||
              oldNode.position?.height !== node.position?.height ||
              oldNode.position?.rotation !== node.position?.rotation ||
              oldNode.position?.zIndex !== node.position?.zIndex
            if (posChanged) {
              changes.position = node.position
            }
            if (oldNode.type !== node.type) {
              changes.type = node.type
            }
            if (oldNode.linkedNodeId !== node.linkedNodeId) {
              changes.linkedNodeId = node.linkedNodeId
            }
            if (oldNode.sourceNodeId !== node.sourceNodeId) {
              changes.sourceNodeId = node.sourceNodeId
            }
            if (oldNode.sourceSchemaId !== node.sourceSchemaId) {
              changes.sourceSchemaId = node.sourceSchemaId
            }
            if (oldNode.alias !== node.alias) {
              changes.alias = node.alias
            }
            if (oldNode.locked !== node.locked) {
              changes.locked = node.locked
            }
            // Deep compare properties (JSON for simplicity)
            if (JSON.stringify(oldNode.properties) !== JSON.stringify(node.properties)) {
              changes.properties = node.properties
            }
          }
          this.emit({ type: 'node-updated', node, changes })
        }
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
  const ydoc = new Y.Doc({ guid: id, gc: false })

  // Initialize metadata
  const meta = getCanvasMetadataMap(ydoc)
  meta.set('title', title)
  meta.set('created', Date.now())
  meta.set('updated', Date.now())

  // Initialize empty maps
  getCanvasObjectsMap(ydoc)
  getCanvasConnectorsMap(ydoc)
  ensureCanvasDocMaps(ydoc)

  return ydoc
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(): string {
  return `node_${crypto.randomUUID()}`
}

/**
 * Generate a unique edge ID
 */
export function generateEdgeId(): string {
  return `edge_${crypto.randomUUID()}`
}

/**
 * Create a new Canvas V2 scene node.
 */
export function createNode(
  type: CanvasSceneNodeKind,
  position: Partial<CanvasNodePosition> = {},
  properties: Record<string, unknown> = {}
): CanvasNode {
  const defaultSize = getDefaultSceneNodeSize(type)

  return createCanvasNode(type, position, properties, defaultSize)
}

/**
 * Create a legacy canvas node for isolated legacy stories/tests.
 */
export function createLegacyNode(
  type: LegacyCanvasNodeType,
  position: Partial<CanvasNodePosition> = {},
  properties: Record<string, unknown> = {}
): CanvasNode {
  const defaultSize = getDefaultLegacyNodeSize(type)

  return createCanvasNode(type, position, properties, defaultSize)
}

function createCanvasNode(
  type: CanvasNodeType,
  position: Partial<CanvasNodePosition>,
  properties: Record<string, unknown>,
  defaultSize: { width: number; height: number }
): CanvasNode {
  return {
    id: generateNodeId(),
    type,
    position: {
      x: position.x ?? 0,
      y: position.y ?? 0,
      width: position.width ?? defaultSize.width,
      height: position.height ?? defaultSize.height,
      rotation: position.rotation,
      zIndex: position.zIndex ?? 0
    },
    properties
  }
}

function getDefaultSceneNodeSize(type: CanvasSceneNodeKind): { width: number; height: number } {
  switch (type) {
    case 'page':
      return { width: 360, height: 220 }
    case 'database':
      return { width: 440, height: 260 }
    case 'note':
      return { width: 320, height: 180 }
    case 'external-reference':
      return { width: 360, height: 180 }
    case 'media':
      return { width: 320, height: 240 }
    case 'group':
      return { width: 320, height: 220 }
    case 'shape':
      return { width: 200, height: 100 }
  }
}

function getDefaultLegacyNodeSize(type: LegacyCanvasNodeType): { width: number; height: number } {
  switch (type) {
    case 'card':
    case 'frame':
    case 'image':
    case 'embed':
    default:
      return { width: 200, height: 100 }
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
  return normalizeCanvasEdgeBindings({
    id: generateEdgeId(),
    sourceId,
    targetId,
    ...properties
  })
}
