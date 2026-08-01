import { describe, expect, it, vi } from 'vitest'
import { generateIdentity } from './did'
import { enrollForeignAgent, type ForeignAgentClaim } from './foreign-agent'
import { hasCapability, verifyUCAN } from './ucan'

const operator = generateIdentity()

const CAPS = [{ with: 'xnet://space/inbox', can: 'node/create' }]

const claim = (over: Partial<ForeignAgentClaim> = {}): ForeignAgentClaim => ({
  origin: 'buzz',
  foreignKey: 'npub1exampleagentkey',
  proof: new Uint8Array([1, 2, 3]),
  challenge: new Uint8Array([4, 5, 6]),
  ...over
})

const enroll = (over: Partial<Parameters<typeof enrollForeignAgent>[0]> = {}) =>
  enrollForeignAgent({
    operatorDID: operator.identity.did,
    operatorKey: operator.privateKey,
    capabilities: CAPS,
    claim: claim(),
    verifyProof: () => true,
    ...over
  })

describe('foreign agent enrollment (exploration 0416)', () => {
  it('mints an xNet passport bound to the verified foreign key', () => {
    const enrollment = enroll()

    expect(enrollment.agentDID).toMatch(/^did:key:z/)
    expect(enrollment.agentDID).not.toBe(operator.identity.did)
    expect(enrollment.origin).toBe('buzz')
    expect(enrollment.foreignKey).toBe('npub1exampleagentkey')

    // The passport is a normal, operator-issued, agent-addressed delegation.
    const result = verifyUCAN(enrollment.ucan)
    expect(result.valid).toBe(true)
    expect(result.payload?.iss).toBe(operator.identity.did)
    expect(result.payload?.aud).toBe(enrollment.agentDID)
  })

  it('grants only what the operator asked for — never what the ecosystem claims', () => {
    const enrollment = enroll()
    const payload = verifyUCAN(enrollment.ucan).payload!

    expect(hasCapability(payload, 'xnet://space/inbox', 'node/create')).toBe(true)
    expect(hasCapability(payload, 'xnet://space/inbox', 'node/delete')).toBe(false)
    expect(hasCapability(payload, 'xnet://space/other', 'node/create')).toBe(false)
  })

  it('throws on an unverified proof rather than issuing a degraded grant', () => {
    expect(() => enroll({ verifyProof: () => false })).toThrow(/Unverified buzz agent key/)
  })

  it('passes the whole claim to the verifier', () => {
    const verifyProof = vi.fn(() => true)
    const c = claim({ origin: 'a2a', foreignKey: 'did:web:agent.example' })
    enroll({ claim: c, verifyProof })
    expect(verifyProof).toHaveBeenCalledWith(c)
  })

  it('rejects empty challenges and proofs — a replayable nothing proves nothing', () => {
    expect(() => enroll({ claim: claim({ challenge: new Uint8Array() }) })).toThrow(/challenge/)
    expect(() => enroll({ claim: claim({ proof: new Uint8Array() }) })).toThrow(/proof/)
  })

  it('still refuses wildcard capabilities at the foreign boundary', () => {
    expect(() => enroll({ capabilities: [{ with: '*', can: 'node/create' }] })).toThrow(
      /attenuated/
    )
    expect(() => enroll({ capabilities: [] })).toThrow(/at least one/)
  })
})
