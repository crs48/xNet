import { describe, expect, it } from 'vitest'
import {
  benchmarkSyntheticCanvasWorlds,
  createCanvasWorkerTransferBenchmarkObjects,
  measureCanvasWorkerTransferOverhead,
  profileCanvasObjectTransferPayload
} from './benchmarks'

function createIncrementingClock(stepMs: number): () => number {
  let now = 0

  return () => {
    now += stepMs
    return now
  }
}

describe('Canvas v3 benchmark helpers', () => {
  it('profiles packed worker payload size against JSON payload size', () => {
    const objects = createCanvasWorkerTransferBenchmarkObjects({
      objectCount: 512,
      seed: 11
    })
    const profile = profileCanvasObjectTransferPayload(objects)

    expect(profile.objectCount).toBe(512)
    expect(profile.binaryByteLength).toBeLessThan(profile.jsonByteLength)
    expect(profile.transferableBytes).toBe(profile.binaryByteLength)
    expect(profile.jsonToBinaryByteRatio).toBeGreaterThan(1)
  })

  it('measures binary and JSON worker transfer overhead with repeatable clocks', () => {
    const measurement = measureCanvasWorkerTransferOverhead({
      objectCount: 128,
      iterations: 3,
      warmupIterations: 1,
      seed: 5,
      clock: createIncrementingClock(0.25)
    })

    expect(measurement.valid).toBe(true)
    expect(measurement.errors).toEqual([])
    expect(measurement.iterations).toBe(3)
    expect(measurement.warmupIterations).toBe(1)
    expect(measurement.binaryEncodeMsAvg).toBe(0.25)
    expect(measurement.binaryDecodeMsAvg).toBe(0.25)
    expect(measurement.jsonEncodeMsAvg).toBe(0.25)
    expect(measurement.jsonDecodeMsAvg).toBe(0.25)
  })

  it('benchmarks generated summary tiles for million to billion object worlds', async () => {
    const results = await benchmarkSyntheticCanvasWorlds({
      objectCounts: [1_000_000, 100_000_000, 1_000_000_000],
      maxTileSummaries: 128,
      seed: 19,
      clock: createIncrementingClock(1)
    })

    expect(results.map((result) => result.objectCount)).toEqual([
      1_000_000, 100_000_000, 1_000_000_000
    ])
    expect(results.map((result) => result.mode)).toEqual([
      'large-scene',
      'large-scene',
      'huge-scene'
    ])
    expect(results.every((result) => result.tileSummaryCount <= 128)).toBe(true)
    expect(results.every((result) => result.totalObjectCount > 0)).toBe(true)
    expect(results.every((result) => result.durationMs === 1)).toBe(true)
  })
})
