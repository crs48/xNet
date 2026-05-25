import { describe, expect, it } from 'vitest'
import {
  createCanvasDensityGridWithOptionalWasm,
  isCanvasDensityBinningWasmAvailable
} from './wasm-density'

const POINTS = [
  { x: 5, y: 5 },
  { x: 15, y: 5 },
  { x: 5, y: 15 },
  { x: 35, y: 35 },
  { x: 40, y: 40 },
  { x: -10, y: -10 }
]

describe('optional WASM density binning', () => {
  it('matches the TypeScript density-grid baseline', () => {
    const typescript = createCanvasDensityGridWithOptionalWasm({
      points: POINTS,
      bounds: { x: 0, y: 0, width: 40, height: 40 },
      columns: 4,
      rows: 4,
      mode: 'typescript'
    })
    const automatic = createCanvasDensityGridWithOptionalWasm({
      points: POINTS,
      bounds: { x: 0, y: 0, width: 40, height: 40 },
      columns: 4,
      rows: 4,
      mode: 'auto'
    })

    expect(automatic.values).toEqual(typescript.values)
    expect(automatic.columns).toBe(4)
    expect(automatic.rows).toBe(4)
    expect(typescript.backend).toBe('typescript')
  })

  it('uses the WASM prototype when the runtime supports it', () => {
    const grid = createCanvasDensityGridWithOptionalWasm({
      points: POINTS,
      bounds: { x: 0, y: 0, width: 40, height: 40 },
      columns: 4,
      rows: 4,
      mode: 'wasm'
    })

    expect(grid.wasmAvailable).toBe(isCanvasDensityBinningWasmAvailable())
    if (grid.wasmAvailable) {
      expect(grid.backend).toBe('wasm')
    }
    expect(grid.values.reduce((total, value) => total + value, 0)).toBe(POINTS.length)
  })

  it('returns empty grids for invalid bounds without throwing', () => {
    const grid = createCanvasDensityGridWithOptionalWasm({
      points: POINTS,
      bounds: { x: 0, y: 0, width: 0, height: 40 },
      columns: 4,
      rows: 4,
      mode: 'auto'
    })

    expect(grid.values).toEqual(Array.from({ length: 16 }, () => 0))
  })
})
