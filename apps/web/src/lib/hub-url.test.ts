import { afterEach, describe, expect, it } from 'vitest'
import {
  HUB_URL_STORAGE_KEY,
  normalizeHubUrl,
  persistedHubUrl,
  readHubParam,
  setPersistedHubUrl
} from './hub-url'

afterEach(() => localStorage.clear())

describe('normalizeHubUrl', () => {
  it('converts an https endpoint to its wss WebSocket form', () => {
    expect(normalizeHubUrl('https://t-abc.hub.xnet.fyi')).toBe('wss://t-abc.hub.xnet.fyi')
  })

  it('converts an http endpoint to ws', () => {
    expect(normalizeHubUrl('http://localhost:4444')).toBe('ws://localhost:4444')
  })

  it('passes a ws/wss URL through unchanged', () => {
    expect(normalizeHubUrl('wss://mine.example')).toBe('wss://mine.example')
    expect(normalizeHubUrl('ws://localhost:4444')).toBe('ws://localhost:4444')
  })

  it('strips a trailing slash', () => {
    expect(normalizeHubUrl('https://t-abc.hub.xnet.fyi/')).toBe('wss://t-abc.hub.xnet.fyi')
  })

  it('accepts an uppercase scheme (and the fixed-length slice stays correct)', () => {
    expect(normalizeHubUrl('HTTPS://h.example')).toBe('wss://h.example')
    expect(normalizeHubUrl('HTTP://h.example')).toBe('ws://h.example')
  })

  it('preserves a port', () => {
    expect(normalizeHubUrl('https://h.example:8443')).toBe('wss://h.example:8443')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeHubUrl('  https://h.example  ')).toBe('wss://h.example')
  })

  it('rejects non-hub / hostile schemes and garbage', () => {
    expect(normalizeHubUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeHubUrl('data:text/html,x')).toBeNull()
    expect(normalizeHubUrl('/relative/path')).toBeNull()
    expect(normalizeHubUrl('not a url')).toBeNull()
    expect(normalizeHubUrl('')).toBeNull()
    expect(normalizeHubUrl('https://')).toBeNull()
  })
})

describe('readHubParam', () => {
  it('reads + normalizes a hub from the query string', () => {
    expect(readHubParam('?hub=https://t-abc.hub.xnet.fyi', '')).toEqual({
      present: true,
      hub: 'wss://t-abc.hub.xnet.fyi'
    })
  })

  it('reads a hub from the hash-router query (fragment)', () => {
    expect(readHubParam('', '#/doc/x?hub=https://h.example')).toEqual({
      present: true,
      hub: 'wss://h.example'
    })
  })

  it('decodes a percent-encoded value (the form the dashboard emits)', () => {
    expect(readHubParam('?hub=wss%3A%2F%2Ft-abc.hub.xnet.fyi', '')).toEqual({
      present: true,
      hub: 'wss://t-abc.hub.xnet.fyi'
    })
  })

  it('reports present-but-null for an invalid value (so the caller still strips it)', () => {
    // a `hub` key with a hostile/garbage value is "present" (→ stripped) but not
    // persisted (hub === null); an absent key is reported not-present.
    expect(readHubParam('?hub=javascript:alert(1)', '')).toEqual({ present: true, hub: null })
    expect(readHubParam('?hub=not%20a%20url', '')).toEqual({ present: true, hub: null })
  })

  it('reports absent when there is no hub param', () => {
    expect(readHubParam('?foo=1', '#/doc/x')).toEqual({ present: false, hub: null })
    expect(readHubParam('', '')).toEqual({ present: false, hub: null })
  })
})

describe('persistedHubUrl', () => {
  it('falls back to the build-time default when nothing is stored', () => {
    expect(persistedHubUrl('wss://hub.xnet.fyi')).toBe('wss://hub.xnet.fyi')
  })

  it('returns the stored hub URL once configured', () => {
    localStorage.setItem(HUB_URL_STORAGE_KEY, 'wss://t-user-a.hub.xnet.fyi')
    expect(persistedHubUrl('wss://hub.xnet.fyi')).toBe('wss://t-user-a.hub.xnet.fyi')
  })

  it('round-trips through setPersistedHubUrl', () => {
    setPersistedHubUrl('wss://mine.example')
    expect(persistedHubUrl('fallback')).toBe('wss://mine.example')
  })

  it('clears the stored value when set to empty', () => {
    setPersistedHubUrl('wss://mine.example')
    setPersistedHubUrl('')
    expect(localStorage.getItem(HUB_URL_STORAGE_KEY)).toBeNull()
    expect(persistedHubUrl('fallback')).toBe('fallback')
  })
})
