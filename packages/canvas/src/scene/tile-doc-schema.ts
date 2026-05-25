/**
 * Canvas v3 tile Y.Doc schema and flat-doc migration helpers.
 */

import type { CanvasEdge, CanvasNode } from '../types'
import type {
  CanvasConnectorRecord,
  CanvasObjectRecord,
  CanvasObjectTombstone,
  Point,
  Rect,
  TileAddress
} from '@xnetjs/canvas-core'
import { DEFAULT_CANVAS_TILE_SIZE, createTileId, getTileCoverageForRect } from '@xnetjs/canvas-core'
import * as Y from 'yjs'
import { getCanvasEdgeNodeIds, resolveCanvasAnchorPoint } from '../edges/bindings'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from './doc-layout'
import { isCanvasObjectKind } from './node-kind'

export const CANVAS_TILE_SCHEMA_VERSION = 3
export const CANVAS_TILE_OBJECTS_MAP_KEY = 'objects'
export const CANVAS_TILE_CONNECTORS_MAP_KEY = 'connectors'
export const CANVAS_TILE_TOMBSTONES_MAP_KEY = 'tombstones'
export const CANVAS_TILE_METADATA_MAP_KEY = 'metadata'

export type CanvasTileDocMaps = {
  objects: Y.Map<CanvasObjectRecord>
  connectors: Y.Map<CanvasConnectorRecord>
  tombstones: Y.Map<CanvasObjectTombstone>
  metadata: Y.Map<unknown>
}

export type CreateCanvasTileDocInput = {
  tileId: string
  address?: TileAddress
  createdAt?: number
}

export type FlatCanvasDocTileConversionInput = {
  sourceDoc: Y.Doc
  tileSize?: number
  z?: number
  nowMs?: number
}

export type FlatCanvasDocTileConversionResult = {
  tileDocs: Map<string, Y.Doc>
  objectTileIds: Map<string, string>
  skippedConnectorIds: readonly string[]
}

export type CanvasTileDocSnapshot = {
  tileId: string
  objects: readonly CanvasObjectRecord[]
  connectors: readonly CanvasConnectorRecord[]
  tombstones: readonly CanvasObjectTombstone[]
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getNodePreview(node: CanvasNode): CanvasObjectRecord['preview'] {
  return {
    title: readString(node.properties.title) ?? node.alias,
    subtitle: readString(node.properties.subtitle),
    sourceVersion: readString(node.properties.sourceVersion),
    thumbnailHash: readString(node.properties.thumbnailHash)
  }
}

function getObjectTileIdFromRect(rect: Rect, tileSize: number, z: number): string {
  const centerRect = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    width: 1,
    height: 1
  }
  const coverage = getTileCoverageForRect(centerRect, tileSize, z)

  return createTileId({
    z,
    x: coverage.minX,
    y: coverage.minY
  })
}

function fallbackAnchor(node: CanvasNode | undefined): Point {
  if (!node) {
    return { x: 0, y: 0 }
  }

  return {
    x: node.position.x + node.position.width / 2,
    y: node.position.y + node.position.height / 2
  }
}

function getEdgeAnchor(input: {
  node: CanvasNode | undefined
  endpoint: CanvasEdge['source'] | CanvasEdge['target']
  otherNode: CanvasNode | undefined
}): Point {
  if (!input.node) {
    return fallbackAnchor(input.node)
  }

  return resolveCanvasAnchorPoint(
    input.node.position,
    input.endpoint,
    input.otherNode ? fallbackAnchor(input.otherNode) : undefined
  )
}

function getOrCreateTileDoc(tileDocs: Map<string, Y.Doc>, tileId: string, nowMs: number): Y.Doc {
  const existing = tileDocs.get(tileId)
  if (existing) {
    return existing
  }

  const doc = createCanvasTileDoc({ tileId, createdAt: nowMs })
  tileDocs.set(tileId, doc)
  return doc
}

export function ensureCanvasTileDocMaps(doc: Y.Doc): CanvasTileDocMaps {
  return {
    objects: doc.getMap<CanvasObjectRecord>(CANVAS_TILE_OBJECTS_MAP_KEY),
    connectors: doc.getMap<CanvasConnectorRecord>(CANVAS_TILE_CONNECTORS_MAP_KEY),
    tombstones: doc.getMap<CanvasObjectTombstone>(CANVAS_TILE_TOMBSTONES_MAP_KEY),
    metadata: doc.getMap(CANVAS_TILE_METADATA_MAP_KEY)
  }
}

export function createCanvasTileDoc(input: CreateCanvasTileDocInput): Y.Doc {
  const doc = new Y.Doc()
  const maps = ensureCanvasTileDocMaps(doc)

  maps.metadata.set('schemaVersion', CANVAS_TILE_SCHEMA_VERSION)
  maps.metadata.set('tileId', input.tileId)
  maps.metadata.set('createdAt', input.createdAt ?? Date.now())
  if (input.address) {
    maps.metadata.set('address', input.address)
  }

  return doc
}

