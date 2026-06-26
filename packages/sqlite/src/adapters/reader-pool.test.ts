/**
 * Tests for the Electron reader-thread pool + dispatcher (exploration 0230).
 *
 * Routing, resilience, and classification are exercised with an in-process fake
 * worker so no thread is spawned and no native addon is loaded. A separate
 * integration test (`electron-reader-pool.test.ts`) proves real parallelism
 * against `better-sqlite3` in actual `worker_threads`.
 */
import type { ReaderRequest, ReaderResponse } from './reader-thread'
import type { SQLRow } from '../types'
import { describe, it, expect, vi } from 'vitest'
import {
  ReaderPool,
  isHeavyRead,
  resolveReaderPoolSize,
  type ReaderWorkerLike
} from './reader-pool'

type Listeners = {
  message?: (v: ReaderResponse | { id: 0; ready: boolean }) => void
  error?: (e: Error) => void
  exit?: (code: number) => void
}

/** A controllable in-process stand-in for a `worker_threads` reader. */
class FakeReaderWorker implements ReaderWorkerLike {
  listeners: Listeners = {}
  inbox: ReaderRequest[] = []
  terminated = false
  constructor(
    public index: number,
    private auto?: (req: ReaderRequest) => ReaderResponse
  ) {}

  postMessage(req: ReaderRequest): void {
    this.inbox.push(req)
    if (this.auto) {
      const res = this.auto(req)
      queueMicrotask(() => this.listeners.message?.(res))
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: any, listener: any): void {
    this.listeners[event as keyof Listeners] = listener
  }
  terminate(): void {
    this.terminated = true
  }

  /** Manually answer a queued request by id (for routing tests). */
  respond(id: number, rows: SQLRow[] = []): void {
    this.listeners.message?.({ id, ok: true, rows })
  }
  boot(ready: boolean): void {
    this.listeners.message?.({ id: 0, ready })
  }
  crash(): void {
    this.listeners.error?.(new Error('worker crashed'))
  }
}

describe('isHeavyRead (0230)', () => {
  it('offloads FTS / aggregate / big-limit reads', () => {
    expect(isHeavyRead("SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH 'x'")).toBe(true)
    expect(isHeavyRead('SELECT schema_id, COUNT(*) FROM nodes GROUP BY schema_id')).toBe(true)
    expect(isHeavyRead('SELECT COUNT(*) FROM nodes')).toBe(true)
    expect(isHeavyRead('SELECT * FROM nodes ORDER BY updated_at DESC LIMIT 5000')).toBe(true)
  })

  it('keeps cheap point reads inline', () => {
    expect(isHeavyRead('SELECT * FROM nodes WHERE id = ?')).toBe(false)
    expect(isHeavyRead('SELECT * FROM nodes ORDER BY updated_at LIMIT 20')).toBe(false)
  })
})

describe('resolveReaderPoolSize (0230)', () => {
  it('disables for in-memory / empty paths', () => {
    expect(resolveReaderPoolSize('auto', ':memory:', 16)).toBe(0)
    expect(resolveReaderPoolSize(4, '', 16)).toBe(0)
  })
  it('honours an explicit size', () => {
    expect(resolveReaderPoolSize(3, '/tmp/x.db', 16)).toBe(3)
    expect(resolveReaderPoolSize(0, '/tmp/x.db', 16)).toBe(0)
    expect(resolveReaderPoolSize(undefined, '/tmp/x.db', 16)).toBe(0)
  })
  it('auto-sizes to cores with headroom, capped at 4', () => {
    expect(resolveReaderPoolSize('auto', '/tmp/x.db', 16)).toBe(4)
    expect(resolveReaderPoolSize('auto', '/tmp/x.db', 4)).toBe(2)
    expect(resolveReaderPoolSize('auto', '/tmp/x.db', 2)).toBe(0)
  })
})

describe('ReaderPool (0230)', () => {
  it('maps a successful query response to rows', async () => {
    const worker = new FakeReaderWorker(0, (req) => ({
      id: req.id,
      ok: true,
      rows: [{ n: 1 }]
    }))
    const pool = new ReaderPool({ dbPath: '/tmp/x.db', size: 1, createWorker: () => worker })
    await expect(pool.query('SELECT 1 as n')).resolves.toEqual([{ n: 1 }])
    expect(pool.stats().dispatched).toBe(1)
  })

  it('rejects when the reader reports an error', async () => {
    const worker = new FakeReaderWorker(0, (req) => ({ id: req.id, ok: false, error: 'boom' }))
    const pool = new ReaderPool({ dbPath: '/tmp/x.db', size: 1, createWorker: () => worker })
    await expect(pool.query('SELECT 1')).rejects.toThrow('boom')
  })

  it('routes to the least-busy reader', async () => {
    const workers = [new FakeReaderWorker(0), new FakeReaderWorker(1)]
    const pool = new ReaderPool({
      dbPath: '/tmp/x.db',
      size: 2,
      createWorker: (i) => workers[i]
    })
    // First two dispatches go to distinct readers (tie broken toward index 0).
    void pool.query('a')
    void pool.query('b')
    await Promise.resolve()
    expect(workers[0].inbox).toHaveLength(1)
    expect(workers[1].inbox).toHaveLength(1)
    // Worker 0 answers, so it's now least-busy and takes the third.
    workers[0].respond(workers[0].inbox[0].id)
    await Promise.resolve()
    void pool.query('c')
    await Promise.resolve()
    expect(workers[0].inbox).toHaveLength(2)
    expect(workers[1].inbox).toHaveLength(1)
  })

  it('drops a crashed reader and serves from the survivor', async () => {
    const good = new FakeReaderWorker(0, (req) => ({ id: req.id, ok: true, rows: [{ ok: 1 }] }))
    const bad = new FakeReaderWorker(1)
    const pool = new ReaderPool({
      dbPath: '/tmp/x.db',
      size: 2,
      createWorker: (i) => (i === 0 ? good : bad)
    })
    expect(pool.isHealthy()).toBe(true)
    bad.crash()
    expect(pool.stats().healthy).toBe(1)
    // All subsequent reads land on the healthy reader.
    await expect(pool.query('SELECT 1')).resolves.toEqual([{ ok: 1 }])
  })

  it('marks a reader down when it fails to boot', async () => {
    const worker = new FakeReaderWorker(0)
    const pool = new ReaderPool({ dbPath: '/tmp/x.db', size: 1, createWorker: () => worker })
    worker.boot(false)
    expect(pool.isHealthy()).toBe(false)
    await expect(pool.query('SELECT 1')).rejects.toThrow(/no healthy reader/)
  })

  it('terminates workers on close', async () => {
    const worker = new FakeReaderWorker(0)
    const pool = new ReaderPool({ dbPath: '/tmp/x.db', size: 1, createWorker: () => worker })
    await pool.close()
    expect(worker.terminated).toBe(true)
    expect(pool.isHealthy()).toBe(false)
  })

  it('survives a worker factory that throws', () => {
    const create = vi.fn(() => {
      throw new Error('spawn failed')
    })
    const pool = new ReaderPool({ dbPath: '/tmp/x.db', size: 2, createWorker: create })
    expect(pool.isHealthy()).toBe(false)
    expect(pool.stats().failures).toBe(2)
  })
})
