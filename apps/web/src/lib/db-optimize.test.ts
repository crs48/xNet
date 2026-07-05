/**
 * Tests for the periodic query-planner optimize cadence (exploration 0264).
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import { runOptimizePass, schedulePeriodicOptimize } from './db-optimize'

function fakeAdapter(overrides?: Partial<SQLiteAdapter>): SQLiteAdapter & { execCalls: string[] } {
  const execCalls: string[] = []
  return {
    execCalls,
    isOpen: () => true,
    exec: async (sql: string) => {
      execCalls.push(sql)
    },
    ...overrides
  } as unknown as SQLiteAdapter & { execCalls: string[] }
}

describe('runOptimizePass (0264)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs PRAGMA optimize on an open adapter', async () => {
    const adapter = fakeAdapter()
    expect(await runOptimizePass(adapter)).toBe(true)
    expect(adapter.execCalls).toEqual(['PRAGMA optimize'])
  })

  it('skips a closed adapter', async () => {
    const adapter = fakeAdapter({ isOpen: () => false })
    expect(await runOptimizePass(adapter)).toBe(false)
    expect(adapter.execCalls).toEqual([])
  })

  it('never throws when exec fails', async () => {
    const adapter = fakeAdapter({
      exec: async () => {
        throw new Error('worker gone')
      }
    })
    await expect(runOptimizePass(adapter)).resolves.toBe(false)
  })
})

describe('schedulePeriodicOptimize (0264)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    __resetBootTimeline()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('waits for boot to settle, then repeats on the interval until cancelled', async () => {
    const adapter = fakeAdapter()
    const cancel = schedulePeriodicOptimize(adapter, 1_000)

    // Nothing before the boot settles.
    await vi.advanceTimersByTimeAsync(10_000)
    expect(adapter.execCalls).toHaveLength(0)

    // Settle the boot (query:first-rows fires bootSettled).
    bootMark('query:first-rows')
    await vi.advanceTimersByTimeAsync(30_000) // settle delay + first pass
    expect(adapter.execCalls.length).toBeGreaterThanOrEqual(1)

    const afterFirst = adapter.execCalls.length
    await vi.advanceTimersByTimeAsync(2_500)
    expect(adapter.execCalls.length).toBeGreaterThan(afterFirst)

    cancel()
    const afterCancel = adapter.execCalls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(adapter.execCalls.length).toBe(afterCancel)
  })
})