export function canvasNodeToObjectRecord(node: CanvasNode): CanvasObjectRecord {
  const kind = isCanvasObjectKind(node.type) ? node.type : 'shape'

  return {
    id: node.id,
    kind,
    sourceNodeId: node.sourceNodeId ?? node.linkedNodeId,
    sourceSchemaId: node.sourceSchemaId,
    position: {
      x: node.position.x,
      y: node.position.y,
      width: node.position.width,
      height: node.position.height,
      rotation: node.position.rotation,
      zIndex: node.position.zIndex
    },
    display: {
      collapsed: node.display?.collapsed ?? node.position.collapsed,
      styleVariant: node.display?.styleVariant
    },
    preview: getNodePreview(node)
  }
}

export function canvasEdgeToConnectorRecord(input: {
  edge: CanvasEdge
  nodesById: ReadonlyMap<string, CanvasNode>
  objectTileIds: ReadonlyMap<string, string>
  fallbackTileId: string
}): CanvasConnectorRecord | null {
  const [sourceId, targetId] = getCanvasEdgeNodeIds(input.edge)
  if (!sourceId || !targetId) {
    return null
  }

  const sourceNode = input.nodesById.get(sourceId)
  const targetNode = input.nodesById.get(targetId)

  return {
    id: input.edge.id,
    source: {
      objectId: sourceId,
      tileId: input.objectTileIds.get(sourceId) ?? input.fallbackTileId,
      anchor: getEdgeAnchor({
        node: sourceNode,
        endpoint: input.edge.source,
        otherNode: targetNode
      })
    },
    target: {
      objectId: targetId,
      tileId: input.objectTileIds.get(targetId) ?? input.fallbackTileId,
      anchor: getEdgeAnchor({
        node: targetNode,
        endpoint: input.edge.target,
        otherNode: sourceNode
      })
    },
    kind: 'line'
  }
}

export function writeCanvasTileDocSnapshot(doc: Y.Doc, snapshot: CanvasTileDocSnapshot): void {
  const maps = ensureCanvasTileDocMaps(doc)

  doc.transact(() => {
    maps.metadata.set('tileId', snapshot.tileId)
    maps.metadata.set('schemaVersion', CANVAS_TILE_SCHEMA_VERSION)
    snapshot.objects.forEach((object) => maps.objects.set(object.id, object))
    snapshot.connectors.forEach((connector) => maps.connectors.set(connector.id, connector))
    snapshot.tombstones.forEach((tombstone) => maps.tombstones.set(tombstone.objectId, tombstone))
  })
}

export function readCanvasTileDocSnapshot(doc: Y.Doc): CanvasTileDocSnapshot {
  const maps = ensureCanvasTileDocMaps(doc)
  const tileId = readString(maps.metadata.get('tileId')) ?? 'unknown'

  return {
    tileId,
    objects: Array.from(maps.objects.values()),
    connectors: Array.from(maps.connectors.values()),
    tombstones: Array.from(maps.tombstones.values())
  }
}

export function convertFlatCanvasDocToTileDocs(
  input: FlatCanvasDocTileConversionInput
): FlatCanvasDocTileConversionResult {
  const tileSize = input.tileSize ?? DEFAULT_CANVAS_TILE_SIZE
  const z = input.z ?? 0
  const nowMs = input.nowMs ?? Date.now()
  const sourceObjects = getCanvasObjectsMap<CanvasNode>(input.sourceDoc)
  const sourceConnectors = getCanvasConnectorsMap<CanvasEdge>(input.sourceDoc)
  const nodes = Array.from(sourceObjects.values())
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const tileDocs = new Map<string, Y.Doc>()
  const objectTileIds = new Map<string, string>()
  const skippedConnectorIds: string[] = []

  nodes.forEach((node) => {
    const object = canvasNodeToObjectRecord(node)
    const tileId = getObjectTileIdFromRect(object.position, tileSize, z)
    const doc = getOrCreateTileDoc(tileDocs, tileId, nowMs)
    const maps = ensureCanvasTileDocMaps(doc)

    maps.objects.set(object.id, object)
    objectTileIds.set(object.id, tileId)
  })

  sourceConnectors.forEach((edge, edgeId) => {
    const [sourceId] = getCanvasEdgeNodeIds(edge)
    const fallbackTileId = sourceId ? objectTileIds.get(sourceId) : undefined
    if (!fallbackTileId) {
      skippedConnectorIds.push(edgeId)
      return
    }

    const connector = canvasEdgeToConnectorRecord({
      edge,
      nodesById,
      objectTileIds,
      fallbackTileId
    })
    if (!connector) {
      skippedConnectorIds.push(edgeId)
      return
    }

    const doc = getOrCreateTileDoc(tileDocs, fallbackTileId, nowMs)
    ensureCanvasTileDocMaps(doc).connectors.set(connector.id, connector)
  })

  return {
    tileDocs,
    objectTileIds,
    skippedConnectorIds
  }
}
