/**
 * ATProto bridge: foreign-DID representation + binding record (0301/0322/0337).
 */
import { describe, expect, it } from 'vitest'
import { generateIdentity } from '../did'
import { createAtprotoBinding, verifyAtprotoBinding, type AtprotoBindingRecord } from './binding'
import {
  isAtprotoDid,
  isValidAtprotoHandle,
  isXNetDid,
  normalizeAtprotoHandle,
  parseAnyDid
} from './did'

const PLC = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'

describe('foreign DID representation', () => {
  it('recognizes did:plc and did:web, rejects junk', () => {
    expect(isAtprotoDid(PLC)).toBe(true)
    expect(isAtprotoDid('did:web:example.com')).toBe(true)
    expect(isAtprotoDid('did:plc:TOO-SHORT')).toBe(false)
    expect(isAtprotoDid('did:key:z6Mk...')).toBe(false)
    expect(isAtprotoDid('did:plc:' + 'a'.repeat(25))).toBe(false)
  })

  it('classifies via parseAnyDid without touching parseDID guarantees', () => {
    const { identity } = generateIdentity()
    expect(parseAnyDid(identity.did)).toEqual({ kind: 'xnet', did: identity.did })
    expect(parseAnyDid(PLC)).toEqual({ kind: 'atproto-plc', did: PLC })
    expect(parseAnyDid('did:web:example.com')).toEqual({
      kind: 'atproto-web',
      did: 'did:web:example.com'
    })
    expect(parseAnyDid('did:ethr:0xabc')).toBeNull()
    expect(isXNetDid(identity.did)).toBe(true)
    expect(isXNetDid(PLC)).toBe(false)
  })

  it('normalizes and validates handles', () => {
    expect(normalizeAtprotoHandle('@Alice.bsky.social ')).toBe('alice.bsky.social')
    expect(isValidAtprotoHandle('alice.bsky.social')).toBe(true)
    expect(isValidAtprotoHandle('@alice.bsky.social')).toBe(true)
    expect(isValidAtprotoHandle('nodots')).toBe(false)
    expect(isValidAtprotoHandle('has space.com')).toBe(false)
  })
})

describe('binding record', () => {
  it('round-trips create → verify', () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    expect(record.$type).toBe('net.x.identity.binding')
    expect(verifyAtprotoBinding(record)).toEqual({ valid: true })
  })

  it('rejects a record signed by a different xNet key', () => {
    const alice = generateIdentity()
    const mallory = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: alice.identity.did,
      signingKey: alice.privateKey,
      atprotoDid: PLC
    })
    // Mallory claims Alice's binding as her own DID.
    const forged: AtprotoBindingRecord = { ...record, xnetDid: mallory.identity.did }
    const result = verifyAtprotoBinding(forged)
    expect(result.valid).toBe(false)
  })

  it('rejects tampered fields and malformed shapes', () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    expect(
      verifyAtprotoBinding({ ...record, atprotoDid: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa' }).valid
    ).toBe(false)
    expect(verifyAtprotoBinding({ ...record, createdAt: 'not-a-date' }).valid).toBe(false)
    expect(verifyAtprotoBinding({ ...record, $type: 'app.bsky.feed.post' }).valid).toBe(false)
    expect(verifyAtprotoBinding(null).valid).toBe(false)
    expect(verifyAtprotoBinding({}).valid).toBe(false)
  })

  it('refuses to create a binding for a non-ATProto DID', () => {
    const { identity, privateKey } = generateIdentity()
    expect(() =>
      createAtprotoBinding({
        xnetDid: identity.did,
        signingKey: privateKey,
        atprotoDid: 'did:ethr:0xabc'
      })
    ).toThrow()
  })
})
