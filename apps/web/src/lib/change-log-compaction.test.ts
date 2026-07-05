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

function makeSqlite(
  mode: 'opfs' | 'memory' = 'opfs',
  { withIncrementalVacuum = true, freelistPages = 0 } = {}
) {
  const exec = vi.fn(async (_sql: string) => undefined)
  const incrementalVacuum = vi.fn(async () => freelistPages)
  const queryOne = vi.fn(async (_sql: string) => ({ freelist_count: freelistPages }))
  const sqlite = {
    getStorageMode: vi.fn(async () => mode),
    exec,
    queryOne,
    ...(withIncrementalVacuum ? { incrementalVacuum } : {})
  } as unknown as SQLiteAdapter
  return { sqlite, exec, incrementalVacuum, queryOne }
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
    const { sqlite } = makeSqlite('opfs')
    scheduleChangeLogCompaction(storage, sqlite)

    // Nothing touches the worker before the boot-settled gate is released.
    await vi.advanceTimersByTimeAsync(0)
    expect(prune).not.toHaveBeenCalled()

    await releaseBootGate()

    // Three passes: two full chunks then a short one that ends the loop-until-dry.
    expect(prune).toHaveBeenCalledTimes(3)
    expect(prune).toHaveBeenLastCalledWith(expect.any(Number), { chunk: CHUNK, maxRows: CHUNK })
  })

  it('reclaims freed pages via the stepping incrementalVacuum after pruning', async () => {
    const { storage } = makeNodeStorage(4500)
    const { sqlite, exec, incrementalVacuum } = makeSqlite('opfs')
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    // The adapter method steps the pragma to completion; a bare exec of
    // `PRAGMA incremental_vacuum` frees only ONE page per call on WASM.
    expect(incrementalVacuum).toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalledWith('PRAGMA incremental_vacuum')
  })

  it('falls back to exec on adapters without incrementalVacuum', async () => {
    const { storage } = makeNodeStorage(4500)
    const { sqlite, exec } = makeSqlite('opfs', { withIncrementalVacuum: false })
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(exec).toHaveBeenCalledWith('PRAGMA incremental_vacuum')
  })

  it('does not reclaim on a dry pass with a small freelist', async () => {
    const { storage } = makeNodeStorage(0) // already fully compacted
    const { sqlite, exec, incrementalVacuum } = makeSqlite('opfs', { freelistPages: 12 })
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(incrementalVacuum).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
  })

  it('reclaims a stranded freelist backlog even when the pass deleted nothing', async () => {
    // Earlier passes could leave freed pages behind (hidden-tab bail, or the
    // one-page-per-exec reclaim bug) — a dry pass must still return them.
    const { storage } = makeNodeStorage(0)
    const { sqlite, incrementalVacuum } = makeSqlite('opfs', { freelistPages: 9000 })
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(incrementalVacuum).toHaveBeenCalled()
  })

  it('is a no-op when the kill switch is set to off', async () => {
    localStorage.setItem(KILL_SWITCH, 'off')
    const { storage, prune } = makeNodeStorage(4500)
    const { sqlite, exec, incrementalVacuum } = makeSqlite('opfs')
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
    expect(incrementalVacuum).not.toHaveBeenCalled()
  })

  it('prunes nothing when the workspace has never confirmed a sync (no safe floor)', async () => {
    const { storage, prune } = makeNodeStorage(4500, null)
    const { sqlite } = makeSqlite('opfs')
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })

  it('skips an in-memory database (no durable file to shrink)', async () => {
    const { storage, prune } = makeNodeStorage(4500)
    const { sqlite } = makeSqlite('memory')
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })

  it('stops before the first chunk when the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })
    const { storage, prune } = makeNodeStorage(4500)
    const { sqlite } = makeSqlite('opfs')
    scheduleChangeLogCompaction(storage, sqlite)
    await releaseBootGate()
    expect(prune).not.toHaveBeenCalled()
  })
})
