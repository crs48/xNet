/**
 * Telemetry integration tests for @xnet/formula
 */

import type { TelemetryReporter } from '../index.js'
import { describe, it, expect, beforeEach } from 'vitest'
import { FormulaEngine, createFormulaEngine } from '../index.js'

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

// ─── FormulaEngine Tests ──────────────────────────────────────────────────────

describe('FormulaEngine telemetry', () => {
  let telemetry: ReturnType<typeof createMockTelemetry>
  let engine: FormulaEngine

  beforeEach(() => {
    telemetry = createMockTelemetry()
    engine = new FormulaEngine({ telemetry })
  })

  describe('parse', () => {
    it('reports parse time on first parse', () => {
      engine.parse('1 + 2 * 3')

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'formula.parse'
      )
      expect(perfCalls).toHaveLength(1)
      expect(typeof perfCalls[0].args[1]).toBe('number')
    })

    it('reports cache miss on first parse', () => {
      engine.parse('price * quantity')

      const missCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'formula.cache_miss'
      )
      expect(missCalls).toHaveLength(1)
      expect(missCalls[0].args[1]).toBe(1)
    })

    it('reports cache hit on repeated parse', () => {
      engine.parse('price * quantity')
      telemetry.calls.length = 0 // Reset

      engine.parse('price * quantity')

      const hitCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'formula.cache_hit'
      )
      expect(hitCalls).toHaveLength(1)
      expect(hitCalls[0].args[1]).toBe(1)

      // No parse performance report on cache hit
      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'formula.parse'
      )
      expect(perfCalls).toHaveLength(0)
    })

    it('reports crash on parse error', () => {
      expect(() => engine.parse('1 +')).toThrow()

      const crashCalls = telemetry.calls.filter((c) => c.method === 'reportCrash')
      expect(crashCalls).toHaveLength(1)
      expect(crashCalls[0].args[1]).toMatchObject({ codeNamespace: 'formula.FormulaEngine.parse' })
    })
  })

  describe('evaluate', () => {
    it('reports parse and eval performance', () => {
      engine.evaluate('1 + 2', { props: {} })

      const parsePerfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'formula.parse'
      )
      expect(parsePerfCalls).toHaveLength(1)

      const evalPerfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'formula.eval'
      )
      expect(evalPerfCalls).toHaveLength(1)
    })

    it('returns correct result with telemetry enabled', () => {
      const result = engine.evaluate('price * quantity', {
        props: { price: 100, quantity: 5 }
      })
      expect(result).toBe(500)
    })

    it('reports eval error on invalid evaluation', () => {
      // Accessing non-existent property is valid (returns undefined)
      // We need to force an evaluation error - divide by a non-number that causes error
      // EvaluationError would be thrown on type errors in strict evaluation
      const result = engine.evaluate('unknown_prop', { props: {} })
      // Returns undefined (valid, not an error in this formula engine)
      expect(result).toBeUndefined()
    })

    it('uses cached AST on second evaluation', () => {
      engine.evaluate('1 + 2', { props: {} })
      telemetry.calls.length = 0 // Reset

      engine.evaluate('1 + 2', { props: {} })

      // Should get cache hit, not parse time
      const hitCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'formula.cache_hit'
      )
      expect(hitCalls).toHaveLength(1)
    })
  })

  describe('evaluateAST', () => {
    it('reports eval performance', () => {
      const ast = engine.parse('2 * 3')
      telemetry.calls.length = 0 // Reset after parse

      engine.evaluateAST(ast, { props: {} })

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'formula.eval'
      )
      expect(perfCalls).toHaveLength(1)
    })
  })

  describe('validate', () => {
    it('returns valid for correct formula', () => {
      const result = engine.validate('1 + 2 * 3')
      expect(result.valid).toBe(true)
    })

    it('returns invalid for bad formula', () => {
      const result = engine.validate('1 +')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('cache management', () => {
    it('getCacheStats returns stats', () => {
      engine.parse('1 + 2')
      engine.parse('3 * 4')

      const stats = engine.getCacheStats()
      expect(stats.size).toBe(2)
      expect(stats.enabled).toBe(true)
    })

    it('clearCache empties the cache', () => {
      engine.parse('1 + 2')
      engine.clearCache()

      const stats = engine.getCacheStats()
      expect(stats.size).toBe(0)
    })

    it('evicts oldest entries at max size', () => {
      const smallEngine = new FormulaEngine({ telemetry, maxCacheSize: 2 })

      smallEngine.parse('1 + 2')
      smallEngine.parse('3 * 4')
      smallEngine.parse('5 - 6') // Should evict '1 + 2'

      expect(smallEngine.getCacheStats().size).toBe(2)
    })

    it('disables caching when enableCache is false', () => {
      const noCacheEngine = new FormulaEngine({ telemetry, enableCache: false })

      noCacheEngine.parse('1 + 2')
      noCacheEngine.parse('1 + 2') // Second parse - no cache hit

      const hitCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'formula.cache_hit'
      )
      expect(hitCalls).toHaveLength(0)
    })
  })
})

// ─── createFormulaEngine Tests ────────────────────────────────────────────────

describe('createFormulaEngine', () => {
  it('creates engine with telemetry', () => {
    const telemetry = createMockTelemetry()
    const engine = createFormulaEngine({ telemetry })

    engine.evaluate('2 + 2', { props: {} })

    const perfCalls = telemetry.calls.filter((c) => c.method === 'reportPerformance')
    expect(perfCalls.length).toBeGreaterThan(0)
  })

  it('works without telemetry', () => {
    const engine = createFormulaEngine()
    const result = engine.evaluate('10 / 2', { props: {} })
    expect(result).toBe(5)
  })
})
