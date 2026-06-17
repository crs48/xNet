import { generateSigningKeyPair } from '@xnetjs/crypto'
import { describe, it, expect } from 'vitest'
import {
  generateLicenseKeypair,
  publicKeyFromHex,
  privateKeyFromHex,
  publicKeyHexFromPrivateHex
} from './keys'
import { mintPluginLicense, checkLicenseFor, PERPETUAL_EXPIRY_MS, DEFAULT_GRACE_SEC } from './mint'
import { signPluginLicense, verifyPluginLicense, type PluginLicenseClaims } from './token'

const NOW = 1_700_000_000_000
const BUYER = 'did:key:zBuyer'
const PLUGIN = 'com.acme.kanban'

function freshClaims(over: Partial<PluginLicenseClaims> = {}): PluginLicenseClaims {
  return {
    v: 1,
    pluginId: PLUGIN,
    buyerDid: BUYER,
    mode: 'one-time',
    issuedAt: NOW,
    expiresAt: PERPETUAL_EXPIRY_MS,
    graceSec: DEFAULT_GRACE_SEC,
    ...over
  }
}

describe('signPluginLicense / verifyPluginLicense', () => {
  it('round-trips a signed license', () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const token = signPluginLicense(freshClaims(), privateKey)
    const result = verifyPluginLicense(token, publicKey, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.claims.pluginId).toBe(PLUGIN)
      expect(result.claims.buyerDid).toBe(BUYER)
    }
  })

  it('rejects a token signed by a different key (forgery)', () => {
    const platform = generateSigningKeyPair()
    const attacker = generateSigningKeyPair()
    const token = signPluginLicense(freshClaims(), attacker.privateKey)
    const result = verifyPluginLicense(token, platform.publicKey, NOW)
    expect(result).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a tampered payload', () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const token = signPluginLicense(freshClaims(), privateKey)
    const [payload, sig] = token.split('.')
    // Flip a character in the payload — signature no longer matches.
    const mutated = `${payload.slice(0, -1)}${payload.slice(-1) === 'A' ? 'B' : 'A'}.${sig}`
    expect(verifyPluginLicense(mutated, publicKey, NOW).ok).toBe(false)
  })

  it('rejects malformed tokens', () => {
    const { publicKey } = generateSigningKeyPair()
    expect(verifyPluginLicense('no-dot', publicKey, NOW)).toEqual({
      ok: false,
      reason: 'malformed'
    })
    expect(verifyPluginLicense('.sig', publicKey, NOW)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyPluginLicense('payload.', publicKey, NOW)).toEqual({
      ok: false,
      reason: 'malformed'
    })
  })

  it('rejects an unsupported token version', () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    // Cast through unknown to forge a v2 claim the current verifier rejects.
    const token = signPluginLicense(freshClaims({ v: 2 as unknown as 1 }), privateKey)
    expect(verifyPluginLicense(token, publicKey, NOW)).toEqual({
      ok: false,
      reason: 'unsupported-version'
    })
  })

  it('enforces expiry with a grace window', () => {
    const { publicKey, privateKey } = generateSigningKeyPair()
    const expiresAt = NOW
    const graceSec = 100
    const token = signPluginLicense(
      freshClaims({ mode: 'subscription', expiresAt, graceSec }),
      privateKey
    )
    // Inside grace: still valid.
    expect(verifyPluginLicense(token, publicKey, expiresAt + 50 * 1000).ok).toBe(true)
    // Past grace: expired.
    expect(verifyPluginLicense(token, publicKey, expiresAt + 200 * 1000)).toEqual({
      ok: false,
      reason: 'expired'
    })
  })
})

describe('keys', () => {
  it('generates a keypair and round-trips hex encoding', () => {
    const { publicKeyHex, privateKeyHex } = generateLicenseKeypair()
    const token = signPluginLicense(freshClaims(), privateKeyFromHex(privateKeyHex))
    expect(verifyPluginLicense(token, publicKeyFromHex(publicKeyHex), NOW).ok).toBe(true)
  })

  it('recovers the public key from the private key', () => {
    const { publicKeyHex, privateKeyHex } = generateLicenseKeypair()
    expect(publicKeyHexFromPrivateHex(privateKeyHex)).toBe(publicKeyHex)
  })
})

describe('mintPluginLicense', () => {
  const { publicKey, privateKey } = generateSigningKeyPair()

  it('mints a perpetual one-time license', () => {
    const token = mintPluginLicense(
      { pluginId: PLUGIN, buyerDid: BUYER, mode: 'one-time', now: NOW },
      privateKey
    )
    const result = verifyPluginLicense(token, publicKey, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.claims.expiresAt).toBe(PERPETUAL_EXPIRY_MS)
  })

  it('mints a subscription license that expires at the period end', () => {
    const periodEnd = NOW + 60 * 1000
    const token = mintPluginLicense(
      {
        pluginId: PLUGIN,
        buyerDid: BUYER,
        mode: 'subscription',
        now: NOW,
        periodEnd,
        graceSec: 10
      },
      privateKey
    )
    expect(verifyPluginLicense(token, publicKey, periodEnd + 5 * 1000).ok).toBe(true)
    expect(verifyPluginLicense(token, publicKey, periodEnd + 20 * 1000).ok).toBe(false)
  })

  it('defaults a subscription lifetime when no period end is given', () => {
    const token = mintPluginLicense(
      { pluginId: PLUGIN, buyerDid: BUYER, mode: 'subscription', now: NOW },
      privateKey
    )
    const result = verifyPluginLicense(token, publicKey, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.claims.expiresAt).toBeGreaterThan(NOW)
  })
})

describe('checkLicenseFor', () => {
  const { publicKey, privateKey } = generateSigningKeyPair()
  const token = mintPluginLicense(
    { pluginId: PLUGIN, buyerDid: BUYER, mode: 'one-time', now: NOW },
    privateKey
  )

  it('accepts a matching plugin + buyer', () => {
    expect(
      checkLicenseFor(token, { pluginId: PLUGIN, buyerDid: BUYER, publicKey, now: NOW }).ok
    ).toBe(true)
  })

  it('reports a missing token', () => {
    expect(
      checkLicenseFor(undefined, { pluginId: PLUGIN, buyerDid: BUYER, publicKey, now: NOW })
    ).toEqual({ ok: false, reason: 'no-license' })
  })

  it('rejects a token issued for a different plugin', () => {
    expect(
      checkLicenseFor(token, { pluginId: 'com.other.thing', buyerDid: BUYER, publicKey, now: NOW })
    ).toEqual({ ok: false, reason: 'wrong-plugin' })
  })

  it('rejects a token issued to a different buyer', () => {
    expect(
      checkLicenseFor(token, {
        pluginId: PLUGIN,
        buyerDid: 'did:key:zSomeoneElse',
        publicKey,
        now: NOW
      })
    ).toEqual({ ok: false, reason: 'wrong-buyer' })
  })

  it('propagates a verification failure (bad signature)', () => {
    const attacker = generateSigningKeyPair()
    expect(
      checkLicenseFor(token, {
        pluginId: PLUGIN,
        buyerDid: BUYER,
        publicKey: attacker.publicKey,
        now: NOW
      })
    ).toEqual({ ok: false, reason: 'bad-signature' })
  })
})
