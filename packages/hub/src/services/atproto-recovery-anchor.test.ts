/**
 * Regression guard for the escrow-release hole found in 0389.
 *
 * `/recovery-anchor/release` verified only public facts — a public binding
 * record, a public AS document, a public timestamp — and threw away the one
 * field (`code`) that could have proved the caller was actually the account
 * holder. Knowing a victim's xNet DID was enough to collect their sealed
 * escrow blob and brute-force the PIN offline.
 *
 * The first test here is the attack. It must stay red against any
 * implementation that goes back to authorising on standing state.
 */
import { describe, it, expect, vi } from 'vitest'
import { AtprotoBindingVerifier } from './atproto-binding'
import { AtprotoRecoveryAnchor } from './atproto-recovery-anchor'
import {
  RecoveryChallengeStore,
  ATPROTO_CHALLENGE_COLLECTION,
  ATPROTO_CHALLENGE_RKEY
} from './atproto-challenge'
import { createAtprotoBinding } from '@xnetjs/identity'
import { generateIdentity } from '@xnetjs/identity'

const ATPROTO_DID = 'did:plc:abcdefghijklmnopqrstuvwx'
const PDS = 'https://pds.example'

/**
 * A fake atmosphere: DID doc, AS document, binding record, and whatever
 * challenge record the test wants sitting in the repo.
 */
