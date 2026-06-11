/**
 * Repeatable Canvas v3 benchmark helpers for synthetic worlds and worker payloads.
 */

import type { CanvasTileSummaryObject } from './summary'
import type { CanvasObjectKind, MinimapSummaryMode, Rect } from './types'
import { createSyntheticCanvasScene } from './synthetic'
import {
  createTransferableCanvasObjectPayload,
  decodeTransferableCanvasObjectPayload
} from './workers'

const DEFAULT_WORKER_TRANSFER_OBJECT_COUNT = 10_000
const DEFAULT_WORKER_TRANSFER_ITERATIONS = 5
const DEFAULT_WORKER_TRANSFER_WARMUPS = 1
const DEFAULT_SYNTHETIC_WORLD_OBJECT_COUNTS = [1_000_000, 100_000_000, 1_000_000_000]
const DEFAULT_SYNTHETIC_MAX_TILE_SUMMARIES = 128
const JSON_ENCODER = new TextEncoder()

const BENCHMARK_OBJECT_KINDS: readonly CanvasObjectKind[] = [
  'page',
  'database',
  'external-reference',
  'media',
  'shape',
  'note',
  'group',
  'task'
]

export type BenchmarkClock = () => number

export type CanvasWorkerTransferBenchmarkObjectsInput = {
  objectCount: number
  seed?: number
}

export type CanvasObjectTransferPayloadProfile = {
  objectCount: number
  binaryByteLength: number
  jsonByteLength: number
  binaryBytesPerObject: number
  jsonBytesPerObject: number
  jsonToBinaryByteRatio: number
  transferableBytes: number
}

export type CanvasWorkerTransferBenchmarkInput = {
  objects?: readonly CanvasTileSummaryObject[]
  objectCount?: number
  iterations?: number
  warmupIterations?: number
  seed?: number
  clock?: BenchmarkClock
}

export type CanvasWorkerTransferOverheadMeasurement = CanvasObjectTransferPayloadProfile & {
  iterations: number
  warmupIterations: number
  valid: boolean
  errors: readonly string[]
  binaryEncodeMsAvg: number
  binaryDecodeMsAvg: number
  jsonEncodeMsAvg: number
  jsonDecodeMsAvg: number
}

export type SyntheticCanvasWorldBenchmarkInput = {
  objectCounts?: readonly number[]
  maxTileSummaries?: number
  widthPx?: number
  heightPx?: number
  seed?: number
  clock?: BenchmarkClock
}

export type SyntheticCanvasWorldBenchmarkResult = {
  objectCount: number
  mode: MinimapSummaryMode
  tileSummaryCount: number
  totalObjectCount: number
  totalEdgeCount: number
  durationMs: number
  worldBounds: Rect
}

type TimedResult<T> = {
  value: T
  durationMs: number
}

type JsonEncodeResult = {
  json: string
  byteLength: number
}

type JsonDecodeResult = {
  valid: boolean
  objectCount: number
  errors: readonly string[]
}

type TransferBenchmarkIteration = {
  valid: boolean
  errors: readonly string[]
  binaryEncodeMs: number
  binaryDecodeMs: number
  jsonEncodeMs: number
  jsonDecodeMs: number
}

function readNow(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
}

function sanitizeCount(count: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
}

function sanitizeIterationCount(count: number | undefined, fallback: number): number {
  return Math.max(1, sanitizeCount(count ?? fallback))
}

function createBenchmarkClock(clock?: BenchmarkClock): BenchmarkClock {
  return clock ?? readNow
}

function measure<T>(clock: BenchmarkClock, operation: () => T): TimedResult<T> {
  const startedAt = clock()
  const value = operation()
  const finishedAt = clock()

  return {
    value,
    durationMs: Math.max(0, finishedAt - startedAt)
  }
}

function average(total: number, count: number): number {
  return count > 0 ? total / count : 0
}

function createJsonDecodeResult(json: string): JsonDecodeResult {
  try {
    const decoded = JSON.parse(json) as unknown

    return {
      valid: Array.isArray(decoded),
      objectCount: Array.isArray(decoded) ? decoded.length : 0,
      errors: Array.isArray(decoded) ? [] : ['JSON payload did not decode to an array.']
    }
  } catch (error) {
    return {
      valid: false,
      objectCount: 0,
      errors: [error instanceof Error ? error.message : String(error)]
    }
  }
}

function runTransferBenchmarkIteration(
  objects: readonly CanvasTileSummaryObject[],
  clock: BenchmarkClock
): TransferBenchmarkIteration {
  const binaryEncode = measure(clock, () => createTransferableCanvasObjectPayload(objects))
  const binaryDecode = measure(clock, () =>
    decodeTransferableCanvasObjectPayload(binaryEncode.value)
  )
  const jsonEncode = measure<JsonEncodeResult>(clock, () => {
    const json = JSON.stringify(objects)

    return {
      json,
      byteLength: JSON_ENCODER.encode(json).byteLength
    }
  })
  const jsonDecode = measure(clock, () => createJsonDecodeResult(jsonEncode.value.json))
  const jsonCountError =
    jsonDecode.value.objectCount === objects.length
      ? []
      : ['JSON decoded object count did not match input.']
  const errors = [...binaryDecode.value.errors, ...jsonDecode.value.errors, ...jsonCountError]

  return {
    valid: binaryDecode.value.valid && jsonDecode.value.valid && errors.length === 0,
    errors,
    binaryEncodeMs: binaryEncode.durationMs,
    binaryDecodeMs: binaryDecode.durationMs,
    jsonEncodeMs: jsonEncode.durationMs,
    jsonDecodeMs: jsonDecode.durationMs
  }
}

