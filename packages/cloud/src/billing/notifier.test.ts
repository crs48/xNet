import { describe, expect, it } from 'vitest'
import { BudgetAlertNotifier, MemorySentThresholdStore, RecordingAlertTransport } from './notifier'

const make = () => {
  const transport = new RecordingAlertTransport()
  const store = new MemorySentThresholdStore()
  return { transport, notifier: new BudgetAlertNotifier({ transport, store }) }
}

describe('BudgetAlertNotifier', () => {
  it('fires once per newly-crossed threshold', async () => {
    const { transport, notifier } = make()
    // $10 cap: 3 → 9 crosses 50% ($5) and 80% ($8).
    const fired = await notifier.notify({
      tenantId: 't1',
      windowKey: 'w1',
      prevUsedUsd: 3,
      newUsedUsd: 9,
      capUsd: 10
    })
    expect(fired).toEqual([0.5, 0.8])
    expect(transport.sent.map((a) => a.threshold)).toEqual([0.5, 0.8])
    expect(transport.sent[0]).toMatchObject({ tenantId: 't1', usedUsd: 9, capUsd: 10 })
  })

  it('is idempotent: the same crossing never re-alerts within a window', async () => {
    const { transport, notifier } = make()
    await notifier.notify({
      tenantId: 't1',
      windowKey: 'w1',
      prevUsedUsd: 0,
      newUsedUsd: 6,
      capUsd: 10
    })
    // A second call re-derives the 50% crossing from 0 again, but it's already sent.
    const again = await notifier.notify({
      tenantId: 't1',
      windowKey: 'w1',
      prevUsedUsd: 0,
      newUsedUsd: 6,
      capUsd: 10
    })
    expect(again).toEqual([])
    expect(transport.sent).toHaveLength(1)
  })

  it('alerts afresh in a new window', async () => {
    const { transport, notifier } = make()
    await notifier.notify({
      tenantId: 't1',
      windowKey: 'w1',
      prevUsedUsd: 0,
      newUsedUsd: 6,
      capUsd: 10
    })
    await notifier.notify({
      tenantId: 't1',
      windowKey: 'w2',
      prevUsedUsd: 0,
      newUsedUsd: 6,
      capUsd: 10
    })
    expect(transport.sent.map((a) => a.windowKey)).toEqual(['w1', 'w2'])
  })

  it('fires the 100% crossing when the cap is reached', async () => {
    const { transport, notifier } = make()
    const fired = await notifier.notify({
      tenantId: 't1',
      windowKey: 'w1',
      prevUsedUsd: 9,
      newUsedUsd: 10,
      capUsd: 10
    })
    expect(fired).toEqual([0.95, 1])
    expect(transport.sent.map((a) => a.threshold)).toEqual([0.95, 1])
  })

  it('does nothing when no threshold is crossed', async () => {
    const { transport, notifier } = make()
    expect(
      await notifier.notify({
        tenantId: 't1',
        windowKey: 'w1',
        prevUsedUsd: 1,
        newUsedUsd: 2,
        capUsd: 100
      })
    ).toEqual([])
    expect(transport.sent).toHaveLength(0)
  })
})
