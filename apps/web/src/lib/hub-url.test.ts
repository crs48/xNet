import { afterEach, describe, expect, it } from 'vitest'
import { HUB_URL_STORAGE_KEY, persistedHubUrl, setPersistedHubUrl } from './hub-url'

afterEach(() => localStorage.clear())

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