function atmosphere(options: {
  xnetDid: string
  bindingRecord: unknown
  challengeRecord?: unknown
  bindingCreatedAt?: string
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('plc.directory')) {
      return new Response(
        JSON.stringify({
          id: ATPROTO_DID,
          alsoKnownAs: ['at://alice.example'],
          service: [
            { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: PDS }
          ]
        }),
        { status: 200 }
      )
    }
    if (url.includes('oauth-protected-resource')) {
      return new Response(JSON.stringify({ authorization_servers: [PDS] }), { status: 200 })
    }
    if (url.includes(ATPROTO_CHALLENGE_COLLECTION)) {
      if (!options.challengeRecord) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify({ value: options.challengeRecord }), { status: 200 })
    }
    if (url.includes('identity.binding')) {
      return new Response(JSON.stringify({ value: options.bindingRecord }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as unknown as typeof fetch
}

function boundIdentity() {
  const { identity, privateKey } = generateIdentity()
  const binding = createAtprotoBinding({
    xnetDid: identity.did,
    signingKey: privateKey,
    atprotoDid: ATPROTO_DID
  })
  return { xnetDid: identity.did, binding }
}

describe('escrow release requires proof of live account control', () => {
  it('THE ATTACK: public data alone must not release the blob', async () => {
    const { xnetDid, binding } = await boundIdentity()
    // The attacker knows only the victim's xNet DID. Every fact the old gate
    // checked is available to them, because all of it is public.
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({ xnetDid, bindingRecord: binding })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, new RecoveryChallengeStore())

    const result = await anchor.verifyCeremony({
      code: 'anything-the-attacker-likes',
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    })

    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/challenge/i)
  })

  it('releases when a hub-issued nonce is echoed by a record in the bound repo', async () => {
    const { xnetDid, binding } = await boundIdentity()
    const challenges = new RecoveryChallengeStore()
    const challenge = challenges.issue(xnetDid)
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({
        xnetDid,
        bindingRecord: binding,
        challengeRecord: {
          nonce: challenge.nonce,
          xnetDid,
          createdAt: new Date().toISOString()
        }
      })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)

    const result = await anchor.verifyCeremony({
      code: challenge.nonce,
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    })
    expect(result).toEqual({ verified: true, subject: ATPROTO_DID })
  })

  it('rejects a nonce the hub issued when no record backs it', async () => {
    // Proves the nonce alone is not the proof: an attacker can always ASK for a
    // challenge, so only writing it into the repo demonstrates control.
    const { xnetDid, binding } = await boundIdentity()
    const challenges = new RecoveryChallengeStore()
    const challenge = challenges.issue(xnetDid)
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({ xnetDid, bindingRecord: binding })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)

    const result = await anchor.verifyCeremony({
      code: challenge.nonce,
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    })
    expect(result.verified).toBe(false)
  })

  it('rejects a challenge record carrying a different nonce', async () => {
    const { xnetDid, binding } = await boundIdentity()
    const challenges = new RecoveryChallengeStore()
    const challenge = challenges.issue(xnetDid)
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({
        xnetDid,
        bindingRecord: binding,
        challengeRecord: { nonce: 'stale-nonce', xnetDid, createdAt: new Date().toISOString() }
      })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)

    const result = await anchor.verifyCeremony({
      code: challenge.nonce,
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/nonce/i)
  })

  it('rejects a stale challenge record even with a live nonce', async () => {
    const { xnetDid, binding } = await boundIdentity()
    const challenges = new RecoveryChallengeStore()
    const challenge = challenges.issue(xnetDid)
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({
        xnetDid,
        bindingRecord: binding,
        challengeRecord: {
          nonce: challenge.nonce,
          xnetDid,
          createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString()
        }
      })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)

    const result = await anchor.verifyCeremony({
      code: challenge.nonce,
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    })
    expect(result.verified).toBe(false)
    expect(result.reason).toMatch(/stale/i)
  })

  it('rejects a challenge record bound to a different xNet DID', async () => {
    const { xnetDid, binding } = await boundIdentity()
    const challenges = new RecoveryChallengeStore()
    const challenge = challenges.issue(xnetDid)
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({
        xnetDid,
        bindingRecord: binding,
        challengeRecord: {
          nonce: challenge.nonce,
          xnetDid: 'did:key:someone-else',
          createdAt: new Date().toISOString()
        }
      })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)

    const result = await anchor.verifyCeremony({
      code: challenge.nonce,
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    })
    expect(result.verified).toBe(false)
  })

  it('a nonce is single-use, so a captured request cannot be replayed', async () => {
    const { xnetDid, binding } = await boundIdentity()
    const challenges = new RecoveryChallengeStore()
    const challenge = challenges.issue(xnetDid)
    const record = {
      nonce: challenge.nonce,
      xnetDid,
      createdAt: new Date().toISOString()
    }
    const verifier = new AtprotoBindingVerifier({
      fetchImpl: atmosphere({ xnetDid, bindingRecord: binding, challengeRecord: record })
    })
    const anchor = new AtprotoRecoveryAnchor(verifier, challenges)
    const args = {
      code: challenge.nonce,
      expectedSubject: ATPROTO_DID,
      boundXnetDid: xnetDid
    }

    expect((await anchor.verifyCeremony(args)).verified).toBe(true)
    // Same bytes on the wire a second time — the record is still sitting in the
    // repo, so only the store's single-use rule stops this.
    expect((await anchor.verifyCeremony(args)).verified).toBe(false)
  })
})

describe('RecoveryChallengeStore', () => {
  it('burns a challenge on a wrong guess, so guessing cannot be repeated', () => {
    const store = new RecoveryChallengeStore()
    const challenge = store.issue('did:key:alice')
    expect(store.consume('did:key:alice', 'wrong')).toBeNull()
    expect(store.consume('did:key:alice', challenge.nonce)).toBeNull()
  })

  it('expires', () => {
    let now = 1_000
    const store = new RecoveryChallengeStore({ ttlMs: 100, now: () => now })
    const challenge = store.issue('did:key:alice')
    now = 2_000
    expect(store.consume('did:key:alice', challenge.nonce)).toBeNull()
  })

  it('issuing again replaces, so nonces cannot be farmed', () => {
    const store = new RecoveryChallengeStore()
    const first = store.issue('did:key:alice')
    store.issue('did:key:alice')
    expect(store.size).toBe(1)
    expect(store.consume('did:key:alice', first.nonce)).toBeNull()
  })

  it('mints unpredictable nonces', () => {
    const store = new RecoveryChallengeStore()
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) => store.issue(`did:key:u${i}`).nonce)
    )
    expect(seen.size).toBe(50)
    for (const nonce of seen) expect(nonce.length).toBeGreaterThanOrEqual(32)
  })
})
