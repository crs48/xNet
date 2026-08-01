import { describe, expect, it } from 'vitest'
import {
  assertAttenuated,
  mintAgentPassport,
  passportTokenHash,
  revokeAgentPassport,
  verifyAgentPassport
} from './agent-passport'
import { generateIdentity } from './did'
import { computeTokenHash, RevocationStore } from './sharing/index'
import { createUCAN, hasCapability, rootIssuers, verifyUCAN } from './ucan'

const operator = generateIdentity()

const CAPS = [
  { with: 'xnet://space/inbox', can: 'node/create' },
  { with: 'xnet://space/inbox', can: 'node/update' }
]

describe('agent passport (exploration 0337)', () => {
  it('mints a fresh agent DID distinct from the operator', () => {
    const grant = mintAgentPassport({
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS
    })
    expect(grant.agentDID).toMatch(/^did:key:z/)
    expect(grant.agentDID).not.toBe(operator.identity.did)
    expect(grant.agentKey).toBeInstanceOf(Uint8Array)
  })

  it('the delegation verifies, is operator-issued, agent-addressed, and scoped', () => {
    const grant = mintAgentPassport({
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS
    })
    const result = verifyAgentPassport(grant.ucan, {
      agentDID: grant.agentDID,
      operatorDID: operator.identity.did
    })
    expect(result.valid).toBe(true)
    expect(result.payload?.iss).toBe(operator.identity.did)
    expect(result.payload?.aud).toBe(grant.agentDID)
    expect(hasCapability(result.payload!, 'xnet://space/inbox', 'node/create')).toBe(true)
    expect(hasCapability(result.payload!, 'xnet://space/other', 'node/create')).toBe(false)
    expect(hasCapability(result.payload!, 'xnet://space/inbox', 'node/delete')).toBe(false)
  })

  it('pins audience and issuer', () => {
    const grant = mintAgentPassport({
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS
    })
    const stranger = generateIdentity()
    expect(verifyAgentPassport(grant.ucan, { agentDID: stranger.identity.did }).valid).toBe(false)
    expect(verifyAgentPassport(grant.ucan, { operatorDID: stranger.identity.did }).valid).toBe(
      false
    )
  })

  it('rejects wildcard capabilities — the 0307 weakness must not re-enter', () => {
    expect(() => assertAttenuated([{ with: '*', can: 'node/create' }])).toThrow(/attenuated/)
    expect(() => assertAttenuated([{ with: 'xnet://space/inbox', can: '*' }])).toThrow(/attenuated/)
    expect(() => assertAttenuated([])).toThrow(/at least one/)
    expect(() =>
      mintAgentPassport({
        operatorDID: operator.identity.did,
        operatorKey: operator.privateKey,
        capabilities: [{ with: '*', can: '*' }]
      })
    ).toThrow(/attenuated/)
  })

  it('honors a custom TTL and reports expiresAt in epoch ms', () => {
    const before = Date.now()
    const grant = mintAgentPassport({
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS,
      ttlSeconds: 60
    })
    expect(grant.expiresAt).toBeGreaterThanOrEqual(before + 59_000)
    expect(grant.expiresAt).toBeLessThanOrEqual(Date.now() + 61_000)
  })
})

describe('rootIssuers', () => {
  it('a proof-less token is its own root (self-issued detection)', () => {
    const self = generateIdentity()
    const token = createUCAN({
      issuer: self.identity.did,
      issuerKey: self.privateKey,
      audience: operator.identity.did,
      capabilities: [{ with: '*', can: '*' }]
    })
    expect(rootIssuers(token)).toEqual([self.identity.did])
  })

  it('a delegated invocation roots at the operator, not the agent', () => {
    const grant = mintAgentPassport({
      operatorDID: operator.identity.did,
      operatorKey: operator.privateKey,
      capabilities: CAPS
    })
    // The agent invokes against the hub using the passport as proof.
    const invocation = createUCAN({
      issuer: grant.agentDID,
      issuerKey: grant.agentKey,
      audience: 'did:key:zHub',
      capabilities: [{ with: 'xnet://space/inbox', can: 'node/create' }],
      proofs: [grant.ucan]
    })
    expect(verifyUCAN(invocation).valid).toBe(true)
    expect(rootIssuers(invocation)).toEqual([operator.identity.did])
  })

  it('returns [] for garbage input', () => {
    expect(rootIssuers('not-a-token')).toEqual([])
  })
})

describe('passport revocation (exploration 0416)', () => {
  const grantFor = (op = operator) =>
    mintAgentPassport({
      operatorDID: op.identity.did,
      operatorKey: op.privateKey,
      capabilities: CAPS
    })

  it('verifies while unrevoked and fails loudly once revoked', () => {
    const grant = grantFor()
    const store = new RevocationStore()

    expect(verifyAgentPassport(grant.ucan, { revocations: store }).valid).toBe(true)

    store.revoke(revokeAgentPassport(operator.identity.did, operator.privateKey, grant.ucan))

    const result = verifyAgentPassport(grant.ucan, { revocations: store })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/revoked/i)
  })

  it('revokes only the named passport, not every passport from that operator', () => {
    const revoked = grantFor()
    const untouched = grantFor()
    const store = new RevocationStore()
    store.revoke(revokeAgentPassport(operator.identity.did, operator.privateKey, revoked.ucan))

    expect(verifyAgentPassport(revoked.ucan, { revocations: store }).valid).toBe(false)
    expect(verifyAgentPassport(untouched.ucan, { revocations: store }).valid).toBe(true)
  })

  it('only the issuing operator can revoke', () => {
    const grant = grantFor()
    const stranger = generateIdentity()
    expect(() =>
      revokeAgentPassport(stranger.identity.did, stranger.privateKey, grant.ucan)
    ).toThrow(/does not match token issuer/)
  })

  it('without a denylist, expiry remains the only revocation (0337 behaviour preserved)', () => {
    const grant = grantFor()
    // Revoked in a store the verifier is never given — must still verify.
    const store = new RevocationStore()
    store.revoke(revokeAgentPassport(operator.identity.did, operator.privateKey, grant.ucan))
    expect(verifyAgentPassport(grant.ucan).valid).toBe(true)
  })

  it('hashes a passport to the same key the share lane uses', () => {
    const grant = grantFor()
    expect(passportTokenHash(grant.ucan)).toBe(computeTokenHash(grant.ucan))
  })
})
