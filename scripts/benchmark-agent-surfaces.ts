/**
 * Run the 0161 agent-surface benchmark and print the report.
 *
 * Usage: pnpm bench:agent-surfaces
 */

import {
  renderBenchmarkReport,
  runAgentSurfaceBenchmark
} from '../packages/plugins/src/benchmarks/agent-surface-benchmark'

const report = await runAgentSurfaceBenchmark()
console.log(renderBenchmarkReport(report))

const failures = report.results.filter((result) => !result.success)
if (failures.length > 0) {
  console.error(`\n${failures.length} task(s) failed`)
  process.exitCode = 1
}
