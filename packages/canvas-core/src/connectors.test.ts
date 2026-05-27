import type { CanvasConnectorRecord } from './provider'
import { describe, expect, it } from 'vitest'
import { createConnectorStoragePlan, createFarFieldEdgeSummaries } from './connectors'

function createConnector(input: {
  id: string
  sourceTileId: string
  targetTileId: string
  sourceX?: number
  sourceY?: number
  targetX?: number
  targetY?: number
}): CanvasConnectorRecord {
  return {
    id: input.id,
    kind: 'line',
    source: {
      objectId: `${input.id}:source`,
      tileId: input.sourceTileId,
      anchor: {
        x: input.sourceX ?? 0,
        y: input.sourceY ?? 0
      }
    },
    target: {
      objectId: `${input.id}:target`,
      tileId: input.targetTileId,
      anchor: {
        x: input.targetX ?? 100,
        y: input.targetY ?? 100
      }
    }
  }
}

describe('connector storage', () => {
  it('keeps same-tile connectors in the local tile', () => {
    expect(
      createConnectorStoragePlan(
        createConnector({
          id: 'connector-1',
          sourceTileId: '0/0/0',
          targetTileId: '0/0/0'
        })
      )
    ).toEqual({
      connectorId: 'connector-1',
      storageKey: '0/0/0',
      storageKind: 'local-tile',
      sourceTileId: '0/0/0',
      targetTileId: '0/0/0',
      crossTile: false
    })
  })

  it('stores positive neighboring cross-tile connectors in their common ancestor tile', () => {
    expect(
      createConnectorStoragePlan(
        createConnector({
          id: 'connector-1',
          sourceTileId: '0/0/0',
          targetTileId: '0/1/0'
        })
      )
    ).toMatchObject({
      storageKey: '1/0/0',
      storageKind: 'ancestor-tile',
      crossTile: true
    })
  })

  it('falls back to a deterministic tile-pair shard for non-converging signed tiles', () => {
    expect(
      createConnectorStoragePlan(
        createConnector({
          id: 'connector-1',
          sourceTileId: '0/-1/0',
          targetTileId: '0/0/0'
        }),
        { maxAncestorZoom: 4 }
      )
    ).toMatchObject({
      storageKey: 'tile-pair:0/-1/0|0/0/0',
      storageKind: 'tile-pair',
      crossTile: true
    })
  })

  it('summarizes far-field connectors by storage key and endpoint tile pair', () => {
    const summaries = createFarFieldEdgeSummaries(
      [
        createConnector({
          id: 'connector-2',
          sourceTileId: '0/0/0',
          targetTileId: '0/1/0',
          sourceX: 10,
          sourceY: 10,
          targetX: 120,
          targetY: 20
        }),
        createConnector({
          id: 'connector-1',
          sourceTileId: '0/0/0',
          targetTileId: '0/1/0',
          sourceX: 20,
          sourceY: 30,
          targetX: 160,
          targetY: 50
        }),
        createConnector({
          id: 'local-connector',
          sourceTileId: '0/0/0',
          targetTileId: '0/0/0'
        })
      ],
      { maxSampleConnectors: 1 }
    )

    expect(summaries).toEqual([
      {
        storageKey: '1/0/0',
        sourceTileId: '0/0/0',
        targetTileId: '0/1/0',
        connectorCount: 2,
        bounds: {
          x: 10,
          y: 10,
          width: 150,
          height: 40
        },
        sampleConnectorIds: ['connector-1']
      }
    ])
  })
})
