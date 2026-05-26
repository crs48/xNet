import { describe, expect, it } from 'vitest'
import {
  createCanvasPreviewGenerationBenchmarkSources,
  measureCanvasPreviewGenerationBenchmark
} from '../preview/benchmarks'

function createIncrementingClock(stepMs: number): () => number {
  let now = 0

  return () => {
    now += stepMs
    return now
  }
}

describe('canvas preview generation benchmarks', () => {
  it('creates mixed preview sources for large-board benchmark coverage', () => {
    const sources = createCanvasPreviewGenerationBenchmarkSources({
      objectCount: 36,
      seed: 3
    })
    const objectKinds = new Set(sources.map((source) => source.objectKind))
    const thumbnailKinds = new Set(sources.map((source) => source.thumbnailKind))

    expect(sources).toHaveLength(36)
    expect(objectKinds).toEqual(
      new Set(['external-reference', 'media', 'page', 'database', 'note'])
    )
    expect(thumbnailKinds).toEqual(
      new Set(['image', 'pdf', 'generic-file', 'url-card', 'video-poster', 'audio-card'])
    )
  })

  it('measures thumbnail, model, offline fallback, and tile summary generation deterministically', () => {
    const measurement = measureCanvasPreviewGenerationBenchmark({
      objectCount: 1_200,
      iterations: 3,
      warmupIterations: 1,
      seed: 7,
      clock: createIncrementingClock(0.5)
    })

    expect(measurement.valid).toBe(true)
    expect(measurement.errors).toEqual([])
    expect(measurement.objectCount).toBe(1_200)
    expect(measurement.iterations).toBe(3)
    expect(measurement.warmupIterations).toBe(1)
    expect(measurement.generatedThumbnailCount).toBe(1_200)
    expect(measurement.livePreviewCount).toBeGreaterThan(0)
    expect(measurement.offlineFallbackCount).toBeGreaterThan(100)
    expect(measurement.tileSummaryJsonBytes).toBeGreaterThan(100_000)
    expect(measurement.thumbnailMsAvg).toBe(0.5)
    expect(measurement.modelMsAvg).toBe(0.5)
    expect(measurement.offlineFallbackMsAvg).toBe(0.5)
    expect(measurement.tileSummaryMsAvg).toBe(0.5)
  })
})
