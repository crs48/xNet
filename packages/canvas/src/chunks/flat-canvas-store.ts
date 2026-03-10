/**
 * Flat Canvas Chunk Store
 *
 * Provides chunked load/evict semantics on top of the current flat `nodes`
 * and `edges` Yjs maps. This activates the chunk runtime without requiring an
 * immediate persisted-document migration.
 */

import type { ChunkKey } from './config'
import type { ChunkData, ChunkStoreAdapter, CrossChunkEdge } from './types'
import type { CanvasEdge, CanvasNode, CanvasNodePosition } from '../types'
import * as Y from 'yjs'
import {
  getCanvasEdgeSourceObjectId,
  getCanvasEdgeTargetObjectId,
  normalizeCanvasEdgeBindings
} from '../edges/bindings'
import { chunkKeyFromPosition } from './config'

type EdgeLocation =
  | {
      kind: 'chunk'
      chunkKey: ChunkKey
    }
  | {
      kind: 'cross'
      sourceChunk: ChunkKey
      targetChunk: ChunkKey
    }

function getNodeChunkKey(node: CanvasNode): ChunkKey {
  const centerX = node.position.x + node.position.width / 2
  const centerY = node.position.y + node.position.height / 2
  return chunkKeyFromPosition(centerX, centerY)
}

function getOrCreateSet<T>(map: Map<string, Set<T>>, key: string): Set<T> {
  let value = map.get(key)
  if (!value) {
    value = new Set<T>()
    map.set(key, value)
  }
  return value
}

function deleteFromIndexedSet<T>(map: Map<string, Set<T>>, key: string, value: T): void {
  const existing = map.get(key)
  if (!existing) {
    return
  }

  existing.delete(value)
  if (existing.size === 0) {
    map.delete(key)
  }
}

export class FlatCanvasChunkStore implements ChunkStoreAdapter {
  private readonly ydoc: Y.Doc
  private readonly nodes: Y.Map<CanvasNode>
  private readonly edges: Y.Map<CanvasEdge>
  private readonly nodeChunks = new Map<string, ChunkKey>()
  private readonly chunkNodeIds = new Map<ChunkKey, Set<string>>()
  private readonly edgeLocations = new Map<string, EdgeLocation>()
  private readonly chunkEdgeIds = new Map<ChunkKey, Set<string>>()
  private readonly crossEdges = new Map<string, CrossChunkEdge>()
  private readonly crossEdgeIdsByChunk = new Map<ChunkKey, Set<string>>()
  private readonly edgeIdsByNode = new Map<string, Set<string>>()
  private readonly edgeEndpoints = new Map<string, { sourceId: string; targetId: string }>()
  private readonly handleNodesObserved: (event: Y.YMapEvent<CanvasNode>) => void
  private readonly handleEdgesObserved: (event: Y.YMapEvent<CanvasEdge>) => void

  constructor(ydoc: Y.Doc) {
    this.ydoc = ydoc
    this.nodes = ydoc.getMap<CanvasNode>('nodes')
    this.edges = ydoc.getMap<CanvasEdge>('edges')
    this.handleNodesObserved = this.onNodesObserved.bind(this)
    this.handleEdgesObserved = this.onEdgesObserved.bind(this)

    this.rebuildIndexes()

    this.nodes.observe(this.handleNodesObserved)
    this.edges.observe(this.handleEdgesObserved)
  }

  dispose(): void {
    this.nodes.unobserve(this.handleNodesObserved)
    this.edges.unobserve(this.handleEdgesObserved)
    this.nodeChunks.clear()
    this.chunkNodeIds.clear()
    this.edgeLocations.clear()
    this.chunkEdgeIds.clear()
    this.crossEdges.clear()
    this.crossEdgeIdsByChunk.clear()
    this.edgeIdsByNode.clear()
    this.edgeEndpoints.clear()
  }

  async loadChunk(key: ChunkKey): Promise<ChunkData> {
    const nodeIds = this.chunkNodeIds.get(key)
    const edgeIds = this.chunkEdgeIds.get(key)

    return {
      nodes: nodeIds
        ? Array.from(nodeIds)
            .map((nodeId) => this.nodes.get(nodeId) ?? null)
            .filter((node): node is CanvasNode => node !== null)
        : [],
      edges: edgeIds
        ? Array.from(edgeIds)
            .map((edgeId) => this.edges.get(edgeId) ?? null)
            .filter((edge): edge is CanvasEdge => edge !== null)
        : []
    }
  }

