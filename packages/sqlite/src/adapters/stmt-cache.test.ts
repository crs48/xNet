/**
 * @xnetjs/sqlite - StmtCache unit tests (exploration 0263)
 */

import { describe, it, expect, vi } from 'vitest'
import { StmtCache, hasInteriorSemicolon, DEFAULT_STMT_CACHE_CAPACITY } from './stmt-cache'

function fakeStmt() {
  return { finalize: vi.fn() }
}

describe('hasInteriorSemicolon', () => {
  it('accepts single statements', () => {
    expect(hasInteriorSemicolon('SELECT 1')).toBe(false)
    expect(hasInteriorSemicolon('SELECT 1;')).toBe(false)
    expect(hasInteriorSemicolon('SELECT 1 ;  \n')).toBe(false)
    expect(hasInteriorSemicolon('SELECT 1;;')).toBe(false)
  })

  it('flags multi-statement SQL', () => {
    expect(hasInteriorSemicolon('SELECT 1; SELECT 2')).toBe(true)
    expect(hasInteriorSemicolon('DROP TABLE t;\nCREATE TABLE t(a)')).toBe(true)
  })

  it('is conservative about semicolons inside literals (bypasses the cache)', () => {
    // Wrong-but-safe: a literal ';' routes to the exec path, never the cache.
    expect(hasInteriorSemicolon("SELECT 'a;b'")).toBe(true)
  })
})

describe('StmtCache', () => {
  it('defaults to a bounded capacity', () => {
    expect(DEFAULT_STMT_CACHE_CAPACITY).toBeGreaterThan(0)
    expect(() => new StmtCache(0)).toThrow()
  })

  it('returns cached statements and tracks size', () => {
    const cache = new StmtCache<{ finalize(): void }>(4)
    const a = fakeStmt()
    cache.set('A', a)
    expect(cache.get('A')).toBe(a)
    expect(cache.get('B')).toBeUndefined()
    expect(cache.size).toBe(1)
  })

  it('evicts least-recently-used and finalizes the evicted handle', () => {
    const cache = new StmtCache<{ finalize(): void }>(2)
    const a = fakeStmt()
    const b = fakeStmt()
    const c = fakeStmt()
    cache.set('A', a)
    cache.set('B', b)
    // Touch A so B becomes the LRU entry.
    cache.get('A')
    cache.set('C', c)

    expect(cache.size).toBe(2)
    expect(cache.get('B')).toBeUndefined()
    expect(b.finalize).toHaveBeenCalledTimes(1)
    expect(cache.get('A')).toBe(a)
    expect(cache.get('C')).toBe(c)
    expect(a.finalize).not.toHaveBeenCalled()
    expect(c.finalize).not.toHaveBeenCalled()
  })

  it('finalizes a replaced statement for the same SQL', () => {
    const cache = new StmtCache<{ finalize(): void }>(2)
    const first = fakeStmt()
    const second = fakeStmt()
    cache.set('A', first)
    cache.set('A', second)
    expect(first.finalize).toHaveBeenCalledTimes(1)
    expect(cache.get('A')).toBe(second)
    expect(cache.size).toBe(1)
  })

  it('clear() finalizes everything and empties the cache', () => {
    const cache = new StmtCache<{ finalize(): void }>(4)
    const a = fakeStmt()
    const b = fakeStmt()
    cache.set('A', a)
    cache.set('B', b)
    cache.clear()
    expect(a.finalize).toHaveBeenCalledTimes(1)
    expect(b.finalize).toHaveBeenCalledTimes(1)
    expect(cache.size).toBe(0)
  })

  it('survives finalize() throwing during eviction and clear', () => {
    const cache = new StmtCache<{ finalize(): void }>(1)
    const explosive = {
      finalize: vi.fn(() => {
        throw new Error('already finalized')
      })
    }
    cache.set('A', explosive)
    expect(() => cache.set('B', fakeStmt())).not.toThrow()
    cache.set('C', {
      finalize: vi.fn(() => {
        throw new Error('boom')
      })
    })
    expect(() => cache.clear()).not.toThrow()
    expect(cache.size).toBe(0)
  })
})
