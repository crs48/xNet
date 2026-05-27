/**
 * Optional WASM density-grid binning prototype for Canvas v3.
 */

import type { CanvasDensityGrid, Point, Rect } from './types'

export type CanvasDensityBinningMode = 'auto' | 'typescript' | 'wasm'
export type CanvasDensityBinningBackend = 'typescript' | 'wasm'

export type CanvasDensityGridBinningInput = {
  points: readonly Point[]
  bounds: Rect
  columns?: number
  rows?: number
  mode?: CanvasDensityBinningMode
}

export type CanvasDensityGridBinningResult = CanvasDensityGrid & {
  backend: CanvasDensityBinningBackend
  wasmAvailable: boolean
}

type WasmDensityBinFunction = (
  x: number,
  y: number,
  minX: number,
  minY: number,
  cellWidth: number,
  cellHeight: number,
  columns: number
) => number

type WasmDensityExports = {
  bin: WasmDensityBinFunction
}

const DEFAULT_DENSITY_COLUMNS = 8
const DEFAULT_DENSITY_ROWS = 8

const WASM_DENSITY_BIN_BYTES = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x0c, 0x01, 0x60, 0x07, 0x7c, 0x7c, 0x7c,
  0x7c, 0x7c, 0x7c, 0x7f, 0x01, 0x7f, 0x03, 0x02, 0x01, 0x00, 0x07, 0x07, 0x01, 0x03, 0x62, 0x69,
  0x6e, 0x00, 0x00, 0x0a, 0x1a, 0x01, 0x18, 0x00, 0x20, 0x01, 0x20, 0x03, 0xa1, 0x20, 0x05, 0xa3,
  0xaa, 0x20, 0x06, 0x6c, 0x20, 0x00, 0x20, 0x02, 0xa1, 0x20, 0x04, 0xa3, 0xaa, 0x6a, 0x0b
])

let cachedWasmExports: WasmDensityExports | null | undefined

function sanitizeGridAxis(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value ?? fallback)) : fallback
}

function clampIndex(index: number, limit: number): number {
  return Math.max(0, Math.min(limit - 1, index))
}

function createEmptyValues(columns: number, rows: number): number[] {
  return Array.from({ length: columns * rows }, () => 0)
}

function getWasmDensityExports(): WasmDensityExports | null {
  if (cachedWasmExports !== undefined) {
    return cachedWasmExports
  }

  if (typeof WebAssembly === 'undefined') {
    cachedWasmExports = null
    return cachedWasmExports
  }

  try {
    const module = new WebAssembly.Module(WASM_DENSITY_BIN_BYTES)
    const instance = new WebAssembly.Instance(module)
    const bin = instance.exports.bin

    cachedWasmExports = typeof bin === 'function' ? { bin: bin as WasmDensityBinFunction } : null
  } catch {
    cachedWasmExports = null
  }

  return cachedWasmExports
}

export function isCanvasDensityBinningWasmAvailable(): boolean {
  return getWasmDensityExports() !== null
}

function binDensityGridWithTypeScript(input: {
  points: readonly Point[]
  bounds: Rect
  columns: number
  rows: number
}): CanvasDensityGrid {
  const values = createEmptyValues(input.columns, input.rows)
  const cellWidth = input.bounds.width / input.columns
  const cellHeight = input.bounds.height / input.rows

  if (cellWidth <= 0 || cellHeight <= 0) {
    return {
      columns: input.columns,
      rows: input.rows,
      values
    }
  }

  input.points.forEach((point) => {
    const column = clampIndex(Math.floor((point.x - input.bounds.x) / cellWidth), input.columns)
    const row = clampIndex(Math.floor((point.y - input.bounds.y) / cellHeight), input.rows)

    values[row * input.columns + column] += 1
  })

  return {
    columns: input.columns,
    rows: input.rows,
    values
  }
}

function binDensityGridWithWasm(input: {
  points: readonly Point[]
  bounds: Rect
  columns: number
  rows: number
  bin: WasmDensityBinFunction
}): CanvasDensityGrid {
  const values = createEmptyValues(input.columns, input.rows)
  const cellWidth = input.bounds.width / input.columns
  const cellHeight = input.bounds.height / input.rows

  if (cellWidth <= 0 || cellHeight <= 0) {
    return {
      columns: input.columns,
      rows: input.rows,
      values
    }
  }

  input.points.forEach((point) => {
    const rawIndex = input.bin(
      point.x,
      point.y,
      input.bounds.x,
      input.bounds.y,
      cellWidth,
      cellHeight,
      input.columns
    )
    const index = clampIndex(rawIndex, values.length)

    values[index] += 1
  })

  return {
    columns: input.columns,
    rows: input.rows,
    values
  }
}

export function createCanvasDensityGridWithOptionalWasm(
  input: CanvasDensityGridBinningInput
): CanvasDensityGridBinningResult {
  const columns = sanitizeGridAxis(input.columns, DEFAULT_DENSITY_COLUMNS)
  const rows = sanitizeGridAxis(input.rows, DEFAULT_DENSITY_ROWS)
  const wasm = getWasmDensityExports()
  const useWasm = input.mode !== 'typescript' && wasm !== null
  const grid = useWasm
    ? binDensityGridWithWasm({
        points: input.points,
        bounds: input.bounds,
        columns,
        rows,
        bin: wasm.bin
      })
    : binDensityGridWithTypeScript({
        points: input.points,
        bounds: input.bounds,
        columns,
        rows
      })

  return {
    ...grid,
    backend: useWasm ? 'wasm' : 'typescript',
    wasmAvailable: wasm !== null
  }
}
