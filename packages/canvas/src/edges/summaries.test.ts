import type { CanvasEdge, CanvasNode } from '../types'
import { describe, expect, it } from 'vitest'
import { createCanvasFarZoomEdgeSummaries, createCanvasMinimapRelationshipHints } from './summaries'

function createNode(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    type: 'note',
    position: { x, y, width: 100, height: 60 },
    properties: {}
  }
}

function createEdge(
  id: string,
  sourceId: string,
  targetId: string,
  relationship: NonNullable<CanvasEdge['relationship']>
): CanvasEdge {
  return {
    id,
    source: { objectId: sourceId },
    target: { objectId: targetId },
    relationship
  }
}

describe('edge far-zoom summaries', () => {
  it('groups semantic edges by relationship and tile pair', () => {
    const nodes = [
      createNode('source-1', 0, 0),
      createNode('source-2', 100, 0),
      createNode('target-1', 4200, 0),
      createNode('target-2', 4400, 100)
    ]
    const edges = [
      createEdge('edge-2', 'source-2', 'target-2', {
        kind: 'depends-on',
        direction: 'directed',
        label: 'Needs'
      }),
      createEdge('edge-1', 'source-1', 'target-1', {
        kind: 'depends-on',
        direction: 'directed',
        label: 'Needs'
      })
    ]

    const summaries = createCanvasFarZoomEdgeSummaries({
      nodes,
      edges,
      tileSize: 2048,
      maxSampleEdges: 1
    })

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      relationshipKind: 'depends-on',
      connectorKind: 'dependency',
      label: 'Needs',
      sourceTileId: '0/0/0',
      targetTileId: '0/2/0',
      edgeCount: 2,
      stroke: '#dc2626',
      markerEnd: 'arrow'
    })
    expect(summaries[0]?.sampleEdgeIds).toEqual(['edge-1'])
    expect(summaries[0]?.sourceObjectIds).toEqual(['source-1', 'source-2'])
    expect(summaries[0]?.targetObjectIds).toEqual(['target-1', 'target-2'])
    expect(summaries[0]?.sourceCentroid).toEqual({ x: 100, y: 30 })
    expect(summaries[0]?.targetCentroid).toEqual({ x: 4350, y: 80 })
  })

  it('skips edges with missing endpoint nodes', () => {
    const summaries = createCanvasFarZoomEdgeSummaries({
      nodes: [createNode('source', 0, 0)],
      edges: [
        createEdge('missing-target', 'source', 'missing', {
          kind: 'references',
          direction: 'directed'
        })
      ]
    })

    expect(summaries).toEqual([])
  })
})

describe('minimap relationship hints', () => {
  it('creates weighted minimap hints from far-zoom summaries', () => {
    const summaries = createCanvasFarZoomEdgeSummaries({
      nodes: [createNode('a', 0, 0), createNode('b', 5000, 0), createNode('c', 10000, 0)],
      edges: [
        createEdge('edge-1', 'a', 'b', { kind: 'references', direction: 'directed' }),
        createEdge('edge-2', 'a', 'b', { kind: 'references', direction: 'directed' }),
        createEdge('edge-3', 'a', 'c', { kind: 'blocks', direction: 'directed' })
      ],
      tileSize: 2048
    })

    const hints = createCanvasMinimapRelationshipHints({
      summaries,
      maxHints: 1,
      minEdgeCount: 2
    })

    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      relationshipKind: 'references',
      label: 'References (2)',
      edgeCount: 2,
      stroke: '#2563eb',
      markerEnd: 'arrow',
      opacity: 0.72
    })
  })
})
