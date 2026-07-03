import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import { scheduleStalePresenceCleanup } from './presence-blob-cleanup'

const FLAG = 'xnet:presence-blob-vacuumed:v1'

function makeAdapter(deletedRows: number) {
  return {
    getDatabaseSize: vi.fn(async () => 1000),
    run: vi.fn(async () => ({ changes: deletedRows })),
    vacuum: vi.fn(async () => undefined)
  } as unknown as SQLiteAdapter & {
    getDatabaseSize: ReturnType<typeof vi.fn>
    run: ReturnType<typeof vi.fn>
    vacuum: ReturnType<typeof vi.fn>
  }
}

describe('scheduleStalePresenceCleanup (0229; boot-gated in 0260)', () => {
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

  // The cleanup now waits for first paint (`query:first-rows`) + a post-paint
  // settle delay before running, so the heavy DELETE/VACUUM never races the
  // cold-open read burst (0260).
  async function releaseBootGate(): Promise<void> {
    bootMark('query:first-rows')
    await vi.advanceTimersByTimeAsync(3100)
  }

  it('deletes presence rows, vacuums, and latches — only after boot settles', async () => {
    const adapter = makeAdapter(3)
    scheduleStalePresenceCleanup(adapter)
    // Nothing runs until the boot-settled gate is released.
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.run).not.toHaveBeenCalled()

    await releaseBootGate()
    expect(adapter.vacuum).toHaveBeenCalled()
    expect(adapter.run).toHaveBeenCalledWith(expect.stringContaining('presence-%'))
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('skips VACUUM when there is no stale blob to remove', async () => {
    const adapter = makeAdapter(0)
    scheduleStalePresenceCleanup(adapter)
    await releaseBootGate()
    expect(adapter.run).toHaveBeenCalled()
    expect(adapter.vacuum).not.toHaveBeenCalled()
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('no-ops once the flag is set (before the gate is even armed)', async () => {
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter(3)
    scheduleStalePresenceCleanup(adapter)
    await releaseBootGate()
    expect(adapter.run).not.toHaveBeenCalled()
  })
})
