/**
 * CI regression guard for the 0161 token budgets and the 15-task
 * agent-surface benchmark (files+CLI vs slim MCP vs legacy MCP).
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { XNET_AGENT_SKILL_MD } from '../ai-surface'
import {
  approxTokens,
  renderBenchmarkReport,
  runAgentSurfaceBenchmark,
  type BenchmarkReport
} from '../benchmarks/agent-surface-benchmark'

let report: BenchmarkReport

beforeAll(async () => {
  report = await runAgentSurfaceBenchmark()
  // Surface the full table in CI logs for the measurement record.
  console.log(renderBenchmarkReport(report))
}, 60_000)

describe('agent-surface benchmark (0161 Phase 4)', () => {
  it('runs all 15 tasks against all three surfaces', () => {
    const tasks = new Set(report.results.map((result) => result.task))
    expect(tasks.size).toBe(15)
    for (const surface of ['files-cli', 'mcp-legacy', 'mcp-slim'] as const) {
      expect(report.totals[surface].tasks).toBe(15)
    }
  })

  it('succeeds on every task on every surface (fallback parity for slim MCP)', () => {
    const failures = report.results.filter((result) => !result.success)
    expect(failures).toEqual([])
  })

  it('files+CLI costs at most half the tokens of the legacy MCP path', () => {
    expect(report.filesVsLegacyRatio).toBeLessThanOrEqual(0.5)
  })

  it('synthesis tasks avoid full-corpus round-trips (≤ 0.1x)', () => {
    expect(report.synthesisRatio).toBeLessThanOrEqual(0.1)
  })

  it('keeps the files-first standing cost under 1k tokens', () => {
    expect(report.standingCost['files-cli']).toBeLessThan(1000)
  })

  it('slim MCP standing cost is a fraction of the legacy definition payload', () => {
    expect(report.standingCost['mcp-legacy']).toBeGreaterThan(4000)
    expect(report.standingCost['mcp-slim']).toBeLessThan(report.standingCost['mcp-legacy'] * 0.4)
  })

  it('guards the SKILL.md token budget (stable, ~800 tokens)', () => {
    expect(approxTokens(XNET_AGENT_SKILL_MD)).toBeLessThanOrEqual(1000)
  })
})
