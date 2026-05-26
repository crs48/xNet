/**
 * Repeatable benchmark helpers for canvas preview generation.
 */

import type { CanvasObjectKind } from '../types'
import type { CanvasPreviewModel, CanvasPreviewSourceRef } from './model'
import type { CanvasThumbnailOutputKind } from './thumbnail-output'
import type { BenchmarkClock } from '@xnetjs/canvas-core'
import { createCanvasPreviewModel } from './model'
import { createCanvasOfflinePreviewFallback } from './offline-fallback'
import { createCanvasThumbnailOutput } from './thumbnail-output'
import {
  createCanvasPreviewTileSummaryUpdate,
  type CanvasPreviewTileSummaryUpdate
} from './tile-summary'

export type CanvasPreviewGenerationBenchmarkInput = {
  objectCount?: number
  iterations?: number
  warmupIterations?: number
  seed?: number
  clock?: BenchmarkClock
}

export type CanvasPreviewGenerationBenchmarkSource = {
  objectId: string
  objectKind: CanvasObjectKind
  thumbnailKind: CanvasThumbnailOutputKind
  title: string
  subtitle?: string
  mimeType?: string
  provider?: string
  sourceRef: CanvasPreviewSourceRef
}

export type CanvasPreviewGenerationBenchmarkMeasurement = {
  objectCount: number
  iterations: number
  warmupIterations: number
  valid: boolean
  errors: readonly string[]
  generatedThumbnailCount: number
  livePreviewCount: number
  offlineFallbackCount: number
  tileSummaryJsonBytes: number
  thumbnailMsAvg: number
  modelMsAvg: number
  offlineFallbackMsAvg: number
  tileSummaryMsAvg: number
}

type TimedResult<T> = {
  value: T
  durationMs: number
}

type PreviewGenerationIteration = {
  valid: boolean
  errors: readonly string[]
  generatedThumbnailCount: number
  livePreviewCount: number
  offlineFallbackCount: number
  tileSummaryJsonBytes: number
  thumbnailMs: number
  modelMs: number
  offlineFallbackMs: number
  tileSummaryMs: number
}

const DEFAULT_PREVIEW_BENCHMARK_OBJECT_COUNT = 10_000
const DEFAULT_PREVIEW_BENCHMARK_ITERATIONS = 3
const DEFAULT_PREVIEW_BENCHMARK_WARMUPS = 1
const JSON_ENCODER = new TextEncoder()

const BENCHMARK_SOURCES: readonly {
  objectKind: CanvasObjectKind
  thumbnailKind: CanvasThumbnailOutputKind
  mimeType?: string
  provider?: string
}[] = [
  { objectKind: 'media', thumbnailKind: 'image', mimeType: 'image/png' },
  { objectKind: 'media', thumbnailKind: 'pdf', mimeType: 'application/pdf' },
  { objectKind: 'media', thumbnailKind: 'generic-file', mimeType: 'application/vnd.ms-excel' },
  {
    objectKind: 'external-reference',
    thumbnailKind: 'url-card',
    mimeType: 'text/html',
    provider: 'github'
  },
  {
    objectKind: 'external-reference',
    thumbnailKind: 'video-poster',
    mimeType: 'text/html',
    provider: 'youtube'
  },
  {
    objectKind: 'external-reference',
    thumbnailKind: 'audio-card',
    mimeType: 'text/html',
    provider: 'spotify'
  },
  { objectKind: 'page', thumbnailKind: 'url-card', mimeType: 'text/html' },
  { objectKind: 'database', thumbnailKind: 'url-card', mimeType: 'application/json' },
  { objectKind: 'note', thumbnailKind: 'url-card', mimeType: 'text/markdown' }
]

function readNow(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
}

function sanitizeCount(count: number | undefined, fallback: number): number {
  return Number.isFinite(count) ? Math.max(0, Math.floor(count ?? fallback)) : fallback
}

