import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HUB_URL_STORAGE_KEY,
  configuredHubUrl,
  defaultHubUrl,
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
