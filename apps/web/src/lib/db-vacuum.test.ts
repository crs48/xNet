import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import { scheduleOneTimeVacuum, subscribeVacuumActivity } from './db-vacuum'

const FLAG = 'xnet:db-vacuumed:v1'
const ATTEMPTS = 'xnet:db-vacuum:attempts'

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

  // ── Interruption robustness (0260 follow-up) ──────────────────────────────
  // VACUUM is atomic: a reload mid-run rolls it back with zero progress, so
  // rapid reloaders could interrupt the conversion forever. The attempt counter
  // persists across those interruptions and drives the hint + escalation.

  it('persists the attempt counter while the VACUUM is in flight and clears it on success', async () => {
    const adapter = makeAdapter('opfs')
    let resolveVacuum!: () => void
    adapter.vacuum.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveVacuum = resolve
        })
    )
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(adapter.vacuum).toHaveBeenCalled()
    // Mid-run — exactly the state a reload would freeze in.
    expect(localStorage.getItem(ATTEMPTS)).toBe('1')

    resolveVacuum()
    await vi.advanceTimersByTimeAsync(0)
    expect(localStorage.getItem(ATTEMPTS)).toBeNull()
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('keeps the attempt counter when the VACUUM fails, so retries still escalate', async () => {
    const adapter = makeAdapter('opfs')
    adapter.vacuum.mockRejectedValue(new Error('worker died'))
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(localStorage.getItem(ATTEMPTS)).toBe('1')
    expect(localStorage.getItem(FLAG)).toBeNull()
  })

  it('never counts skipped runs as attempts (steady state stays write-free)', async () => {
    localStorage.setItem(FLAG, '1')
    const adapter = makeAdapter('opfs', 2) // already incremental → PRAGMA-only boot
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(localStorage.getItem(ATTEMPTS)).toBeNull()

    const memory = makeAdapter('memory')
    scheduleOneTimeVacuum(memory)
    await vi.advanceTimersByTimeAsync(60000)
    expect(localStorage.getItem(ATTEMPTS)).toBeNull()
  })

  it('escalates after repeated interruptions: starts at first paint, skipping settle + idle', async () => {
    localStorage.setItem(ATTEMPTS, '2')
    const adapter = makeAdapter('opfs')
    // Hang the VACUUM so the mid-flight state (counter bumped, not yet cleared)
    // is observable.
    adapter.vacuum.mockImplementation(() => new Promise<void>(() => {}))
    scheduleOneTimeVacuum(adapter)
    // Still never blocks first paint — nothing runs before the mark.
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.vacuum).not.toHaveBeenCalled()

    bootMark('query:first-rows')
    // No 3s settle delay, no idle callback — the VACUUM starts immediately.
    await vi.advanceTimersByTimeAsync(0)
    expect(adapter.vacuum).toHaveBeenCalled()
    expect(localStorage.getItem(ATTEMPTS)).toBe('3')
  })

  it('escalated scheduling still runs via the fallback when first paint never fires', async () => {
    localStorage.setItem(ATTEMPTS, '2')
    const adapter = makeAdapter('opfs')
    scheduleOneTimeVacuum(adapter)
    await vi.advanceTimersByTimeAsync(45000)
    expect(adapter.vacuum).toHaveBeenCalled()
  })

  it('publishes the keep-tab-open hint on a retry attempt and clears it when done', async () => {
    localStorage.setItem(ATTEMPTS, '1') // one prior interrupted attempt
    const onChange = vi.fn()
    const unsubscribe = subscribeVacuumActivity(onChange)
    const adapter = makeAdapter('opfs')
    let resolveVacuum!: () => void
    adapter.vacuum.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveVacuum = resolve
        })
    )
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(onChange).toHaveBeenLastCalledWith(true)

    resolveVacuum()
    await vi.advanceTimersByTimeAsync(0)
    expect(onChange).toHaveBeenLastCalledWith(false)
    unsubscribe()
  })

  it('clears the hint even when the VACUUM fails', async () => {
    localStorage.setItem(ATTEMPTS, '1')
    const onChange = vi.fn()
    const unsubscribe = subscribeVacuumActivity(onChange)
    const adapter = makeAdapter('opfs')
    adapter.vacuum.mockRejectedValue(new Error('worker died'))
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(onChange).toHaveBeenCalledWith(true)
    expect(onChange).toHaveBeenLastCalledWith(false)
    unsubscribe()
  })

  it('shows no hint on a first attempt (nothing was ever interrupted)', async () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeVacuumActivity(onChange)
    const adapter = makeAdapter('opfs')
    scheduleOneTimeVacuum(adapter)
    await releaseBootGate()
    expect(adapter.vacuum).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    unsubscribe()
  })
})
