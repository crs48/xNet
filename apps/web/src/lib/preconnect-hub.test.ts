import { afterEach, describe, expect, it } from 'vitest'
import { hubHttpOrigin, preconnectHub } from './preconnect-hub'

afterEach(() => {
  document.head.querySelectorAll('link[rel="preconnect"],link[rel="dns-prefetch"]').forEach((l) => {
    l.remove()
  })
})

describe('hubHttpOrigin', () => {
  it('maps wss:// to an https origin', () => {
    expect(hubHttpOrigin('wss://hub.xnet.fyi')).toBe('https://hub.xnet.fyi')
    expect(hubHttpOrigin('wss://hub.xnet.fyi/sync?x=1')).toBe('https://hub.xnet.fyi')
  })

  it('maps ws:// to an http origin and keeps the port', () => {
    expect(hubHttpOrigin('ws://localhost:4444')).toBe('http://localhost:4444')
  })

  it('returns null for empty or invalid URLs', () => {
    expect(hubHttpOrigin('')).toBeNull()
    expect(hubHttpOrigin('not a url')).toBeNull()
  })
})

describe('preconnectHub', () => {
  it('injects preconnect + dns-prefetch links for a configured hub', () => {
    preconnectHub('wss://hub.xnet.fyi')
    const preconnect = document.head.querySelector('link[rel="preconnect"]')
    const dns = document.head.querySelector('link[rel="dns-prefetch"]')
    expect(preconnect?.getAttribute('href')).toBe('https://hub.xnet.fyi')
    expect(dns?.getAttribute('href')).toBe('https://hub.xnet.fyi')
  })

  it('does not inject anything when no hub is configured (local-first)', () => {
    preconnectHub('')
    expect(document.head.querySelector('link[rel="preconnect"]')).toBeNull()
  })

  it('is idempotent — does not duplicate links', () => {
    preconnectHub('wss://hub.xnet.fyi')
    preconnectHub('wss://hub.xnet.fyi')
    expect(document.head.querySelectorAll('link[rel="preconnect"]')).toHaveLength(1)
  })
})