export function createCanvasWorkerTransferBenchmarkObjects(
  input: CanvasWorkerTransferBenchmarkObjectsInput
): readonly CanvasTileSummaryObject[] {
  const objectCount = sanitizeCount(input.objectCount)
  const seed = input.seed ?? 1
  const columns = Math.max(1, Math.ceil(Math.sqrt(objectCount)))

  return Array.from({ length: objectCount }, (_, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const width = 96 + ((index + seed) % 5) * 16
    const height = 72 + ((index * 3 + seed) % 4) * 18

    return {
      id: `benchmark:${seed}:${index}`,
      kind: BENCHMARK_OBJECT_KINDS[(index + seed) % BENCHMARK_OBJECT_KINDS.length],
      position: {
        x: column * 192 + ((seed * 13 + index * 7) % 31),
        y: row * 144 + ((seed * 17 + index * 11) % 29),
        width,
        height
      }
    }
  })
}

export function profileCanvasObjectTransferPayload(
  objects: readonly CanvasTileSummaryObject[]
): CanvasObjectTransferPayloadProfile {
  const binaryPayload = createTransferableCanvasObjectPayload(objects)
  const jsonByteLength = JSON_ENCODER.encode(JSON.stringify(objects)).byteLength
  const objectCount = objects.length

  return {
    objectCount,
    binaryByteLength: binaryPayload.buffer.byteLength,
    jsonByteLength,
    binaryBytesPerObject: objectCount > 0 ? binaryPayload.buffer.byteLength / objectCount : 0,
    jsonBytesPerObject: objectCount > 0 ? jsonByteLength / objectCount : 0,
    jsonToBinaryByteRatio:
      binaryPayload.buffer.byteLength > 0 ? jsonByteLength / binaryPayload.buffer.byteLength : 0,
    transferableBytes: binaryPayload.transferables.reduce(
      (total, transferable) => total + transferable.byteLength,
      0
    )
  }
}

export function measureCanvasWorkerTransferOverhead(
  input: CanvasWorkerTransferBenchmarkInput = {}
): CanvasWorkerTransferOverheadMeasurement {
  const clock = createBenchmarkClock(input.clock)
  const iterations = sanitizeIterationCount(input.iterations, DEFAULT_WORKER_TRANSFER_ITERATIONS)
  const warmupIterations = sanitizeCount(input.warmupIterations ?? DEFAULT_WORKER_TRANSFER_WARMUPS)
  const objects =
    input.objects ??
    createCanvasWorkerTransferBenchmarkObjects({
      objectCount: input.objectCount ?? DEFAULT_WORKER_TRANSFER_OBJECT_COUNT,
      seed: input.seed
    })
  const profile = profileCanvasObjectTransferPayload(objects)

  for (let index = 0; index < warmupIterations; index += 1) {
    runTransferBenchmarkIteration(objects, clock)
  }

  const totals = Array.from({ length: iterations }, () =>
    runTransferBenchmarkIteration(objects, clock)
  ).reduce(
    (accumulator, iteration) => ({
      valid: accumulator.valid && iteration.valid,
      errors: [...accumulator.errors, ...iteration.errors],
      binaryEncodeMs: accumulator.binaryEncodeMs + iteration.binaryEncodeMs,
      binaryDecodeMs: accumulator.binaryDecodeMs + iteration.binaryDecodeMs,
      jsonEncodeMs: accumulator.jsonEncodeMs + iteration.jsonEncodeMs,
      jsonDecodeMs: accumulator.jsonDecodeMs + iteration.jsonDecodeMs
    }),
    {
      valid: true,
      errors: [] as string[],
      binaryEncodeMs: 0,
      binaryDecodeMs: 0,
      jsonEncodeMs: 0,
      jsonDecodeMs: 0
    }
  )

  return {
    ...profile,
    iterations,
    warmupIterations,
    valid: totals.valid,
    errors: totals.errors,
    binaryEncodeMsAvg: average(totals.binaryEncodeMs, iterations),
    binaryDecodeMsAvg: average(totals.binaryDecodeMs, iterations),
    jsonEncodeMsAvg: average(totals.jsonEncodeMs, iterations),
    jsonDecodeMsAvg: average(totals.jsonDecodeMs, iterations)
  }
}

export async function benchmarkSyntheticCanvasWorlds(
  input: SyntheticCanvasWorldBenchmarkInput = {}
): Promise<readonly SyntheticCanvasWorldBenchmarkResult[]> {
  const clock = createBenchmarkClock(input.clock)
  const objectCounts = input.objectCounts ?? DEFAULT_SYNTHETIC_WORLD_OBJECT_COUNTS
  const maxTileSummaries = input.maxTileSummaries ?? DEFAULT_SYNTHETIC_MAX_TILE_SUMMARIES
  const widthPx = input.widthPx ?? 240
  const heightPx = input.heightPx ?? 160
  const seed = input.seed ?? 1

  return objectCounts.reduce<Promise<readonly SyntheticCanvasWorldBenchmarkResult[]>>(
    async (resultsPromise, objectCount, index) => {
      const results = await resultsPromise
      const scene = createSyntheticCanvasScene({
        objectCount,
        seed: seed + index
      })
      const startedAt = clock()
      const summary = await scene.provider.getMinimapSummary({
        widthPx,
        heightPx,
        maxTileSummaries
      })
      const finishedAt = clock()

      return [
        ...results,
        {
          objectCount,
          mode: summary.mode,
          tileSummaryCount: summary.tiles.length,
          totalObjectCount: summary.totalObjectCount,
          totalEdgeCount: summary.totalEdgeCount,
          durationMs: Math.max(0, finishedAt - startedAt),
          worldBounds: scene.worldBounds
        }
      ]
    },
    Promise.resolve([])
  )
}
