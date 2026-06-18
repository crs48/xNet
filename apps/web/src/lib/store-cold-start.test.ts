import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetColdStartProbe,
  getColdStartProbe,
  looksEvicted,
  probeStoreColdStart,
  recordColdStartProbe
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
      true
    )
    expect(probe).toEqual({ empty: true, persisted: true })
  })

  it('reports not-empty when there are rows', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => ({ n: 42 })),
      false
    )
    expect(probe.empty).toBe(false)
    expect(probe.persisted).toBe(false)
  })

  it('treats a null row as empty', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => null),
      null
    )
    expect(probe.empty).toBe(true)
  })

  it('degrades to not-empty if the count query throws', async () => {
    const probe = await probeStoreColdStart(
      fakeAdapter(async () => {
        throw new Error('no such table')
      }),
      false
    )
    expect(probe.empty).toBe(false)
  })
})

describe('looksEvicted', () => {
  it('is true only when empty AND not persisted', () => {
    expect(looksEvicted({ empty: true, persisted: false })).toBe(true)
    expect(looksEvicted({ empty: true, persisted: true })).toBe(false)
    expect(looksEvicted({ empty: true, persisted: null })).toBe(false)
    expect(looksEvicted({ empty: false, persisted: false })).toBe(false)
  })
})

describe('cold-start probe singleton', () => {
  it('starts null and returns the last recorded probe', () => {
    expect(getColdStartProbe()).toBeNull()
    recordColdStartProbe({ empty: true, persisted: false })
    expect(getColdStartProbe()).toEqual({ empty: true, persisted: false })
  })
})
