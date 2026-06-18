import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetColdStartProbe,
  getColdStartProbe,
  looksEvicted,
  probeStoreColdStart,
  recordColdStartProbe,
  shouldOfferRestore
} from './store-cold-start'

afterEach(() => {
  __resetColdStartProbe()
})

function fakeAdapter(queryOne: (sql: string) => Promise<unknown>) {
  return { queryOne: queryOne as never }
}

describe('probeStoreColdStart', () => {
  it('reports empty when the node count is zero', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => ({ n: 0 })),
      true,
      true
    )
    expect(probe).toEqual({ empty: true, persisted: true, hubConfigured: true })
  })

  it('reports not-empty when there are rows', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => ({ n: 42 })),
      false,
      true
    )
    expect(probe.empty).toBe(false)
    expect(probe.persisted).toBe(false)
  })

  it('treats a null row as empty', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => null),
      null,
      false
    )
    expect(probe.empty).toBe(true)
  })

  it('degrades to not-empty if the count query throws', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => {
        throw new Error('no such table')
      }),
      false,
      true
    )
    expect(probe.empty).toBe(false)
  })
})

describe('looksEvicted', () => {
  it('is true only when empty AND not persisted', () => {
    expect(looksEvicted({ empty: true, persisted: false, hubConfigured: true })).toBe(true)
    expect(looksEvicted({ empty: true, persisted: true, hubConfigured: true })).toBe(false)
    expect(looksEvicted({ empty: true, persisted: null, hubConfigured: true })).toBe(false)
    expect(looksEvicted({ empty: false, persisted: false, hubConfigured: true })).toBe(false)
  })
})

describe('shouldOfferRestore', () => {
  it('requires an evicted-looking cache AND a configured hub', () => {
    expect(shouldOfferRestore({ empty: true, persisted: false, hubConfigured: true })).toBe(true)
    // evicted but no hub to restore from → just a new/empty local workspace
    expect(shouldOfferRestore({ empty: true, persisted: false, hubConfigured: false })).toBe(false)
    // persisted empty store is genuinely empty, not evicted
    expect(shouldOfferRestore({ empty: true, persisted: true, hubConfigured: true })).toBe(false)
  })
})

describe('cold-start probe singleton', () => {
  it('starts null and returns the last recorded probe', () => {
    expect(getColdStartProbe()).toBeNull()
    recordColdStartProbe({ empty: true, persisted: false, hubConfigured: true })
    expect(getColdStartProbe()).toEqual({ empty: true, persisted: false, hubConfigured: true })
  })
})
