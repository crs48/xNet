/**
 * Telemetry integration tests for @xnet/vectors
 */

import type { TelemetryReporter } from '../search.js'
import { describe, it, expect, beforeEach } from 'vitest'
import { SemanticSearch, createSemanticSearch } from '../search.js'

// ─── Mock Telemetry Reporter ───────────────────────────────────────────────────

function createMockTelemetry(): TelemetryReporter & {
  calls: { method: string; args: unknown[] }[]
} {
  const calls: { method: string; args: unknown[] }[] = []
  return {
    calls,
    reportPerformance(metricName: string, durationMs: number) {
      calls.push({ method: 'reportPerformance', args: [metricName, durationMs] })
    },
    reportUsage(metricName: string, count: number) {
      calls.push({ method: 'reportUsage', args: [metricName, count] })
    },
    reportCrash(error: Error, context?: Record<string, unknown>) {
      calls.push({ method: 'reportCrash', args: [error, context] })
    }
  }
}

// ─── SemanticSearch Telemetry Tests ───────────────────────────────────────────

describe('SemanticSearch telemetry', () => {
  let telemetry: ReturnType<typeof createMockTelemetry>
  let search: SemanticSearch

  beforeEach(async () => {
    telemetry = createMockTelemetry()
    search = new SemanticSearch({ useMockModel: true, telemetry })
    await search.initialize()
  })

  describe('indexDocument', () => {
    it('reports performance on document indexing', async () => {
      await search.indexDocument('doc1', 'The quick brown fox jumps over the lazy dog.')

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'vectors.index_document'
      )
      expect(perfCalls).toHaveLength(1)
      expect(typeof perfCalls[0].args[1]).toBe('number')
    })

    it('reports usage on document indexing', async () => {
      await search.indexDocument('doc1', 'Some text content.')

      const usageCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'vectors.document_indexed'
      )
      expect(usageCalls).toHaveLength(1)
      expect(usageCalls[0].args[1]).toBe(1)
    })

    it('reports once per document regardless of chunk count', async () => {
      // Long text that will be chunked
      const longText = 'A '.repeat(300) + 'B '.repeat(300)
      await search.indexDocument('long-doc', longText)

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'vectors.index_document'
      )
      // One performance report per indexDocument call
      expect(perfCalls).toHaveLength(1)
    })
  })

  describe('search', () => {
    it('reports performance on search', async () => {
      await search.indexDocument('doc1', 'Machine learning algorithms')
      await search.indexDocument('doc2', 'Deep neural networks')

      telemetry.calls.length = 0 // Reset after indexing

      await search.search('artificial intelligence')

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'vectors.search'
      )
      expect(perfCalls).toHaveLength(1)
      expect(typeof perfCalls[0].args[1]).toBe('number')
    })

    it('reports usage (result count) on search', async () => {
      await search.indexDocument('doc1', 'Machine learning algorithms')
      await search.indexDocument('doc2', 'Deep neural networks')

      telemetry.calls.length = 0 // Reset after indexing

      await search.search('machine learning')

      const usageCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'vectors.search_results'
      )
      expect(usageCalls).toHaveLength(1)
      expect(typeof usageCalls[0].args[1]).toBe('number')
    })
  })

  describe('no telemetry', () => {
    it('works without telemetry', async () => {
      const searchNoTel = new SemanticSearch({ useMockModel: true })
      await searchNoTel.initialize()

      await searchNoTel.indexDocument('doc1', 'Test content without telemetry.')
      const results = await searchNoTel.search('test')

      // Should not throw and return results
      expect(Array.isArray(results)).toBe(true)
    })
  })
})

describe('createSemanticSearch with telemetry', () => {
  it('creates search with telemetry option', async () => {
    const telemetry = createMockTelemetry()
    const search = createSemanticSearch({ useMockModel: true, telemetry })
    await search.initialize()

    await search.indexDocument('doc1', 'Hello world.')

    const perfCalls = telemetry.calls.filter((c) => c.method === 'reportPerformance')
    expect(perfCalls.length).toBeGreaterThan(0)
  })
})
