import type { UsageEntry } from '@xnetjs/cloud/billing'
import { describe, expect, it } from 'vitest'
import { InMemoryDocStore } from './durable'
import { usageLedgerFromDocs } from './usage-ledger'

const entry = (key: string, tenantId: string, chargeUsd: number, timestampMs = 1000): UsageEntry => ({
  key,
  tenantId,
  inputTokens: 100,
  outputTokens: 50,
  model: 'claude-sonnet',
  chargeUsd,
  providerCostUsd: chargeUsd / 1.25,
  timestampMs
})

describe('usageLedgerFromDocs (durable over a DocStore)', () => {
  it('records once and is idempotent on a redelivered key', async () => {
    const l = usageLedgerFromDocs(new InMemoryDocStore<UsageEntry>())
    expect((await l.record(entry('t1:s:r', 't1', 0.05))).recorded).toBe(true)
    expect((await l.record(entry('t1:s:r', 't1', 0.05))).recorded).toBe(false)
    expect(await l.totalChargeUsd('t1')).toBeCloseTo(0.05, 8) // counted once
  })

  it('totals per tenant and across tenants', async () => {
    const l = usageLedgerFromDocs(new InMemoryDocStore<UsageEntry>())
    await l.record(entry('t1:a', 't1', 0.1))
    await l.record(entry('t2:a', 't2', 0.2))
    await l.record(entry('t1:b', 't1', 0.3))
    expect(await l.totalChargeUsd('t1')).toBeCloseTo(0.4, 8)
    expect(await l.totalChargeUsd()).toBeCloseTo(0.6, 8)
    expect(await l.entries('t1')).toHaveLength(2)
  })

  it('scopes to a billing period (the monthly-reset query)', async () => {
    const l = usageLedgerFromDocs(new InMemoryDocStore<UsageEntry>())
    await l.record(entry('t1:old', 't1', 1.0, 1_000))
    await l.record(entry('t1:new', 't1', 0.25, 5_000))
    expect(await l.totalChargeUsd('t1', 5_000)).toBeCloseTo(0.25, 8)
    expect(await l.entries('t1', 5_000)).toHaveLength(1)
  })
})
