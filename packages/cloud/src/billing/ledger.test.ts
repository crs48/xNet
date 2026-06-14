import { describe, expect, it } from 'vitest'
import { MemoryUsageLedger, type UsageEntry } from './ledger'

const entry = (key: string, tenantId: string, chargeUsd: number): UsageEntry => ({
  key,
  tenantId,
  inputTokens: 100,
  outputTokens: 50,
  model: 'claude-sonnet',
  chargeUsd,
  providerCostUsd: chargeUsd / 1.3,
  timestampMs: 1000
})

describe('MemoryUsageLedger', () => {
  it('records a new entry once', async () => {
    const l = new MemoryUsageLedger()
    expect((await l.record(entry('t1:s1:r1', 't1', 0.05)).then((r) => r)).recorded).toBe(true)
    expect(await l.totalChargeUsd('t1')).toBeCloseTo(0.05, 8)
  })

  it('rejects a duplicate idempotency key and does not double-count', async () => {
    const l = new MemoryUsageLedger()
    await l.record(entry('t1:s1:r1', 't1', 0.05))
    const second = await l.record(entry('t1:s1:r1', 't1', 0.05))
    expect(second.recorded).toBe(false)
    expect(await l.totalChargeUsd('t1')).toBeCloseTo(0.05, 8) // counted once
  })

  it('totals per tenant and across tenants', async () => {
    const l = new MemoryUsageLedger()
    await l.record(entry('t1:a', 't1', 0.1))
    await l.record(entry('t2:a', 't2', 0.2))
    await l.record(entry('t1:b', 't1', 0.3))
    expect(await l.totalChargeUsd('t1')).toBeCloseTo(0.4, 8)
    expect(await l.totalChargeUsd('t2')).toBeCloseTo(0.2, 8)
    expect(await l.totalChargeUsd()).toBeCloseTo(0.6, 8)
    expect(await l.entries('t1')).toHaveLength(2)
  })
})
