import { describe, it, expect } from 'vitest'
import { generateIdentity } from '../did'
import { createShareToken, buildCapabilities } from './create-share'
import { parseShareLink, verifyShareToken } from './parse-share'
import { RevocationStore, createRevocation, computeTokenHash } from './revocation'

// ─── Helper ──────────────────────────────────────────────────

function makeIdentity() {
  return generateIdentity()
}

// ─── createShareToken ────────────────────────────────────────

describe('createShareToken', () => {
  it('creates a read-only share', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/123',
      permission: 'read'
    })

    expect(share.permission).toBe('read')
    expect(share.resource).toBe('xnet://test/page/123')
    expect(share.issuer).toBe(identity.did)
    expect(share.expiresAt).toBeGreaterThan(Date.now())
    expect(share.shareLink).toContain('/s/')
    expect(share.token).toBeTruthy()
  })

  it('creates a write share', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/456',
      permission: 'write'
    })

    expect(share.permission).toBe('write')
  })

  it('creates an admin share', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/db/789',
      permission: 'admin'
    })

    expect(share.permission).toBe('admin')
  })

  it('respects custom expiry', () => {
    const { identity, privateKey } = makeIdentity()
    const oneHour = 60 * 60 * 1000

    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read',
      expiresIn: oneHour
    })

    const expectedExpiry = Date.now() + oneHour
    expect(Math.abs(share.expiresAt - expectedExpiry)).toBeLessThan(1000)
  })

  it('includes hub URL in share link when provided', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read',
      hubUrl: 'wss://hub.example.com'
    })

    // Parse it back to verify
    const parsed = parseShareLink(share.shareLink)
    expect(parsed.hubUrl).toBe('wss://hub.example.com')
  })

  it('uses custom base URL', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read',
      baseUrl: 'https://custom.example.com'
    })

    expect(share.shareLink.startsWith('https://custom.example.com/s/')).toBe(true)
  })
})

// ─── buildCapabilities ───────────────────────────────────────

describe('buildCapabilities', () => {
  it('read gives only read capability', () => {
    const caps = buildCapabilities('xnet://r', 'read')
    expect(caps).toEqual([{ with: 'xnet://r', can: 'xnet/read' }])
  })

  it('write gives read + write', () => {
    const caps = buildCapabilities('xnet://r', 'write')
    expect(caps).toHaveLength(2)
    expect(caps).toContainEqual({ with: 'xnet://r', can: 'xnet/read' })
    expect(caps).toContainEqual({ with: 'xnet://r', can: 'xnet/write' })
  })

  it('admin gives read + write + admin', () => {
    const caps = buildCapabilities('xnet://r', 'admin')
    expect(caps).toHaveLength(3)
    expect(caps).toContainEqual({ with: 'xnet://r', can: 'xnet/admin' })
  })
})

// ─── parseShareLink ──────────────────────────────────────────

describe('parseShareLink', () => {
  it('parses a full share link URL', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/abc',
      permission: 'write'
    })

    const parsed = parseShareLink(share.shareLink)
    expect(parsed.resource).toBe('xnet://test/page/abc')
    expect(parsed.issuer).toBe(identity.did)
    expect(parsed.permissions).toContain('read')
    expect(parsed.permissions).toContain('write')
    expect(parsed.expiresAt).toBeGreaterThan(Date.now())
  })

  it('parses just the encoded data portion', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/xyz',
      permission: 'read'
    })

    // Extract just the encoded part
    const encoded = share.shareLink.split('/s/')[1]
    const parsed = parseShareLink(encoded)
    expect(parsed.resource).toBe('xnet://test/page/xyz')
    expect(parsed.permissions).toEqual(['read'])
  })

  it('throws on invalid input', () => {
    expect(() => parseShareLink('not-valid-base64')).toThrow()
  })

  it('throws on wrong version', () => {
    const data = btoa(JSON.stringify({ v: 99, r: 'x', u: 'y' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    expect(() => parseShareLink(data)).toThrow('Unsupported share link version')
  })
})

// ─── verifyShareToken ────────────────────────────────────────

describe('verifyShareToken', () => {
  it('verifies a valid token', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read'
    })

    const result = verifyShareToken(share.token)
    expect(result.valid).toBe(true)
  })

  it('rejects an expired token', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read',
      expiresIn: -10000 // Already expired
    })

    const result = verifyShareToken(share.token)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('expired')
  })

  it('rejects a malformed token', () => {
    const result = verifyShareToken('not.a.valid.token')
    expect(result.valid).toBe(false)
  })
})

// ─── RevocationStore ─────────────────────────────────────────

describe('RevocationStore', () => {
  it('stores and checks revocations', () => {
    const { identity, privateKey } = makeIdentity()
    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read'
    })

    const store = new RevocationStore()
    const revocation = createRevocation(identity.did, privateKey, share.token)
    store.revoke(revocation)

    const tokenHash = computeTokenHash(share.token)
    expect(store.isRevoked(tokenHash)).toBe(true)
  })

  it('reports non-revoked tokens as not revoked', () => {
    const store = new RevocationStore()
    expect(store.isRevoked('nonexistent')).toBe(false)
  })

  it('rejects revocation with invalid signature', () => {
    const { identity, privateKey } = makeIdentity()
    const { privateKey: otherKey } = makeIdentity()

    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read'
    })

    // Sign with wrong key
    const badRevocation = createRevocation(identity.did, otherKey, share.token)

    const store = new RevocationStore()
    expect(() => store.revoke(badRevocation)).toThrow('Invalid revocation signature')
  })

  it('gets revocations by issuer', () => {
    const { identity, privateKey } = makeIdentity()
    const share1 = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read'
    })
    const share2 = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/2',
      permission: 'write'
    })

    const store = new RevocationStore()
    store.revoke(createRevocation(identity.did, privateKey, share1.token))
    store.revoke(createRevocation(identity.did, privateKey, share2.token))

    const revocations = store.getByIssuer(identity.did)
    expect(revocations).toHaveLength(2)
  })

  it('tracks size', () => {
    const { identity, privateKey } = makeIdentity()
    const store = new RevocationStore()
    expect(store.size).toBe(0)

    const share = createShareToken(identity.did, privateKey, {
      resource: 'xnet://test/page/1',
      permission: 'read'
    })
    store.revoke(createRevocation(identity.did, privateKey, share.token))
    expect(store.size).toBe(1)
  })
})

// ─── computeTokenHash ────────────────────────────────────────

describe('computeTokenHash', () => {
  it('produces deterministic hash', () => {
    const hash1 = computeTokenHash('some-token-string')
    const hash2 = computeTokenHash('some-token-string')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different tokens', () => {
    const hash1 = computeTokenHash('token-a')
    const hash2 = computeTokenHash('token-b')
    expect(hash1).not.toBe(hash2)
  })

  it('returns a hex string', () => {
    const hash = computeTokenHash('test')
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })
})
