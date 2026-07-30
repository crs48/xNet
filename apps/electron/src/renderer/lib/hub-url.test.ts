import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HUB_URL_STORAGE_KEY,
  configuredHubUrl,
  defaultHubUrl,
  normalizeHubUrl,
  persistedHubUrl,
  setPersistedHubUrl
} from './hub-url'

// The renderer relies on the browser localStorage; the vitest config runs in the
// node environment, so stand up a minimal Map-backed stub on globalThis.
function installStubStorage(): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    }
  } as Storage
  return store
}

describe('renderer hub-url', () => {
  beforeEach(() => {
    installStubStorage()
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it('falls back to the build default when nothing is persisted', () => {
    expect(persistedHubUrl('wss://fallback.example')).toBe('wss://fallback.example')
    expect(configuredHubUrl()).toBe(defaultHubUrl())
  })

  it('round-trips a persisted hub URL', () => {
    setPersistedHubUrl('wss://hub.xnet.fyi')
    expect(localStorage.getItem(HUB_URL_STORAGE_KEY)).toBe('wss://hub.xnet.fyi')
    expect(persistedHubUrl('wss://fallback.example')).toBe('wss://hub.xnet.fyi')
    expect(configuredHubUrl()).toBe('wss://hub.xnet.fyi')
  })

  it('clears the override when set to empty', () => {
    setPersistedHubUrl('wss://hub.xnet.fyi')
    setPersistedHubUrl('')
    expect(localStorage.getItem(HUB_URL_STORAGE_KEY)).toBeNull()
    expect(persistedHubUrl('wss://fallback.example')).toBe('wss://fallback.example')
  })

  it('tolerates a missing localStorage (returns the fallback)', () => {
    delete (globalThis as { localStorage?: Storage }).localStorage
    expect(persistedHubUrl('wss://fallback.example')).toBe('wss://fallback.example')
    // Must not throw even though there is nowhere to write.
    expect(() => setPersistedHubUrl('wss://hub.xnet.fyi')).not.toThrow()
  })
})

describe('normalizeHubUrl', () => {
  it('converts https/http to wss/ws', () => {
    expect(normalizeHubUrl('https://t-abc.hub.xnet.fyi')).toBe('wss://t-abc.hub.xnet.fyi')
    expect(normalizeHubUrl('http://localhost:4444')).toBe('ws://localhost:4444')
  })

  it('passes ws/wss through and strips a trailing slash', () => {
    expect(normalizeHubUrl('wss://mine.example')).toBe('wss://mine.example')
    expect(normalizeHubUrl('wss://mine.example/')).toBe('wss://mine.example')
  })

  it('is scheme-case-insensitive and keeps an explicit port', () => {
    expect(normalizeHubUrl('HTTPS://h.example')).toBe('wss://h.example')
    expect(normalizeHubUrl('https://h.example:8443')).toBe('wss://h.example:8443')
  })

  it('rejects anything that is not a ws(s)-able URL with a host', () => {
    // A rejected value must never be persisted — the caller surfaces the error
    // rather than dialing something the sync manager cannot reach.
    expect(normalizeHubUrl('hub.example.com')).toBeNull()
    expect(normalizeHubUrl('https://')).toBeNull()
    expect(normalizeHubUrl('ftp://h.example')).toBeNull()
    expect(normalizeHubUrl('   ')).toBeNull()
  })
})