function sanitizeIterationCount(count: number | undefined, fallback: number): number {
  return Math.max(1, sanitizeCount(count, fallback))
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

function shouldUseLivePreview(source: CanvasPreviewGenerationBenchmarkSource): boolean {
  return source.objectKind === 'external-reference' && source.provider !== undefined
}

function shouldUseOfflineFallback(index: number): boolean {
  return index % 11 === 0
}

function createPreviewModelForSource(
  source: CanvasPreviewGenerationBenchmarkSource,
  thumbnail: ReturnType<typeof createCanvasThumbnailOutput>
): CanvasPreviewModel {
  return createCanvasPreviewModel({
    objectId: source.objectId,
    objectKind: source.objectKind,
    sourceRef: source.sourceRef,
    summary: {
      title: source.title,
      subtitle: source.subtitle,
      status: 'ready'
    },
    thumbnail,
    shell: {
      title: source.title,
      subtitle: source.subtitle,
      metadata: {
        mimeType: source.mimeType ?? null,
        provider: source.provider ?? null
      }
    },
    ...(shouldUseLivePreview(source)
      ? {
          live: {
            provider: source.provider,
            embedUrl: `https://example.com/embed/${source.objectId}`,
            activation: 'click-to-activate' as const,
            budgetKey: source.provider
          }
        }
      : {})
  })
}

function runPreviewGenerationIteration(
  sources: readonly CanvasPreviewGenerationBenchmarkSource[],
  clock: BenchmarkClock
): PreviewGenerationIteration {
  const thumbnailResult = measure(clock, () =>
    sources.map((source) =>
      createCanvasThumbnailOutput({
        kind: source.thumbnailKind,
        title: source.title,
        subtitle: source.subtitle,
        mimeType: source.mimeType,
        provider: source.provider,
        sourceRef: source.sourceRef
      })
    )
  )
  const modelResult = measure(clock, () =>
    sources.map((source, index) =>
      createPreviewModelForSource(source, thumbnailResult.value[index])
    )
  )
  const offlineFallbackResult = measure(clock, () =>
    modelResult.value.map((model, index) =>
      shouldUseOfflineFallback(index) ? createCanvasOfflinePreviewFallback({ model }) : model
    )
  )
  const tileSummaryResult = measure(clock, () =>
    offlineFallbackResult.value.map(createCanvasPreviewTileSummaryUpdate)
  )
  const errors = validatePreviewGenerationIteration({
    sources,
    models: offlineFallbackResult.value,
    tileSummaries: tileSummaryResult.value
  })

  return {
    valid: errors.length === 0,
    errors,
    generatedThumbnailCount: thumbnailResult.value.filter((thumbnail) => thumbnail.generated)
      .length,
    livePreviewCount: modelResult.value.filter((model) => model.live !== undefined).length,
    offlineFallbackCount: offlineFallbackResult.value.filter(
      (model) => model.summary.status === 'offline'
    ).length,
    tileSummaryJsonBytes: JSON_ENCODER.encode(JSON.stringify(tileSummaryResult.value)).byteLength,
    thumbnailMs: thumbnailResult.durationMs,
    modelMs: modelResult.durationMs,
    offlineFallbackMs: offlineFallbackResult.durationMs,
    tileSummaryMs: tileSummaryResult.durationMs
  }
}

function validatePreviewGenerationIteration(input: {
  sources: readonly CanvasPreviewGenerationBenchmarkSource[]
  models: readonly CanvasPreviewModel[]
  tileSummaries: readonly CanvasPreviewTileSummaryUpdate[]
}): readonly string[] {
  const errors: string[] = []

  if (input.models.length !== input.sources.length) {
    errors.push('Preview model count did not match source count.')
  }

  if (input.tileSummaries.length !== input.sources.length) {
    errors.push('Tile summary count did not match source count.')
  }

  input.tileSummaries.forEach((summary, index) => {
    const source = input.sources[index]

    if (!source) {
      errors.push(`Tile summary ${index} did not have a matching source.`)
      return
    }

    if (summary.objectId !== source.objectId) {
      errors.push(`Tile summary ${index} object id did not match source id.`)
    }

    if (summary.preview.title !== source.title) {
      errors.push(`Tile summary ${index} title did not match source title.`)
    }
  })

  return errors
}

export function createCanvasPreviewGenerationBenchmarkSources(
  input: Pick<CanvasPreviewGenerationBenchmarkInput, 'objectCount' | 'seed'> = {}
): readonly CanvasPreviewGenerationBenchmarkSource[] {
  const objectCount = sanitizeCount(input.objectCount, DEFAULT_PREVIEW_BENCHMARK_OBJECT_COUNT)
  const seed = input.seed ?? 1

  return Array.from({ length: objectCount }, (_, index) => {
    const template = BENCHMARK_SOURCES[(index + seed) % BENCHMARK_SOURCES.length]
    const version = 1 + ((index + seed) % 17)

    return {
      objectId: `preview-benchmark:${seed}:${index}`,
      objectKind: template.objectKind,
      thumbnailKind: template.thumbnailKind,
      title: `${template.objectKind} preview ${index + 1}`,
      subtitle: template.provider ?? template.mimeType ?? template.thumbnailKind,
      mimeType: template.mimeType,
      provider: template.provider,
      sourceRef: {
        nodeId: `source:${seed}:${index}`,
        schemaId: `xnet://xnet.fyi/${template.objectKind}@1.0.0`,
        version,
        contentHash: `hash:${seed}:${index}:${version}`
      }
    }
  })
}

export function measureCanvasPreviewGenerationBenchmark(
  input: CanvasPreviewGenerationBenchmarkInput = {}
): CanvasPreviewGenerationBenchmarkMeasurement {
  const clock = createBenchmarkClock(input.clock)
  const iterations = sanitizeIterationCount(input.iterations, DEFAULT_PREVIEW_BENCHMARK_ITERATIONS)
  const warmupIterations = sanitizeCount(input.warmupIterations, DEFAULT_PREVIEW_BENCHMARK_WARMUPS)
  const sources = createCanvasPreviewGenerationBenchmarkSources({
    objectCount: input.objectCount,
    seed: input.seed
  })

  for (let index = 0; index < warmupIterations; index += 1) {
    runPreviewGenerationIteration(sources, clock)
  }

  const totals = Array.from({ length: iterations }, () =>
    runPreviewGenerationIteration(sources, clock)
  ).reduce(
    (accumulator, iteration) => ({
      valid: accumulator.valid && iteration.valid,
      errors: [...accumulator.errors, ...iteration.errors],
      generatedThumbnailCount: iteration.generatedThumbnailCount,
      livePreviewCount: iteration.livePreviewCount,
      offlineFallbackCount: iteration.offlineFallbackCount,
      tileSummaryJsonBytes: iteration.tileSummaryJsonBytes,
      thumbnailMs: accumulator.thumbnailMs + iteration.thumbnailMs,
      modelMs: accumulator.modelMs + iteration.modelMs,
      offlineFallbackMs: accumulator.offlineFallbackMs + iteration.offlineFallbackMs,
      tileSummaryMs: accumulator.tileSummaryMs + iteration.tileSummaryMs
    }),
    {
      valid: true,
      errors: [] as string[],
      generatedThumbnailCount: 0,
      livePreviewCount: 0,
      offlineFallbackCount: 0,
      tileSummaryJsonBytes: 0,
      thumbnailMs: 0,
      modelMs: 0,
      offlineFallbackMs: 0,
      tileSummaryMs: 0
    }
  )

  return {
    objectCount: sources.length,
    iterations,
    warmupIterations,
    valid: totals.valid,
    errors: totals.errors,
    generatedThumbnailCount: totals.generatedThumbnailCount,
    livePreviewCount: totals.livePreviewCount,
    offlineFallbackCount: totals.offlineFallbackCount,
    tileSummaryJsonBytes: totals.tileSummaryJsonBytes,
    thumbnailMsAvg: average(totals.thumbnailMs, iterations),
    modelMsAvg: average(totals.modelMs, iterations),
    offlineFallbackMsAvg: average(totals.offlineFallbackMs, iterations),
    tileSummaryMsAvg: average(totals.tileSummaryMs, iterations)
  }
}
