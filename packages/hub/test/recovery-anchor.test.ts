/**
 * Recovery-anchor escrow: ATProto anchor verification + escrow enroll/release
 * (explorations 0243/0322/0338).
 */
import { createAtprotoBinding, generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { AtprotoBindingVerifier } from '../src/services/atproto-binding'
import { AtprotoRecoveryAnchor } from '../src/services/atproto-recovery-anchor'
import { RecoveryChallengeStore } from '../src/services/atproto-challenge'
import { EscrowStore } from '../src/services/escrow-store'

const PLC = 'did:plc:ewvi7nxzyoun6zhxrhs64oiz'
const PDS = 'https://pds.example.com'

/**
 * A fake atmosphere. `challengeRecord` is what sits in the repo under
 * `fyi.xnet.identity.challenge` — omit it to model a repo with no proof written
 * (the attacker case), or pass one to model the honest recovering user.
 */
const makeFetch = (opts: {
  record: unknown
  challengeRecord?: unknown
  withAs?: boolean
}): typeof fetch =>
  (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.includes('plc.directory')) {
      return new Response(
        JSON.stringify({
          id: PLC,
          alsoKnownAs: ['at://alice.example.com'],
          service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: PDS }]
        }),
        { status: 200 }
      )
    }
    if (url.includes('com.atproto.repo.getRecord')) {
      if (url.includes('fyi.xnet.identity.challenge')) {
        if (!opts.challengeRecord) return new Response('nf', { status: 404 })
        return new Response(
          JSON.stringify({
            uri: `at://${PLC}/fyi.xnet.identity.challenge/self`,
            value: opts.challengeRecord
          }),
          { status: 200 }
        )
      }
      return new Response(
        JSON.stringify({ uri: `at://${PLC}/fyi.xnet.identity.binding/self`, value: opts.record }),
        { status: 200 }
      )
    }
    if (url.includes('oauth-protected-resource')) {
      return new Response(
        JSON.stringify(
          opts.withAs === false ? {} : { authorization_servers: ['https://as.example.com'] }
        ),
        { status: 200 }
      )
    }
    return new Response('nf', { status: 404 })
  }) as typeof fetch

/** Issue a nonce and return both it and the record a user would write. */
const freshChallenge = (challenges: RecoveryChallengeStore, xnetDid: string) => {
  const challenge = challenges.issue(xnetDid)
  return {
    nonce: challenge.nonce,
    record: { nonce: challenge.nonce, xnetDid, createdAt: new Date().toISOString() }
  }
}

describe('AtprotoRecoveryAnchor.verifyCeremony', () => {
  it('verifies a genuine bound ATProto identity that proved live control', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    const challenges = new RecoveryChallengeStore()
    const { nonce, record: challengeRecord } = freshChallenge(challenges, identity.did)
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: makeFetch({ record, challengeRecord })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)

    const result = await anchor.verifyCeremony({
      code: nonce,
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(true)
    expect(result.subject).toBe(PLC)
  })

  it('rejects a binding bound to a different xNet DID', async () => {
    const alice = generateIdentity()
    const mallory = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: alice.identity.did,
      signingKey: alice.privateKey,
      atprotoDid: PLC
    })
    const challenges = new RecoveryChallengeStore()
    const { nonce, record: challengeRecord } = freshChallenge(challenges, mallory.identity.did)
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record, challengeRecord }) }),
      challenges
    )
    const result = await anchor.verifyCeremony({
      code: nonce,
      expectedSubject: PLC,
      boundXnetDid: mallory.identity.did
    })
    expect(result.verified).toBe(false)
  })

  it('rejects when the canonical PDS advertises no authorization server', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    const challenges = new RecoveryChallengeStore()
    const { nonce, record: challengeRecord } = freshChallenge(challenges, identity.did)
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record, challengeRecord, withAs: false }) }),
      challenges
    )
    const result = await anchor.verifyCeremony({
      code: nonce,
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/authorization server/)
  })

  it('rejects a binding outside the freshness window', async () => {
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC,
      now: new Date(1000)
    })
    // Anchor clock is pinned far in the future so the year-old binding is
    // stale. The challenge store shares that clock (a nonce it issues is
    // "now"), and the challenge record is stamped at the same instant, so the
    // proof-of-control stage passes and the binding-freshness stage is the one
    // that rejects.
    const nowMs = 10_000_000
    const challenges = new RecoveryChallengeStore({ now: () => nowMs })
    const challenge = challenges.issue(identity.did)
    const challengeRecord = {
      nonce: challenge.nonce,
      xnetDid: identity.did,
      createdAt: new Date(nowMs).toISOString()
    }
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record, challengeRecord }) }),
      challenges,
      { maxBindingAgeMs: 1000, now: () => nowMs }
    )
    const result = await anchor.verifyCeremony({
      code: challenge.nonce,
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/freshness/)
  })

  it('rejects the pre-0389 attack: valid binding, no proof of live control', async () => {
    // The exact hole: everything the old gate checked is public, and the
    // attacker supplies an arbitrary code. With no challenge record in the repo
    // and no issued nonce, release must fail.
    const { identity, privateKey } = generateIdentity()
    const record = createAtprotoBinding({
      xnetDid: identity.did,
      signingKey: privateKey,
      atprotoDid: PLC
    })
    const anchor = new AtprotoRecoveryAnchor(
      new AtprotoBindingVerifier({ fetchImpl: makeFetch({ record }) }),
      new RecoveryChallengeStore()
    )
    const result = await anchor.verifyCeremony({
      code: 'attacker-supplied',
      expectedSubject: PLC,
      boundXnetDid: identity.did
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/challenge/i)
  })
})

describe('EscrowStore', () => {
  it('enrolls, reads, and removes', () => {
    const store = new EscrowStore()
    store.enroll({
      xnetDid: 'did:key:alice',
      anchorKind: 'atproto',
      anchorSubject: PLC,
      sealedEscrowB64: 'c2VhbGVk',
      enrolledAt: 1
    })
    expect(store.get('did:key:alice')?.sealedEscrowB64).toBe('c2VhbGVk')
    expect(store.get('did:key:bob')).toBeNull()
    store.remove('did:key:alice')
    expect(store.get('did:key:alice')).toBeNull()
  })
})
