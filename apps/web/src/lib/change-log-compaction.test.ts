import type { SQLiteNodeStorageAdapter } from '@xnetjs/data'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetBootTimeline, bootMark } from './boot-timeline'
import { scheduleChangeLogCompaction } from './change-log-compaction'

const KILL_SWITCH = 'xnet:compact:changes'
const CHUNK = 2000

/**
 * A node-storage stub whose `changes` table holds `totalRows` prunable rows.
 * Each `pruneSupersededChanges` call removes up to `chunk` rows and reports the
 * count, so the compactor's loop-until-dry can be observed end to end.
 */
function makeNodeStorage(totalRows: number, watermark: number | null = 320_000) {
  let remaining = totalRows
  const prune = vi.fn(async (_wsafe: number, opts: { chunk: number; maxRows: number }) => {
    const n = Math.min(opts.chunk, remaining)
    remaining -= n
    return { deleted: n }
  })
  return {
    storage: {
      getMinConfirmedSyncCursor: vi.fn(async () => watermark),
      pruneSupersededChanges: prune
    } as unknown as SQLiteNodeStorageAdapter,
    prune,
    remaining: () => remaining
  }
}

function makeSqlite(mode: 'opfs' | 'memory' = 'opfs') {
  return {
    getStorageMode: vi.fn(async () => mode)
  } as unknown as SQLiteAdapter
}

describe('scheduleChangeLogCompaction (0254; boot-gated in 0260)', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetBootTimeline()
    vi.useFakeTimers()
    // Run idle callbacks synchronously so the chunk loop can be driven to completion.
    ;(
      window as unknown as {
        requestIdleCallback: (cb: () => void) => number
      }
    ).requestIdleCallback = (cb: () => void) => {
      cb()
      return 1
    }
    // Visible tab by default (the compactor bails when hidden).
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible'
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function releaseBootGate(): Promise<void> {
    bootMark('query:first-rows')
    await vi.advanceTimersByTimeAsync(3100)
    await vi.advanceTimersByTimeAsync(0)
  }

  it('does not prune before first paint, then prunes in small chunks until dry', async () => {
    const { storage, prune } = makeNodeStorage(4500) // 2000 + 2000 + 500
    scheduleChangeLogCompaction(storage, makeSqlite('opfs'))

    // Nothing touches the worker before the boot-settled gate is released.
    await vi.advanceTimersByTimeAsync(0)
    expect(prune).not.toHaveBeenCalled()

    await releaseBootGate()

    // Three passes: two full chunks then a short one that ends the loop-until-dry.
    expect(prune).toHaveBeenCalledTimes(3)
    expect(prune).toHaveBeenLastCalledWith(expect.any(Number), { chunk: CHUNK, maxRows: CHUNK })
  })

  it('is a no-op when the kill switch is set to off', async () => {
    localStorage.setItem(KILL_SWITCH, 'off')
    const { storage, prune } = makeNodeStorage(4500)
    scheduleChangeLogCompaction(storage, makeSqlite('opfs'))
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })

  it('prunes nothing when the workspace has never confirmed a sync (no safe floor)', async () => {
    const { storage, prune } = makeNodeStorage(4500, null)
    scheduleChangeLogCompaction(storage, makeSqlite('opfs'))
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })

  it('skips an in-memory database (no durable file to shrink)', async () => {
    const { storage, prune } = makeNodeStorage(4500)
    scheduleChangeLogCompaction(storage, makeSqlite('memory'))
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })

  it('stops before the first chunk when the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    const { storage, prune } = makeNodeStorage(4500)
    scheduleChangeLogCompaction(storage, makeSqlite('opfs'))
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })
})
