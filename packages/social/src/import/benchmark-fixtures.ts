/**
 * Deterministic social import draft fixtures for commit-path benchmarks.
 */

import type { SocialImportNodeDraft } from './stage-archive'
import { SocialContentSchema } from '../schemas'
import { createSocialNodeId, createSourceRecordId } from './ids'

export const SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS = {
  tenThousand: 10_000,
  largeYouTubeLike: 72_738,
  largeSourceRecordImport: 280_000,
  stressMillion: 1_000_000
} as const

export type SocialImportBenchmarkRecordCount =
  (typeof SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS)[keyof typeof SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS]

export type SocialImportBenchmarkDraftOptions = {
  count: number
  platform?: string
  bucketId?: string
  importedAt?: string
}

export function createSocialImportBenchmarkDrafts(
  options: SocialImportBenchmarkDraftOptions
): SocialImportNodeDraft[] {
  return Array.from(iterateSocialImportBenchmarkDrafts(options))
}

export function* iterateSocialImportBenchmarkDrafts(
  options: SocialImportBenchmarkDraftOptions
): Iterable<SocialImportNodeDraft> {
  assertValidBenchmarkCount(options.count)

  const platform = options.platform ?? 'benchmark'
  const bucketId = options.bucketId ?? 'benchmark.content'
  const importedAt = options.importedAt ?? '2026-01-01T00:00:00.000Z'

  for (let index = 0; index < options.count; index++) {
    yield createSocialImportBenchmarkDraft({
      index,
      platform,
      bucketId,
      importedAt
    })
  }
}

function createSocialImportBenchmarkDraft(input: {
  index: number
  platform: string
  bucketId: string
  importedAt: string
}): SocialImportNodeDraft {
  const sourceRecordId = createSourceRecordId({
    platform: input.platform,
    archiveId: 'benchmark-archive',
    sourcePath: `${input.bucketId}.json`,
    sourceRecordId: String(input.index)
  })
  const deterministicId = createSocialNodeId('content', [
    input.platform,
    input.bucketId,
    input.index
  ])

  return {
    kind: 'content',
    deterministicId,
    schemaId: SocialContentSchema.schema['@id'],
    platform: input.platform,
    bucketId: input.bucketId,
    privacyClass: 'private',
    warningCount: 0,
    properties: {
      platform: input.platform,
      sourceRecord: sourceRecordId,
      privacyClass: 'private',
      visibility: 'private',
      importedAt: input.importedAt,
      externalId: `benchmark-${input.index}`,
      contentType: input.index % 5 === 0 ? 'video' : 'post',
      title: `Benchmark item ${input.index}`,
      text: `Synthetic social import benchmark record ${input.index}`,
      url: `https://example.test/social/${input.index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, input.index % 60)).toISOString()
    }
  }
}

function assertValidBenchmarkCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Benchmark draft count must be a non-negative safe integer: ${count}`)
  }
}
