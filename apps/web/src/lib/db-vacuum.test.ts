import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import { scheduleOneTimeVacuum } from './db-vacuum'

const FLAG = 'xnet:db-vacuumed:v1'

function makeAdapter(mode: 'opfs' | 'memory' = 'opfs', autoVacuum = 0) {
  return {
    getStorageMode: vi.fn(async () => mode),
    getDatabaseSize: vi.fn(async () => 1000),
    queryOne: vi.fn(async () => ({ auto_vacuum: autoVacuum })),
    vacuum: vi.fn(async () => undefined)
  } as unknown as SQLiteAdapter & {
    getStorageMode: ReturnType<typeof vi.fn>
    getDatabaseSize: ReturnType<typeof vi.fn>
    queryOne: ReturnType<typeof vi.fn>
    vacuum: ReturnType<typeof vi.fn>
  }
}

describe('scheduleOneTimeVacuum (0233; boot-gated + auto-vacuum-aware in 0260)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetBootTimeline()
    vi.useFakeTimers()
    // Run the idle callback synchronously so the test can await the work.
    ;(
      window as unknown as { requestIdleCallback: (cb: () => void) => number }
    ).requestIdleCallback = (cb: () => void) => {
      cb()
      return 1
    }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // The vacuum now waits for first paint (`query:first-rows`) + a post-paint settle
  // delay before running, so it never races the cold-open read burst (0260).
  async function releaseBootGate(): Promise<void> {
    bootMark('query:first-rows')
    await vi.advanceTimersByTimeAsync(3100)
  }

  it('vacuums an OPFS database and latches the flag — only after boot settles', async () => {
    const adapter = makeAdapter('opfs')
    scheduleOneTimeVacuum(adapter)
    // Nothing runs until the boot-settled gate is released.
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.vacuum).not.toHaveBeenCalled()

    await releaseBootGate()
    expect(adapter.vacuum).toHaveBeenCalled()
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('skips an in-memory database and does NOT latch (retries next boot)', async () => {
    const adapter = makeAdapter('memory')
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(adapter.getStorageMode).toHaveBeenCalled()
    expect(adapter.vacuum).not.toHaveBeenCalled()
    expect(localStorage.getItem(FLAG)).toBeNull()
  })

  it('no-ops when the flag is set AND the database is already incremental', async () => {
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter('opfs', 2) // auto_vacuum = INCREMENTAL
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(adapter.queryOne).toHaveBeenCalledWith('PRAGMA auto_vacuum')
    expect(adapter.vacuum).not.toHaveBeenCalled()
  })

  it('re-runs the VACUUM for a latched-but-unconverted database (flag set, auto_vacuum=NONE)', async () => {
    // A long-lived profile: the 0233 flag latched before incremental auto-vacuum
    // existed, so the database is still NONE and incremental_vacuum is a no-op
    // until this conversion VACUUM runs.
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter('opfs', 0) // auto_vacuum = NONE
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(adapter.vacuum).toHaveBeenCalled()
    expect(localStorage.getItem(FLAG)).toBe('1')
  })
})
