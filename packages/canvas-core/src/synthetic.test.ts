import { describe, expect, it } from 'vitest'
import { createWorldPointFromCanvasPoint } from './coordinates'
import { createSyntheticCanvasScene } from './synthetic'

describe('createSyntheticCanvasScene', () => {
  it('simulates a billion-object world without returning a billion records', async () => {
    const scene = createSyntheticCanvasScene({
      objectCount: 1_000_000_000,
      seed: 42
    })
    const summary = await scene.provider.getMinimapSummary({
      widthPx: 240,
      heightPx: 160,
      maxTileSummaries: 128
    })

    expect(scene.estimateObjectCount()).toBe(1_000_000_000)
    expect(summary.mode).toBe('huge-scene')
    expect(summary.tiles.length).toBeLessThanOrEqual(128)
    expect(summary.totalObjectCount).toBeGreaterThan(0)
  })

  it('emits viewport vector tiles through the provider contract', () => {
    const scene = createSyntheticCanvasScene({
      objectCount: 10_000,
      seed: 7
    })
    let snapshotVectorTileCount = 0

    const unsubscribe = scene.provider.subscribeViewport(
      {
        viewport: {
          center: createWorldPointFromCanvasPoint({ x: 0, y: 0 }),
          widthPx: 1200,
          heightPx: 800,
          zoom: 1,
          velocityPxPerMs: { x: 0, y: 0 }
        },
        interaction: {
          selectedObjectIds: []
        },
        budgets: {
          maxLiveDom: 8,
          maxShellDom: 64,
          maxTextureBytes: 64 * 1024 * 1024,
          maxDecodedTileBytes: 32 * 1024 * 1024
        }
      },
      (snapshot) => {
        snapshotVectorTileCount = snapshot.vectorTiles.length
      }
    )

    unsubscribe()

    expect(snapshotVectorTileCount).toBeGreaterThan(0)
    expect(snapshotVectorTileCount).toBeLessThanOrEqual(64)
  })
})
