/**
 * Canvas v3 tile Y.Doc schema tests.
 */

import type { CanvasEdge, CanvasNode } from '../types'
import * as Y from 'yjs'
import { createCanvasEdgeEndpoint } from '../edges/bindings'
import { createCanvasEdgeRelationship } from '../edges/relationships'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from '../scene/doc-layout'
import {
  CANVAS_TILE_SCHEMA_VERSION,
  canvasEdgeToConnectorRecord,
  canvasNodeToObjectRecord,
  convertFlatCanvasDocToTileDocs,
  createCanvasTileDoc,
  ensureCanvasTileDocMaps,
  readCanvasTileDocSnapshot,
  writeCanvasTileDocSnapshot
} from '../scene/tile-doc-schema'

function createNode(
  id: string,
  x: number,
  y: number,
  type: CanvasNode['type'] = 'page'
): CanvasNode {
  return {
    id,
    type,
    sourceNodeId: `source-${id}`,
    sourceSchemaId: `schema-${type}`,
    display: { collapsed: false, styleVariant: 'default' },
    position: { x, y, width: 200, height: 100, zIndex: 3 },
    properties: {
      title: `Title ${id}`,
      subtitle: `Subtitle ${id}`,
      sourceVersion: `version-${id}`,
      thumbnailHash: `thumbnail-${id}`
    }
  }
}

function createEdge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return {
    id,
    sourceId,
    targetId,
    source: createCanvasEdgeEndpoint(sourceId, { placement: 'right' }),
    target: createCanvasEdgeEndpoint(targetId, { placement: 'left' })
  }
}

