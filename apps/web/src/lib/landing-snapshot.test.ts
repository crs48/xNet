import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetLandingSnapshot, readLandingRows, writeLandingRows } from './landing-snapshot'

function mockStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string): string | null => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string): void => {
      store.set(k, v)
    },
    removeItem: (k: string): void => {
      store.delete(k)
    },
    clear: (): void => store.clear()
  }
}

describe('landing snapshot (0249 F2)', () => {
  let storage: ReturnType<typeof mockStorage>

  beforeEach(() => {
    storage = mockStorage()
    vi.stubGlobal('localStorage', storage)
    __resetLandingSnapshot(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    __resetLandingSnapshot()
  })

  it('round-trips rows for a key (re-read from storage)', () => {
    writeLandingRows('page', [
      { id: 'a', title: 'A', updatedAt: 2 },
      { id: 'b', updatedAt: 1 }
    ])
    __resetLandingSnapshot() // drop the in-memory memo to force a storage read
    expect(readLandingRows('page')).toEqual([
      { id: 'a', title: 'A', updatedAt: 2 },
      { id: 'b', updatedAt: 1 }
    ])
  })

  it('returns null for an unknown key and for an empty list', () => {
    expect(readLandingRows('nope')).toBeNull()
    writeLandingRows('page', [])
    expect(readLandingRows('page')).toBeNull()
  })

  it('caps rows per key to 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: String(i), updatedAt: i }))
    writeLandingRows('task', many)
    __resetLandingSnapshot()
    expect(readLandingRows('task')).toHaveLength(50)
  })

  it('keeps multiple keys independent in one blob', () => {
    writeLandingRows('page', [{ id: 'p', updatedAt: 1 }])
    writeLandingRows('database', [{ id: 'd', updatedAt: 1 }])
    __resetLandingSnapshot()
    expect(readLandingRows('page')).toEqual([{ id: 'p', updatedAt: 1 }])
    expect(readLandingRows('database')).toEqual([{ id: 'd', updatedAt: 1 }])
  })

  it('skips the localStorage write when a key is unchanged', () => {
    writeLandingRows('page', [{ id: 'a', updatedAt: 1 }])
    const spy = vi.spyOn(storage, 'setItem')
    writeLandingRows('page', [{ id: 'a', updatedAt: 1 }])
    expect(spy).not.toHaveBeenCalled()
  })

  it('strips non-render fields and coerces updatedAt', () => {
    writeLandingRows('page', [
      { id: 'a', title: 'T', updatedAt: 5, status: 'done' } as { id: string; updatedAt: number }
    ])
    __resetLandingSnapshot()
    expect(readLandingRows('page')).toEqual([{ id: 'a', title: 'T', updatedAt: 5 }])
  })

  it('survives corrupt stored JSON', () => {
    storage.setItem('xnet:landing-snapshot:v1', '{ not json')
    __resetLandingSnapshot()
    expect(readLandingRows('page')).toBeNull()
  })

  it('never throws when setItem rejects (quota exceeded)', () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => writeLandingRows('page', [{ id: 'a', updatedAt: 1 }])).not.toThrow()
  })

  it('is a no-op without localStorage', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', undefined)
    __resetLandingSnapshot()
    expect(() => writeLandingRows('page', [{ id: 'a', updatedAt: 1 }])).not.toThrow()
    expect(readLandingRows('page')).toBeNull()
  })
})
