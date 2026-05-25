import type { CanvasTileSummary } from './types'
import { describe, expect, it } from 'vitest'
import {
  createCanvasTileSummaryCacheKey,
  createCanvasTileSummaries,
  createMinimapSummaryFromTileSummaries,
  hasCanvasTileSummaryChanged,
  rollUpCanvasTileSummaries,
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

describe('summary rollups', () => {
  it('rolls child tile summaries into parent summaries', () => {
    const leafSummaries = createCanvasTileSummaries({
      objects: [
        createObject('a', 'page', 10, 10),
        createObject('b', 'shape', 120, 10),
        createObject('c', 'database', 10, 120),
        createObject('d', 'note', 120, 120)
      ],
      edges: [
        { id: 'edge-1', sourceObjectId: 'a', targetObjectId: 'b' },
        { id: 'edge-2', sourceObjectId: 'c', targetObjectId: 'd' }
      ],
      tileSize: 100,
      densityColumns: 2,
      densityRows: 2
    })

    const rollups = rollUpCanvasTileSummaries({
      tiles: leafSummaries,
      densityColumns: 2,
      densityRows: 2
    })

    expect(rollups).toHaveLength(1)
    expect(rollups[0].tileId).toBe('1/0/0')
    expect(rollups[0].objectCount).toBe(4)
    expect(rollups[0].edgeCount).toBe(4)
    expect(rollups[0].typeCounts).toEqual({
      page: 1,
      shape: 1,
      database: 1,
      note: 1
    })
    expect(rollups[0].density.values.reduce((total, value) => total + value, 0)).toBe(4)
    expect(rollups[0].clusters).toHaveLength(4)
  })

  it('rolls negative tile coordinates into stable parent addresses', () => {
    const leafSummaries = createCanvasTileSummaries({
      objects: [createObject('a', 'page', -120, -120), createObject('b', 'shape', -20, -20)],
      tileSize: 100
    })
    const rollups = rollUpCanvasTileSummaries({ tiles: leafSummaries })

    expect(rollups.map((summary) => summary.tileId)).toEqual(['1/-1/-1'])
    expect(rollups[0].objectCount).toBe(2)
  })

  it('generates cache keys that change after create, move, resize, delete, and kind changes', () => {
    const getRollupKey = (objects: readonly CanvasTileSummaryObject[]): string => {
      const [rollup] = rollUpCanvasTileSummaries({
        tiles: createCanvasTileSummaries({ objects, tileSize: 100 })
      })

      return createCanvasTileSummaryCacheKey(rollup)
    }
    const baselineObjects = [createObject('a', 'page', 10, 10), createObject('b', 'shape', 120, 10)]
    const baselineKey = getRollupKey(baselineObjects)

    expect(getRollupKey([...baselineObjects, createObject('c', 'note', 10, 120)])).not.toBe(
      baselineKey
    )
    expect(getRollupKey([createObject('a', 'page', 60, 60), baselineObjects[1]])).not.toBe(
      baselineKey
    )
    expect(
      getRollupKey([
        {
          ...baselineObjects[0],
          position: { ...baselineObjects[0].position, width: 60, height: 80 }
        },
        baselineObjects[1]
      ])
    ).not.toBe(baselineKey)
    expect(getRollupKey([baselineObjects[0]])).not.toBe(baselineKey)
    expect(getRollupKey([createObject('a', 'database', 10, 10), baselineObjects[1]])).not.toBe(
      baselineKey
    )
  })

  it('detects unchanged summary cache keys', () => {
    const [summary] = createCanvasTileSummaries({
      objects: [createObject('a', 'page', 10, 10)],
      tileSize: 100
    })
    const cacheKey = createCanvasTileSummaryCacheKey(summary)

    expect(hasCanvasTileSummaryChanged(summary, cacheKey)).toBe(false)
    expect(hasCanvasTileSummaryChanged({ ...summary, objectCount: 2 }, cacheKey)).toBe(true)
  })
})

describe('minimap summaries', () => {
  it('aggregates high collaborator counts without materializing users', () => {
    const tiles: readonly CanvasTileSummary[] = [
      {
        tileId: '0/0/0',
        address: { z: 0, x: 0, y: 0 },
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        objectCount: 50,
        edgeCount: 10,
        typeCounts: { page: 50 },
        density: { columns: 1, rows: 1, values: [50] },
        clusters: [],
        activePresenceCount: 100,
        dirty: false,
        stale: false
      },
      {
        tileId: '0/1/0',
        address: { z: 0, x: 1, y: 0 },
        bounds: { x: 100, y: 0, width: 100, height: 100 },
        objectCount: 75,
        edgeCount: 15,
        typeCounts: { database: 75 },
        density: { columns: 1, rows: 1, values: [75] },
        clusters: [],
        activePresenceCount: 100,
        dirty: false,
        stale: false
      }
    ]
    const summary = createMinimapSummaryFromTileSummaries(tiles)

    expect(summary.totalObjectCount).toBe(125)
    expect(summary.totalEdgeCount).toBe(25)
    expect(summary.activePresenceCount).toBe(200)
    expect(summary.tiles).toHaveLength(2)
  })
})
