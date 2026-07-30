import { describe, it, expect, vi } from 'vitest'
import {
  ConsoleLogStore,
  clearLogSnapshot,
  scrubLogText,
  LOG_PRESERVE_FLAG,
  LOG_SNAPSHOT_KEY,
  type StorageLike
} from './log-store'

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    }
  }
}

function makeStore(options: Partial<ConstructorParameters<typeof ConsoleLogStore>[0]> = {}) {
  const sessionStore = fakeStorage()
  const flagStore = fakeStorage()
  const store = new ConsoleLogStore({ sessionStore, flagStore, ...options })
  return { store, sessionStore, flagStore }
}

const entry = (message: string, at = 1) =>
  ({ level: 'log', channel: 'general', message, at }) as const

describe('ConsoleLogStore', () => {
  it('stores entries with increasing ids', () => {
    const { store } = makeStore()
    store.push(entry('a'))
    store.push(entry('b'))
    expect(store.size).toBe(2)
    expect(store.getEntries().map((e) => [e.id, e.message])).toEqual([
      [0, 'a'],
      [1, 'b']
    ])
  })

  it('evicts oldest entries past capacity', () => {
    const { store } = makeStore({ maxEntries: 3 })
    for (let i = 0; i < 5; i++) store.push(entry(`m${i}`))
    expect(store.size).toBe(3)
    expect(store.getEntries().map((e) => e.message)).toEqual(['m2', 'm3', 'm4'])
  })

  it('notifies subscribers on push and clear, and unsubscribes cleanly', () => {
    const { store } = makeStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.push(entry('a'))
    expect(listener).toHaveBeenCalledTimes(1)
    store.clear()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.size).toBe(0)
    unsubscribe()
    store.push(entry('b'))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('keeps capturing after a subscriber detaches (panel unmount)', () => {
    const { store } = makeStore()
    const unsubscribe = store.subscribe(() => {})
    store.push(entry('while mounted'))
    unsubscribe() // panel unmounts — the store must keep recording
    store.push(entry('while unmounted'))
    expect(store.getEntries().map((e) => e.message)).toEqual(['while mounted', 'while unmounted'])
  })

  it('a throwing listener does not break capture', () => {
    const { store } = makeStore()
    store.subscribe(() => {
      throw new Error('boom')
    })
    expect(() => store.push(entry('a'))).not.toThrow()
    expect(store.size).toBe(1)
  })

  describe('preserve (session persistence)', () => {
    it('snapshotNow is a no-op unless preserve is on', () => {
      const { store, sessionStore } = makeStore()
      store.push(entry('a'))
      store.snapshotNow()
      expect(sessionStore.data.has(LOG_SNAPSHOT_KEY)).toBe(false)
    })

    it('round-trips entries through snapshot/hydrate with restored flag', () => {
      const { store, sessionStore, flagStore } = makeStore()
      store.setPreserve(true)
      expect(flagStore.getItem(LOG_PRESERVE_FLAG)).toBe('true')
      store.push(entry('kept', 42))
      store.snapshotNow()

      // "reload": fresh store over the same storages
      const reloaded = new ConsoleLogStore({ sessionStore, flagStore })
      reloaded.hydrate()
      const entries = reloaded.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ message: 'kept', at: 42, restored: true })

      // live entries after hydrate are not marked restored
      reloaded.push(entry('live'))
      expect(reloaded.getEntries()[1].restored).toBeUndefined()
    })

    it('scrubs tokens, emails, UUIDs and DIDs at snapshot time only', () => {
      const { store, sessionStore } = makeStore()
      store.setPreserve(true)
      const secret = `token=${'a'.repeat(40)} from user@example.com did:key:z6Mk`
      store.push(entry(secret))
      store.snapshotNow()

      // live view stays raw
      expect(store.getEntries()[0].message).toBe(secret)
      const snapshot = sessionStore.data.get(LOG_SNAPSHOT_KEY)!
      expect(snapshot).toContain('[TOKEN]')
      expect(snapshot).toContain('[EMAIL]')
      expect(snapshot).toContain('did:method:[REDACTED]')
      expect(snapshot).not.toContain('a'.repeat(40))
      expect(snapshot).not.toContain('user@example.com')
    })

    it('truncates oldest entries when the snapshot exceeds the byte cap', () => {
      const { store, sessionStore } = makeStore({ maxSnapshotBytes: 5_000 })
      store.setPreserve(true)
      for (let i = 0; i < 200; i++) store.push(entry(`filler message number ${i}`))
      store.snapshotNow()
      const snapshot = JSON.parse(sessionStore.data.get(LOG_SNAPSHOT_KEY)!) as Array<{
        message: string
      }>
      expect(snapshot.length).toBeLessThan(200)
      expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(5_000)
      // newest entries survive
      expect(snapshot[snapshot.length - 1].message).toBe('filler message number 199')
    })

    it('swallows quota errors on snapshot', () => {
      const sessionStore: StorageLike = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('quota', 'QuotaExceededError')
        },
        removeItem: () => {}
      }
      const store = new ConsoleLogStore({ sessionStore, flagStore: fakeStorage() })
      store.setPreserve(true)
      store.push(entry('a'))
      expect(() => store.snapshotNow()).not.toThrow()
    })

    it('setPreserve(false) removes the flag and the snapshot', () => {
      const { store, sessionStore, flagStore } = makeStore()
      store.setPreserve(true)
      store.push(entry('a'))
      store.snapshotNow()
      expect(sessionStore.data.has(LOG_SNAPSHOT_KEY)).toBe(true)

      store.setPreserve(false)
      expect(flagStore.getItem(LOG_PRESERVE_FLAG)).toBeNull()
      expect(sessionStore.data.has(LOG_SNAPSHOT_KEY)).toBe(false)
    })

    it('drops a corrupt snapshot instead of throwing', () => {
      const { sessionStore, flagStore } = makeStore()
      flagStore.setItem(LOG_PRESERVE_FLAG, 'true')
      sessionStore.setItem(LOG_SNAPSHOT_KEY, '{not json')
      const store = new ConsoleLogStore({ sessionStore, flagStore })
      expect(() => store.hydrate()).not.toThrow()
      expect(store.size).toBe(0)
      expect(sessionStore.data.has(LOG_SNAPSHOT_KEY)).toBe(false)
    })

    it('clearLogSnapshot removes the key from an injected storage', () => {
      const sessionStore = fakeStorage()
      sessionStore.setItem(LOG_SNAPSHOT_KEY, '[]')
      clearLogSnapshot(sessionStore)
      expect(sessionStore.data.has(LOG_SNAPSHOT_KEY)).toBe(false)
    })
  })
})

describe('scrubLogText', () => {
  it('redacts the telemetry scrubber patterns', () => {
    expect(scrubLogText('mail me at a.b@example.org')).toBe('mail me at [EMAIL]')
    expect(scrubLogText('id 123e4567-e89b-12d3-a456-426614174000')).toBe('id [UUID]')
    expect(scrubLogText('did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK')).toBe(
      'did:method:[REDACTED]'
    )
    expect(scrubLogText(`bearer ${'x'.repeat(32)}`)).toBe('bearer [TOKEN]')
    expect(scrubLogText('short plain message')).toBe('short plain message')
  })
})