describe('Canvas tile Y.Doc schema', () => {
  it('creates typed tile docs with schema metadata', () => {
    const doc = createCanvasTileDoc({
      tileId: '0/1/2',
      address: { z: 0, x: 1, y: 2 },
      createdAt: 1_000
    })
    const maps = ensureCanvasTileDocMaps(doc)

    expect(maps.metadata.get('schemaVersion')).toBe(CANVAS_TILE_SCHEMA_VERSION)
    expect(maps.metadata.get('tileId')).toBe('0/1/2')
    expect(maps.metadata.get('address')).toEqual({ z: 0, x: 1, y: 2 })
  })

  it('round-trips tile snapshots through object, connector, and tombstone maps', () => {
    const doc = createCanvasTileDoc({ tileId: '0/0/0', createdAt: 1_000 })
    const object = canvasNodeToObjectRecord(createNode('a', 0, 0))
    const connector = {
      id: 'edge-1',
      source: { objectId: 'a', tileId: '0/0/0', anchor: { x: 200, y: 50 } },
      target: { objectId: 'b', tileId: '0/0/0', anchor: { x: 300, y: 50 } },
      kind: 'line' as const
    }

    writeCanvasTileDocSnapshot(doc, {
      tileId: '0/0/0',
      objects: [object],
      connectors: [connector],
      tombstones: [
        {
          objectId: 'old-a',
          moveId: 'move-1',
          sourceTileId: '0/0/0',
          targetTileId: '0/1/0',
          deletedAt: 1_100
        }
      ]
    })

    expect(readCanvasTileDocSnapshot(doc)).toEqual({
      tileId: '0/0/0',
      objects: [object],
      connectors: [connector],
      tombstones: [
        {
          objectId: 'old-a',
          moveId: 'move-1',
          sourceTileId: '0/0/0',
          targetTileId: '0/1/0',
          deletedAt: 1_100
        }
      ]
    })
  })

  it('adapts flat canvas nodes to Canvas v3 object records', () => {
    expect(canvasNodeToObjectRecord(createNode('a', 10, 20, 'database'))).toEqual({
      id: 'a',
      kind: 'database',
      sourceNodeId: 'source-a',
      sourceSchemaId: 'schema-database',
      position: { x: 10, y: 20, width: 200, height: 100, zIndex: 3 },
      display: { collapsed: false, styleVariant: 'default' },
      preview: {
        title: 'Title a',
        subtitle: 'Subtitle a',
        sourceVersion: 'version-a',
        thumbnailHash: 'thumbnail-a'
      }
    })
    expect(canvasNodeToObjectRecord(createNode('legacy', 0, 0, 'card')).kind).toBe('shape')
  })

  it('normalizes missing or invalid node dimensions during flat-doc migration', () => {
    const node = {
      ...createNode('partial', 20, 30, 'page'),
      position: { x: 20, y: 30 } as CanvasNode['position']
    }

    expect(canvasNodeToObjectRecord(node).position).toEqual({
      x: 20,
      y: 30,
      width: 360,
      height: 220,
      zIndex: 0
    })

    expect(
      canvasNodeToObjectRecord({
        ...createNode('invalid', 0, 0, 'shape'),
        position: {
          x: Number.NaN,
          y: Number.NaN,
          width: 0,
          height: Number.NaN,
          rotation: Number.NaN,
          zIndex: Number.NaN
        }
      }).position
    ).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      zIndex: 0
    })
  })

  it('adapts flat canvas edges to connector records with tile endpoints', () => {
    const sourceNode = createNode('a', 0, 0)
    const targetNode = createNode('b', 400, 0)
    const nodesById = new Map([
      ['a', sourceNode],
      ['b', targetNode]
    ])
    const connector = canvasEdgeToConnectorRecord({
      edge: createEdge('edge-1', 'a', 'b'),
      nodesById,
      objectTileIds: new Map([
        ['a', '0/0/0'],
        ['b', '0/1/0']
      ]),
      fallbackTileId: '0/0/0'
    })

    expect(connector).toEqual({
      id: 'edge-1',
      source: { objectId: 'a', tileId: '0/0/0', anchor: { x: 200, y: 50 } },
      target: { objectId: 'b', tileId: '0/1/0', anchor: { x: 400, y: 50 } },
      kind: 'line'
    })
  })

  it('maps semantic edge relationships into connector record kinds', () => {
    const sourceNode = createNode('a', 0, 0)
    const targetNode = createNode('b', 400, 0)
    const connector = canvasEdgeToConnectorRecord({
      edge: {
        ...createEdge('edge-1', 'a', 'b'),
        relationship: createCanvasEdgeRelationship({ kind: 'depends-on' })
      },
      nodesById: new Map([
        ['a', sourceNode],
        ['b', targetNode]
      ]),
      objectTileIds: new Map([
        ['a', '0/0/0'],
        ['b', '0/1/0']
      ]),
      fallbackTileId: '0/0/0'
    })

    expect(connector?.kind).toBe('dependency')
  })

  it('falls back to node centers for legacy edges without endpoint records', () => {
    const sourceNode = createNode('a', 0, 0)
    const targetNode = createNode('b', 400, 0)
    const connector = canvasEdgeToConnectorRecord({
      edge: {
        id: 'edge-legacy',
        sourceId: 'a',
        targetId: 'b'
      },
      nodesById: new Map([
        ['a', sourceNode],
        ['b', targetNode]
      ]),
      objectTileIds: new Map([
        ['a', '0/0/0'],
        ['b', '0/1/0']
      ]),
      fallbackTileId: '0/0/0'
    })

    expect(connector?.source.anchor).toEqual({ x: 100, y: 50 })
    expect(connector?.target.anchor).toEqual({ x: 500, y: 50 })
  })

  it('converts flat canvas docs into primary tile docs', () => {
    const doc = new Y.Doc()
    const objects = getCanvasObjectsMap<CanvasNode>(doc)
    const connectors = getCanvasConnectorsMap<CanvasEdge>(doc)
    objects.set('a', createNode('a', 0, 0))
    objects.set('b', createNode('b', 5000, 0))
    connectors.set('edge-1', createEdge('edge-1', 'a', 'b'))

    const result = convertFlatCanvasDocToTileDocs({
      sourceDoc: doc,
      tileSize: 4096,
      nowMs: 1_000
    })

    expect(Array.from(result.objectTileIds.entries())).toEqual([
      ['a', '0/0/0'],
      ['b', '0/1/0']
    ])
    expect(result.skippedConnectorIds).toEqual([])
    expect(Array.from(result.tileDocs.keys()).sort()).toEqual(['0/0/0', '0/1/0'])
    expect(readCanvasTileDocSnapshot(result.tileDocs.get('0/0/0')!).objects).toHaveLength(1)
    expect(readCanvasTileDocSnapshot(result.tileDocs.get('0/0/0')!).connectors).toEqual([
      expect.objectContaining({
        id: 'edge-1',
        source: expect.objectContaining({ tileId: '0/0/0' }),
        target: expect.objectContaining({ tileId: '0/1/0' })
      })
    ])
    expect(readCanvasTileDocSnapshot(result.tileDocs.get('0/1/0')!).objects).toHaveLength(1)
  })
})
