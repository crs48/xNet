import { describe, expect, it } from 'vitest'
import {
  MemoryBindingStore,
  accountSubjectForDid,
  bindIdentities,
  bindingAccount,
  completeRebind,
  recoverPaidAccount,
  type DidChallenge
} from './binding'

const challenge = (did: string): DidChallenge => ({ did, nonce: 'n', signature: 'sig' })
const accept = async () => true
const reject = async () => false

describe('bindIdentities (dual proof)', () => {
  it('binds when the DID challenge verifies', async () => {
    const store = new MemoryBindingStore()
    const b = await bindIdentities(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice'),
      nowMs: 1000
    })
    expect(b).toMatchObject({
      tenantId: 't1',
      billingUserId: 'user_a',
      did: 'did:key:alice',
      rebindPending: false,
      createdAt: 1000,
      verifiedAt: 1000
    })
    expect(await store.findByBillingUser('user_a')).toMatchObject({ tenantId: 't1' })
  })

  it('refuses to bind when the DID challenge fails', async () => {
    const store = new MemoryBindingStore()
    await expect(
      bindIdentities(store, reject, {
        tenantId: 't1',
        billingUserId: 'user_a',
        challenge: challenge('did:key:alice')
      })
    ).rejects.toThrow(/DID challenge failed/)
    expect(await store.get('t1')).toBeNull()
  })

  it('refuses to rebind a tenant to a different billing account', async () => {
    const store = new MemoryBindingStore()
    await bindIdentities(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:alice')
    })
    await expect(
      bindIdentities(store, accept, {
        tenantId: 't1',
        billingUserId: 'user_b',
        challenge: challenge('did:key:mallory')
      })
    ).rejects.toThrow(/different billing account/)
  })
})

describe('recoverPaidAccount + completeRebind', () => {
  it('recovers the paid account off the billing identity, then rebinds a fresh DID', async () => {
    const store = new MemoryBindingStore()
    await bindIdentities(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:old'),
      nowMs: 1000
    })

    // User lost their passkey: recover via billing identity alone.
    const recovered = await recoverPaidAccount(store, { billingUserId: 'user_a', nowMs: 2000 })
    expect(recovered.rebindPending).toBe(true)
    expect(recovered.did).toBe('') // old data identity is gone; account/hub survive
    expect(recovered.tenantId).toBe('t1')

    // Enroll a new data identity (dual proof again).
    const rebound = await completeRebind(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:new'),
      nowMs: 3000
    })
    expect(rebound).toMatchObject({ did: 'did:key:new', rebindPending: false, verifiedAt: 3000 })
    expect(rebound.createdAt).toBe(1000) // account continuity preserved
  })

  it('rejects recovery for an unknown billing account', async () => {
    const store = new MemoryBindingStore()
    await expect(recoverPaidAccount(store, { billingUserId: 'nobody' })).rejects.toThrow(
      /No tenant bound/
    )
  })

  it('pins a stable account root that survives recovery + rebind (0243 Phase 2)', async () => {
    const store = new MemoryBindingStore()
    const bound = await bindIdentities(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:old')
    })
    const account = accountSubjectForDid('did:key:old')
    expect(bound.account).toBe(account)

    await recoverPaidAccount(store, { billingUserId: 'user_a' })
    const cleared = await store.get('t1')
    // The DID is gone but the account root is pinned for the rebind.
    expect(cleared?.did).toBe('')
    expect(cleared?.account).toBe(account)

    const rebound = await completeRebind(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:new')
    })
    // The device DID changed; the account root did NOT.
    expect(rebound.did).toBe('did:key:new')
    expect(rebound.account).toBe(account)
    expect(rebound.account).not.toBe(accountSubjectForDid('did:key:new'))
  })

  it('bindingAccount derives the account for legacy bindings without the field', () => {
    expect(accountSubjectForDid('did:key:z6Mkabc')).toBe('xnet:account:z6Mkabc')
    // A binding written before the `account` field existed still resolves.
    expect(bindingAccount({ account: undefined, did: 'did:key:z6Mkabc' })).toBe(
      'xnet:account:z6Mkabc'
    )
    expect(bindingAccount({ account: 'xnet:account:custom', did: 'did:key:other' })).toBe(
      'xnet:account:custom'
    )
  })

  it('completeRebind requires a pending rebind, the right owner, and a valid challenge', async () => {
    const store = new MemoryBindingStore()
    await bindIdentities(store, accept, {
      tenantId: 't1',
      billingUserId: 'user_a',
      challenge: challenge('did:key:old')
    })
    // Not pending yet.
    await expect(
      completeRebind(store, accept, {
        tenantId: 't1',
        billingUserId: 'user_a',
        challenge: challenge('did:key:new')
      })
    ).rejects.toThrow(/not awaiting a rebind/)

    await recoverPaidAccount(store, { billingUserId: 'user_a' })

    // Wrong owner.
    await expect(
      completeRebind(store, accept, {
        tenantId: 't1',
        billingUserId: 'user_b',
        challenge: challenge('did:key:new')
      })
    ).rejects.toThrow(/does not own this tenant/)

    // Bad challenge.
    await expect(
      completeRebind(store, reject, {
        tenantId: 't1',
        billingUserId: 'user_a',
        challenge: challenge('did:key:new')
      })
    ).rejects.toThrow(/DID challenge failed/)
  })
})
