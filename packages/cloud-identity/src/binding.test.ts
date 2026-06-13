import { describe, expect, it } from 'vitest'
import {
  MemoryBindingStore,
  bindIdentities,
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
