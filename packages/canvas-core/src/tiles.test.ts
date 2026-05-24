import { describe, expect, it } from 'vitest'
import {
  createTileId,
  getTileBounds,
  getTileCoverageForRect,
  listTileAddresses,
  parseTileId
} from './tiles'

describe('tile addressing', () => {
  it('serializes and parses signed tile ids', () => {
    const address = { z: 3, x: -12, y: 48 }

    expect(parseTileId(createTileId(address))).toEqual(address)
    expect(parseTileId('not/a/tile/id')).toBeNull()
  })

  it('calculates bounds for negative tile coordinates', () => {
    expect(getTileBounds({ z: 0, x: -2, y: 3 })).toEqual({
      x: -8192,
      y: 12288,
      width: 4096,
      height: 4096
    })
  })

  it('queries coverage across negative coordinates and exact boundaries', () => {
    expect(getTileCoverageForRect({ x: -1, y: -1, width: 4097, height: 4097 })).toEqual({
      z: 0,
      minX: -1,
      minY: -1,
      maxX: 0,
      maxY: 0,
      count: 4
    })

    expect(getTileCoverageForRect({ x: 4096, y: 0, width: 4096, height: 4096 })).toEqual({
      z: 0,
      minX: 1,
      minY: 0,
      maxX: 1,
      maxY: 0,
      count: 1
    })
  })

  it('lists tile addresses with an explicit cap', () => {
    const coverage = getTileCoverageForRect({ x: 0, y: 0, width: 9000, height: 9000 })

    expect(listTileAddresses(coverage, 3)).toEqual([
      { z: 0, x: 0, y: 0 },
      { z: 0, x: 1, y: 0 },
      { z: 0, x: 2, y: 0 }
    ])
  })
})
