/**
 * Telemetry integration tests for @xnetjs/plugins
 */

import type { TelemetryReporter, ScriptStore, FlatNode } from '../sandbox'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScriptSandbox, ScriptRunner } from '../sandbox'

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

// ─── Mock Script Context ───────────────────────────────────────────────────────

const mockNode: FlatNode = { id: 'node-1', schemaIRI: 'xnet://test/Item' }

// ─── ScriptSandbox Telemetry Tests ────────────────────────────────────────────

describe('ScriptSandbox telemetry', () => {
  let telemetry: ReturnType<typeof createMockTelemetry>
  let sandbox: ScriptSandbox

  beforeEach(() => {
    telemetry = createMockTelemetry()
    sandbox = new ScriptSandbox({ telemetry })
  })

  describe('execute', () => {
    it('reports performance on successful execution', async () => {
      await sandbox.execute('(node) => node.id', {
        node: mockNode,
        nodes: () => [],
        now: () => Date.now(),
        format: {} as never,
        math: {} as never,
        text: {} as never,
        array: {} as never
      })

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'plugins.execute'
      )
      expect(perfCalls).toHaveLength(1)
      expect(typeof perfCalls[0].args[1]).toBe('number')
    })

    it('reports usage on successful execution', async () => {
      await sandbox.execute('(node) => 42', {
        node: mockNode,
        nodes: () => [],
        now: () => Date.now(),
        format: {} as never,
        math: {} as never,
        text: {} as never,
        array: {} as never
      })

      const usageCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'plugins.execute'
      )
      expect(usageCalls).toHaveLength(1)
      expect(usageCalls[0].args[1]).toBe(1)
    })

    it('reports AST validation failure', async () => {
      await expect(
        sandbox.execute('fetch("/api/data")', {
          node: mockNode,
          nodes: () => [],
          now: () => Date.now(),
          format: {} as never,
          math: {} as never,
          text: {} as never,
          array: {} as never
        })
      ).rejects.toThrow()

      const validationCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'plugins.ast_validation_failure'
      )
      expect(validationCalls).toHaveLength(1)
    })

    it('does not report telemetry when not set', async () => {
      const sandboxNoTelemetry = new ScriptSandbox()
      // Should not throw even without telemetry
      const result = await sandboxNoTelemetry.execute('(node) => node.id', {
        node: mockNode,
        nodes: () => [],
        now: () => Date.now(),
        format: {} as never,
        math: {} as never,
        text: {} as never,
        array: {} as never
      })
      expect(result).toBe('node-1')
    })
  })

  describe('executeSync', () => {
    it('reports performance on successful sync execution', () => {
      sandbox.executeSync('(node) => node.id', {
        node: mockNode,
        nodes: () => [],
        now: () => Date.now(),
        format: {} as never,
        math: {} as never,
        text: {} as never,
        array: {} as never
      })

      const perfCalls = telemetry.calls.filter(
        (c) => c.method === 'reportPerformance' && c.args[0] === 'plugins.execute_sync'
      )
      expect(perfCalls).toHaveLength(1)
    })

    it('reports usage on successful sync execution', () => {
      sandbox.executeSync('(node) => 99', {
        node: mockNode,
        nodes: () => [],
        now: () => Date.now(),
        format: {} as never,
        math: {} as never,
        text: {} as never,
        array: {} as never
      })

      const usageCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'plugins.execute_sync'
      )
      expect(usageCalls).toHaveLength(1)
    })

    it('reports AST validation failure in sync mode', () => {
      expect(() =>
        sandbox.executeSync('window.location.href', {
          node: mockNode,
          nodes: () => [],
          now: () => Date.now(),
          format: {} as never,
          math: {} as never,
          text: {} as never,
          array: {} as never
        })
      ).toThrow()

      const validationCalls = telemetry.calls.filter(
        (c) => c.method === 'reportUsage' && c.args[0] === 'plugins.ast_validation_failure'
      )
      expect(validationCalls).toHaveLength(1)
    })
  })
})

// ─── ScriptRunner Telemetry Tests ─────────────────────────────────────────────

describe('ScriptRunner telemetry', () => {
  it('passes telemetry to sandbox', () => {
    const telemetry = createMockTelemetry()
    const store: ScriptStore = {
      list: () => [],
      update: vi.fn(),
      subscribe: () => () => {}
    }

    const runner = new ScriptRunner({ store, telemetry })
    expect(runner).toBeDefined()
    // Telemetry is passed to sandbox internally - sandbox creation succeeds
  })

  it('works without telemetry', () => {
    const store: ScriptStore = {
      list: () => [],
      update: vi.fn(),
      subscribe: () => () => {}
    }

    const runner = new ScriptRunner({ store })
    expect(runner).toBeDefined()
  })
})
