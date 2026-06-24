import { afterEach, describe, expect, it } from 'vitest'
import { isAllowedHubUrl, parseConnectDeepLink } from './deep-link'

afterEach(() => {
  delete process.env.XNET_ALLOWED_HUB_HOSTS
})

describe('isAllowedHubUrl', () => {
  it('accepts wss:// on the default hub host and its subdomains', () => {
    expect(isAllowedHubUrl('wss://hub.xnet.fyi')).toBe(true)
    expect(isAllowedHubUrl('wss://hub.xnet.fyi/sync')).toBe(true)
    expect(isAllowedHubUrl('wss://alice.xnet.app')).toBe(true)
    expect(isAllowedHubUrl('wss://t-123.hub.xnet.fyi')).toBe(true)
  })

  it('requires wss:// — rejects ws/http/https', () => {
    expect(isAllowedHubUrl('ws://hub.xnet.fyi')).toBe(false)
    expect(isAllowedHubUrl('http://hub.xnet.fyi')).toBe(false)
    expect(isAllowedHubUrl('https://hub.xnet.fyi')).toBe(false)
    expect(isAllowedHubUrl('ws://localhost:4444')).toBe(false)
  })

  it('rejects hosts off the allowlist, including lookalikes', () => {
    expect(isAllowedHubUrl('wss://evil.example')).toBe(false)
    expect(isAllowedHubUrl('wss://evilxnet.fyi')).toBe(false) // no dot boundary
    expect(isAllowedHubUrl('wss://xnet.fyi.evil.com')).toBe(false)
    expect(isAllowedHubUrl('wss://notxnet.app')).toBe(false)
  })

  it('rejects embedded credentials even on an allowlisted host', () => {
    expect(isAllowedHubUrl('wss://user:pass@hub.xnet.fyi')).toBe(false)
    expect(isAllowedHubUrl('wss://attacker@hub.xnet.fyi')).toBe(false)
  })

  it('rejects malformed, empty, and over-long inputs', () => {
    expect(isAllowedHubUrl('')).toBe(false)
    expect(isAllowedHubUrl('not a url')).toBe(false)
    expect(isAllowedHubUrl(`wss://hub.xnet.fyi/${'a'.repeat(600)}`)).toBe(false)
    // @ts-expect-error — guarding against non-string callers
    expect(isAllowedHubUrl(undefined)).toBe(false)
  })

  it('honors the XNET_ALLOWED_HUB_HOSTS override (still wss-only)', () => {
    process.env.XNET_ALLOWED_HUB_HOSTS = 'hub.internal,example.test'
    expect(isAllowedHubUrl('wss://hub.internal')).toBe(true)
    expect(isAllowedHubUrl('wss://shard1.example.test')).toBe(true)
    // Override replaces the defaults, so the built-in hosts no longer pass.
    expect(isAllowedHubUrl('wss://hub.xnet.fyi')).toBe(false)
    // Override never relaxes the scheme requirement.
    expect(isAllowedHubUrl('http://hub.internal')).toBe(false)
  })
})

describe('parseConnectDeepLink', () => {
  it('parses a valid connect link with just a hub', () => {
    expect(parseConnectDeepLink('xnet://connect?hub=wss%3A%2F%2Fhub.xnet.fyi')).toEqual({
      hub: 'wss://hub.xnet.fyi'
    })
  })

  it('parses an optional code and uppercases it', () => {
    expect(
      parseConnectDeepLink('xnet://connect?hub=wss%3A%2F%2Falice.xnet.app&code=abcd-7k2p')
    ).toEqual({ hub: 'wss://alice.xnet.app', code: 'ABCD-7K2P' })
  })

  it('drops an invalid code but keeps the hub', () => {
    expect(
      parseConnectDeepLink('xnet://connect?hub=wss%3A%2F%2Fhub.xnet.fyi&code=' + 'x'.repeat(40))
    ).toEqual({ hub: 'wss://hub.xnet.fyi' })
  })

  it('rejects a non-allowlisted or non-wss hub', () => {
    expect(parseConnectDeepLink('xnet://connect?hub=wss%3A%2F%2Fevil.example')).toBeNull()
    expect(parseConnectDeepLink('xnet://connect?hub=https%3A%2F%2Fhub.xnet.fyi')).toBeNull()
    expect(parseConnectDeepLink('xnet://connect')).toBeNull()
  })

  it('ignores non-connect / non-xnet URLs', () => {
    expect(parseConnectDeepLink('xnet://share?hub=wss%3A%2F%2Fhub.xnet.fyi')).toBeNull()
    expect(parseConnectDeepLink('https://connect?hub=wss%3A%2F%2Fhub.xnet.fyi')).toBeNull()
    expect(parseConnectDeepLink('garbage')).toBeNull()
    expect(parseConnectDeepLink('')).toBeNull()
  })
})
