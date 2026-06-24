import { afterEach, describe, expect, it } from 'vitest'
import {
  HUB_URL_STORAGE_KEY,
  normalizeHubUrl,
  persistedHubUrl,
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
