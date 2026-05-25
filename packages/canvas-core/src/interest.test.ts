import type { ViewportInterest } from './provider'
import { describe, expect, it } from 'vitest'
import { createViewportTileSubscriptionPlan, DEFAULT_INTEREST_PREFETCH_MS } from './interest'

function createInterest(
  input: {
    centerTile?: { tx: number; ty: number }
    centerLocal?: { x: number; y: number }
    widthPx?: number
    heightPx?: number
    zoom?: number
    velocityPxPerMs?: { x: number; y: number }
  } = {}
): ViewportInterest {
  return {
    viewport: {
      center: {
        tile: input.centerTile ?? { tx: 0, ty: 0 },
        local: input.centerLocal ?? { x: 50, y: 50 }
      },
      widthPx: input.widthPx ?? 100,
      heightPx: input.heightPx ?? 100,
      zoom: input.zoom ?? 1,
      velocityPxPerMs: input.velocityPxPerMs ?? { x: 0, y: 0 }
    },
    interaction: {
      selectedObjectIds: []
    },
    budgets: {
      maxLiveDom: 16,
      maxShellDom: 64,
      maxTextureBytes: 32 * 1024 * 1024,
      maxDecodedTileBytes: 8 * 1024 * 1024
    }
  }
}

describe('viewport-interest tile subscription planning', () => {
  it('includes visible tiles plus a configurable halo', () => {
    const plan = createViewportTileSubscriptionPlan({
      interest: createInterest(),
      tileSize: 100,
      haloTiles: 1,
      velocityPrefetchMs: 0
    })

    expect(plan.visibleTileIds).toEqual(['0/0/0'])
    expect(plan.subscribedTileIds).toHaveLength(9)
    expect(plan.prefetchTileIds).toContain('0/-1/-1')
    expect(plan.prefetchTileIds).toContain('0/1/1')
    expect(plan.clipped).toBe(false)
  })

  it('extends prefetch coverage in the viewport velocity direction', () => {
    const plan = createViewportTileSubscriptionPlan({
      interest: createInterest({
        velocityPxPerMs: { x: 1, y: -0.5 }
      }),
      tileSize: 100,
      haloTiles: 0,
      velocityPrefetchMs: DEFAULT_INTEREST_PREFETCH_MS
    })

    expect(plan.prefetchCoverage.maxX).toBe(2)
    expect(plan.prefetchCoverage.minY).toBe(-1)
    expect(plan.subscribedTileIds).toContain('0/2/0')
    expect(plan.subscribedTileIds).toContain('0/0/-1')
    expect(plan.subscribedTileIds).not.toContain('0/-1/0')
  })

  it('reports entered, retained, and exited tile deltas', () => {
    const plan = createViewportTileSubscriptionPlan({
      interest: createInterest(),
      previousTileIds: ['0/0/0', '0/4/4'],
      tileSize: 100,
      haloTiles: 1,
      velocityPrefetchMs: 0
    })

    expect(plan.enteredTileIds).toContain('0/-1/-1')
    expect(plan.retainedTileIds).toEqual(['0/0/0'])
    expect(plan.exitedTileIds).toEqual(['0/4/4'])
  })

  it('clips large subscription sets while keeping the center tile first', () => {
    const plan = createViewportTileSubscriptionPlan({
      interest: createInterest(),
      tileSize: 100,
      haloTiles: 4,
      velocityPrefetchMs: 0,
      maxSubscribedTiles: 4
    })

    expect(plan.subscribedTileIds).toHaveLength(4)
    expect(plan.subscribedTileIds[0]).toBe('0/0/0')
    expect(plan.clipped).toBe(true)
  })

  it('handles huge tile coordinates without materializing full worlds', () => {
    const plan = createViewportTileSubscriptionPlan({
      interest: createInterest({
        centerTile: { tx: 1_000_000, ty: -1_000_000 },
        centerLocal: { x: 50, y: 50 },
        widthPx: 20,
        heightPx: 20
      }),
      tileSize: 100,
      haloTiles: 1,
      velocityPrefetchMs: 0
    })

    expect(plan.visibleTileIds).toEqual(['0/1000000/-1000000'])
    expect(plan.subscribedTileIds).toContain('0/1000001/-999999')
  })
})