  async loadCrossChunkEdgesFor(chunkKey: ChunkKey): Promise<CrossChunkEdge[]> {
    const edgeIds = this.crossEdgeIdsByChunk.get(chunkKey)
    if (!edgeIds) {
      return []
    }

    return Array.from(edgeIds)
      .map((edgeId) => this.crossEdges.get(edgeId) ?? null)
      .filter((edge): edge is CrossChunkEdge => edge !== null)
  }

  addNode(node: CanvasNode, _chunkKey: ChunkKey): void {
    this.ydoc.transact(() => {
      this.nodes.set(node.id, node)
    })
  }

  getNodeChunk(nodeId: string): ChunkKey | null {
    return this.nodeChunks.get(nodeId) ?? null
  }

  updateNodePosition(nodeId: string, position: CanvasNodePosition): void {
    const node = this.nodes.get(nodeId)
    if (!node) {
      return
    }

    this.ydoc.transact(() => {
      this.nodes.set(nodeId, {
        ...node,
        position
      })
    })
  }

  moveNodeToChunk(
    nodeId: string,
    _fromKey: ChunkKey,
    _toKey: ChunkKey,
    newPosition: CanvasNodePosition
  ): void {
    this.updateNodePosition(nodeId, newPosition)
  }

  removeNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      return
    }

    this.ydoc.transact(() => {
      this.nodes.delete(nodeId)

      const connectedEdgeIds = Array.from(this.edgeIdsByNode.get(nodeId) ?? [])
      for (const edgeId of connectedEdgeIds) {
        this.edges.delete(edgeId)
      }
    })
  }

  getNode(nodeId: string): CanvasNode | null {
    return this.nodes.get(nodeId) ?? null
  }

  addEdge(edge: CanvasEdge, _sourceChunk: ChunkKey, _targetChunk: ChunkKey): void {
    const sourceId = getCanvasEdgeSourceObjectId(edge)
    const targetId = getCanvasEdgeTargetObjectId(edge)
    const normalizedEdge = normalizeCanvasEdgeBindings(edge, {
      sourceNode: sourceId ? this.getNode(sourceId) : null,
      targetNode: targetId ? this.getNode(targetId) : null
    })

    this.ydoc.transact(() => {
      this.edges.set(normalizedEdge.id, normalizedEdge)
    })
  }

  removeEdge(edgeId: string): void {
    this.ydoc.transact(() => {
      this.edges.delete(edgeId)
    })
  }

  updateEdgeChunkAssignment(_edgeId: string, _sourceChunk: ChunkKey, _targetChunk: ChunkKey): void {
    // Edge chunk assignment is derived from current endpoint positions.
  }

  private onNodesObserved(event: Y.YMapEvent<CanvasNode>): void {
    event.changes.keys.forEach((change, key) => {
      const oldNode = change.oldValue as CanvasNode | undefined
      const nextNode = this.nodes.get(key) ?? null
      const previousChunk = this.nodeChunks.get(key) ?? (oldNode ? getNodeChunkKey(oldNode) : null)
      const nextChunk = nextNode ? getNodeChunkKey(nextNode) : null

      if (previousChunk && previousChunk !== nextChunk) {
        deleteFromIndexedSet(this.chunkNodeIds, previousChunk, key)
        this.nodeChunks.delete(key)
      }

      if (nextNode && nextChunk) {
        getOrCreateSet(this.chunkNodeIds, nextChunk).add(key)
        this.nodeChunks.set(key, nextChunk)
      }

      if (previousChunk !== nextChunk) {
        this.refreshEdgesForNode(key)
      }
    })
  }

  private onEdgesObserved(event: Y.YMapEvent<CanvasEdge>): void {
    event.changes.keys.forEach((change, key) => {
      if (change.action === 'delete') {
        this.removeEdgeIndex(key)
        return
      }

      const edge = this.edges.get(key) ?? null
      if (!edge) {
        this.removeEdgeIndex(key)
        return
      }

      this.classifyEdge(edge)
    })
  }

  private rebuildIndexes(): void {
    this.nodeChunks.clear()
    this.chunkNodeIds.clear()
    this.edgeLocations.clear()
    this.chunkEdgeIds.clear()
    this.crossEdges.clear()
    this.crossEdgeIdsByChunk.clear()
    this.edgeIdsByNode.clear()
    this.edgeEndpoints.clear()

    this.nodes.forEach((node, nodeId) => {
      const chunkKey = getNodeChunkKey(node)
      this.nodeChunks.set(nodeId, chunkKey)
      getOrCreateSet(this.chunkNodeIds, chunkKey).add(nodeId)
    })

    this.edges.forEach((edge) => {
      this.updateEdgeEndpoints(edge)
      this.classifyEdge(edge)
    })
  }

  private refreshEdgesForNode(nodeId: string): void {
    const edgeIds = this.edgeIdsByNode.get(nodeId)
    if (!edgeIds) {
      return
    }

    for (const edgeId of edgeIds) {
      const edge = this.edges.get(edgeId) ?? null
      if (!edge) {
        this.removeEdgeIndex(edgeId)
        continue
      }

      this.classifyEdge(edge)
    }
  }

  private updateEdgeEndpoints(edge: CanvasEdge): void {
    const sourceId = getCanvasEdgeSourceObjectId(edge)
    const targetId = getCanvasEdgeTargetObjectId(edge)
    if (!sourceId || !targetId) {
      return
    }

    const existing = this.edgeEndpoints.get(edge.id)
    if (existing) {
      deleteFromIndexedSet(this.edgeIdsByNode, existing.sourceId, edge.id)
      deleteFromIndexedSet(this.edgeIdsByNode, existing.targetId, edge.id)
    }

    getOrCreateSet(this.edgeIdsByNode, sourceId).add(edge.id)
    getOrCreateSet(this.edgeIdsByNode, targetId).add(edge.id)
    this.edgeEndpoints.set(edge.id, {
      sourceId,
      targetId
    })
  }

  private removeEdgeIndex(edgeId: string): void {
    const location = this.edgeLocations.get(edgeId)
    if (location) {
      if (location.kind === 'chunk') {
        deleteFromIndexedSet(this.chunkEdgeIds, location.chunkKey, edgeId)
      } else {
        deleteFromIndexedSet(this.crossEdgeIdsByChunk, location.sourceChunk, edgeId)
        deleteFromIndexedSet(this.crossEdgeIdsByChunk, location.targetChunk, edgeId)
      }
      this.edgeLocations.delete(edgeId)
    }

    this.crossEdges.delete(edgeId)

    const endpoints = this.edgeEndpoints.get(edgeId)
    if (endpoints) {
      deleteFromIndexedSet(this.edgeIdsByNode, endpoints.sourceId, edgeId)
      deleteFromIndexedSet(this.edgeIdsByNode, endpoints.targetId, edgeId)
      this.edgeEndpoints.delete(edgeId)
    }
  }

  private classifyEdge(edge: CanvasEdge): void {
    this.removeEdgeIndex(edge.id)
    this.updateEdgeEndpoints(edge)

    const sourceId = getCanvasEdgeSourceObjectId(edge)
    const targetId = getCanvasEdgeTargetObjectId(edge)
    if (!sourceId || !targetId) {
      return
    }

    const sourceChunk = this.nodeChunks.get(sourceId)
    const targetChunk = this.nodeChunks.get(targetId)
    if (!sourceChunk || !targetChunk) {
      return
    }

    if (sourceChunk === targetChunk) {
      getOrCreateSet(this.chunkEdgeIds, sourceChunk).add(edge.id)
      this.edgeLocations.set(edge.id, {
        kind: 'chunk',
        chunkKey: sourceChunk
      })
      return
    }

    const crossEdge: CrossChunkEdge = {
      ...edge,
      sourceChunk,
      targetChunk
    }
    this.crossEdges.set(edge.id, crossEdge)
    getOrCreateSet(this.crossEdgeIdsByChunk, sourceChunk).add(edge.id)
    getOrCreateSet(this.crossEdgeIdsByChunk, targetChunk).add(edge.id)
    this.edgeLocations.set(edge.id, {
      kind: 'cross',
      sourceChunk,
      targetChunk
    })
  }
}

export function createFlatCanvasChunkStore(ydoc: Y.Doc): FlatCanvasChunkStore {
  return new FlatCanvasChunkStore(ydoc)
}
