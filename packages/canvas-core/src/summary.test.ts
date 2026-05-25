import { describe, expect, it } from 'vitest'
import {
  createCanvasTileSummaries,
  createMinimapSummaryFromTileSummaries,
  type CanvasTileSummaryObject
} from './summary'

function createObject(
  id: string,
  kind: CanvasTileSummaryObject['kind'],
  x: number,
  y: number
): CanvasTileSummaryObject {
  return {
    id,
    kind,
    position: {
      x,
      y,
      width: 20,
      height: 20
    }
  }
}

describe('tile-summary generation', () => {
  it('bins objects into tile summaries with counts, type histograms, and density grids', () => {
    const summaries = createCanvasTileSummaries({
      objects: [
        createObject('page-1', 'page', 10, 10),
        createObject('shape-1', 'shape', 70, 10),
        createObject('database-1', 'database', 120, 10)
      ],
      tileSize: 100,
      densityColumns: 2,
      densityRows: 2
    })

    expect(summaries).toHaveLength(2)
    expect(summaries[0].tileId).toBe('0/0/0')
    expect(summaries[0].objectCount).toBe(2)
    expect(summaries[0].typeCounts).toEqual({ page: 1, shape: 1 })
    expect(summaries[0].density.values).toEqual([1, 1, 0, 0])
    expect(summaries[1].tileId).toBe('0/1/0')
    expect(summaries[1].typeCounts).toEqual({ database: 1 })
  })

  it('counts cross-tile edge participation on both endpoint tiles', () => {
    const summaries = createCanvasTileSummaries({
      objects: [createObject('a', 'page', 10, 10), createObject('b', 'shape', 120, 10)],
      edges: [{ id: 'edge-1', sourceObjectId: 'a', targetObjectId: 'b' }],
      tileSize: 100
    })

    expect(summaries.map((summary) => summary.edgeCount)).toEqual([1, 1])
    expect(createMinimapSummaryFromTileSummaries(summaries).totalEdgeCount).toBe(2)
  })

  it('counts same-tile edges once for that tile', () => {
    const summaries = createCanvasTileSummaries({
      objects: [createObject('a', 'page', 10, 10), createObject('b', 'shape', 40, 10)],
      edges: [{ id: 'edge-1', sourceObjectId: 'a', targetObjectId: 'b' }],
      tileSize: 100
    })

    expect(summaries).toHaveLength(1)
    expect(summaries[0].edgeCount).toBe(1)
  })

  it('limits retained clusters without dropping object counts', () => {
    const summaries = createCanvasTileSummaries({
      objects: [
        createObject('a', 'page', 10, 10),
        createObject('b', 'shape', 20, 10),
        createObject('c', 'note', 30, 10)
      ],
      tileSize: 100,
      maxClustersPerTile: 2
    })

    expect(summaries[0].objectCount).toBe(3)
    expect(summaries[0].clusters.map((cluster) => cluster.id)).toEqual(['a', 'b'])
  })

  it('handles empty scenes', () => {
    expect(createCanvasTileSummaries({ objects: [] })).toEqual([])
  })
})
