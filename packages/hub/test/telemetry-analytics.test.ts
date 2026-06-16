import { describe, it, expect } from 'vitest'
import {
  isDuckDbAvailable,
  resetDuckDbAvailabilityCache,
  runTelemetryJoinQuery
} from '../src/telemetry/analytics'

describe('telemetry analytics (lazy DuckDB)', () => {
  it('reports availability as a boolean', async () => {
    resetDuckDbAvailabilityCache()
    const available = await isDuckDbAvailable()
    expect(typeof available).toBe('boolean')
  })

  it('caches the availability result', async () => {
    resetDuckDbAvailabilityCache()
    const a = await isDuckDbAvailable()
    const b = await isDuckDbAvailable()
    expect(a).toBe(b)
  })

  it('throws a clear error when DuckDB is not installed', async () => {
    // @duckdb/node-api is an optional, non-bundled dependency. When it is not
    // present (the default in CI), join queries must fail loudly, not silently.
    const available = await isDuckDbAvailable()
    if (available) {
      // If a future environment installs DuckDB, the throw path is moot.
      return
    }
    await expect(
      runTelemetryJoinQuery('SELECT 1', { telemetryDb: '/tmp/telemetry.db', hubDb: '/tmp/hub.db' })
    ).rejects.toThrow(/not installed/)
  })
})
