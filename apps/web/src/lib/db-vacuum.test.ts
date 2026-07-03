import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import { scheduleOneTimeVacuum } from './db-vacuum'

const FLAG = 'xnet:db-vacuumed:v1'

function makeAdapter(mode: 'opfs' | 'memory' = 'opfs') {
  return {
    getStorageMode: vi.fn(async () => mode),
    getDatabaseSize: vi.fn(async () => 1000),
    vacuum: vi.fn(async () => undefined)
  } as unknown as SQLiteAdapter & {
    getStorageMode: ReturnType<typeof vi.fn>
    getDatabaseSize: ReturnType<typeof vi.fn>
    vacuum: ReturnType<typeof vi.fn>
  }
}

describe('scheduleOneTimeVacuum (0233; boot-gated in 0260)', () => {
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

  it('no-ops once the flag is set (before the gate is even armed)', async () => {
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter('opfs')
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(adapter.vacuum).not.toHaveBeenCalled()
    expect(adapter.getStorageMode).not.toHaveBeenCalled()
  })
})
