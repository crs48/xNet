import { describe, expect, it } from 'vitest'
import {
  anchorLocalToWorldPoint,
  createWorldPointFromCanvasPoint,
  normalizeWorldPoint,
  worldPointToAnchorLocal
} from './coordinates'

describe('tile-addressed coordinates', () => {
  it('normalizes positive and negative local coordinates into tile-local space', () => {
    expect(
      normalizeWorldPoint({
        tile: { tx: 0, ty: 0 },
        local: { x: 4097, y: -1 }
      })
    ).toEqual({
      tile: { tx: 1, ty: -1 },
      local: { x: 1, y: 4095 }
    })
  })

  it('converts finite canvas points into tile-addressed world points', () => {
    expect(createWorldPointFromCanvasPoint({ x: -1, y: 8192 })).toEqual({
      tile: { tx: -1, ty: 2 },
      local: { x: 4095, y: 0 }
    })
  })

  it('keeps camera-local math stable at extreme tile coordinates', () => {
    const point = {
      tile: { tx: 1_000_000_001, ty: -1_000_000_000 },
      local: { x: 12, y: 24 }
    }
    const anchor = { tx: 1_000_000_000, ty: -1_000_000_001 }

    expect(worldPointToAnchorLocal(point, anchor)).toEqual({
      x: 4108,
      y: 4120
    })
  })

  it('round-trips anchor-local coordinates through world points', () => {
    const anchor = { tx: -24, ty: 36 }
    const local = { x: 5000, y: -300 }
    const worldPoint = anchorLocalToWorldPoint(local, anchor)

    expect(worldPointToAnchorLocal(worldPoint, anchor)).toEqual(local)
  })
})
