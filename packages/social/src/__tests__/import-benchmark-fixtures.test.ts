import { describe, expect, it } from 'vitest'
import {
  createSocialImportBenchmarkDrafts,
  iterateSocialImportBenchmarkDrafts,
  SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS
} from '..'

describe('social import benchmark fixtures', () => {
  it('defines the large benchmark record counts without generating them eagerly', () => {
    expect(SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS).toEqual({
      tenThousand: 10_000,
      largeYouTubeLike: 72_738,
      largeSourceRecordImport: 280_000,
      stressMillion: 1_000_000
    })
  })

  it('creates deterministic social content drafts for a small benchmark sample', () => {
    const drafts = createSocialImportBenchmarkDrafts({
      count: 3,
      platform: 'youtube',
      bucketId: 'youtube.history',
      importedAt: '2026-06-08T12:00:00.000Z'
    })

    expect(drafts).toHaveLength(3)
    expect(drafts.map((draft) => draft.kind)).toEqual(['content', 'content', 'content'])
    expect(drafts.map((draft) => draft.platform)).toEqual(['youtube', 'youtube', 'youtube'])
    expect(drafts.map((draft) => draft.bucketId)).toEqual([
      'youtube.history',
      'youtube.history',
      'youtube.history'
    ])
    expect(drafts.map((draft) => draft.properties.externalId)).toEqual([
      'benchmark-0',
      'benchmark-1',
      'benchmark-2'
    ])
    expect(drafts[0]?.deterministicId).toBe(
      createSocialImportBenchmarkDrafts({
        count: 1,
        platform: 'youtube',
        bucketId: 'youtube.history',
        importedAt: '2026-06-08T12:00:00.000Z'
      })[0]?.deterministicId
    )
  })

  it('can stream benchmark drafts without allocating the full fixture upfront', () => {
    const iterator = iterateSocialImportBenchmarkDrafts({ count: 2 })

    expect(Array.from(iterator, (draft) => draft.properties.externalId)).toEqual([
      'benchmark-0',
      'benchmark-1'
    ])
  })

  it('rejects invalid benchmark counts', () => {
    expect(() => createSocialImportBenchmarkDrafts({ count: -1 })).toThrow(
      'Benchmark draft count must be a non-negative safe integer'
    )
    expect(() => Array.from(iterateSocialImportBenchmarkDrafts({ count: 1.5 }))).toThrow(
      'Benchmark draft count must be a non-negative safe integer'
    )
  })
})
