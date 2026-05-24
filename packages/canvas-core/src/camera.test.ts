import { describe, expect, it } from 'vitest'
import {
  createCanvasCamera,
  getCameraVisibleTileCoverage,
  screenToWorldPoint,
  worldToScreenPoint
} from './camera'

describe('Canvas v3 camera', () => {
  it('round-trips screen and world points', () => {
    const camera = createCanvasCamera({
      anchorTile: { tx: 10, ty: -5 },
      localCenter: { x: 2048, y: 2048 },
      zoom: 2,
      viewportPx: { width: 800, height: 600 }
    })
    const screen = { x: 600, y: 450 }
    const world = screenToWorldPoint(camera, screen)

    expect(worldToScreenPoint(camera, world)).toEqual(screen)
  })

  it('computes visible tile coverage around an extreme anchor without huge scene materialization', () => {
    const camera = createCanvasCamera({
      anchorTile: { tx: 1_000_000, ty: -1_000_000 },
      localCenter: { x: 2048, y: 2048 },
      zoom: 0.5,
      viewportPx: { width: 4096, height: 4096 }
    })

    expect(getCameraVisibleTileCoverage(camera)).toEqual({
      z: 0,
      minX: 999999,
      minY: -1000001,
      maxX: 1000001,
      maxY: -999999,
      count: 9
    })
  })
})
