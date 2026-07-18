/**
 * Tests for time-boxed support access (exploration 0341 P4): grant creates a
 * viewer membership edge with expiry on the Diagnostics Space, expiry reads as
 * inactive immediately, the sweep enforces it by deleting the edge, and
 * revoke removes it on the spot.
 */

import { MemoryNodeStorageAdapter, NodeStore, spaceMembershipId } from '@xnetjs/data'
import { generateIdentity } from '@xnetjs/identity'
import { describe, expect, it } from 'vitest'
import { DIAGNOSTICS_SPACE_ID } from './diagnostics-console'
import {
  getSupportAccess,
  grantSupportAccess,
  revokeSupportAccess,
  sweepExpiredSupportAccess
} from './support-access'

const SUPPORT = 'did:key:zxnetsupport'
const OPERATOR = 'did:key:zoperator'
const DAY = 24 * 60 * 60 * 1000

const makeStore = () => {
  const identity = generateIdentity()
  return new NodeStore({
    storage: new MemoryNodeStorageAdapter(),
    authorDID: identity.identity.did as `did:key:${string}`,
    signingKey: identity.privateKey
  })
}

describe('support access lifecycle', () => {
  it('grants a time-boxed viewer membership on the Diagnostics Space', async () => {
    const store = makeStore()
    const state = await grantSupportAccess(store, OPERATOR, SUPPORT, DAY, 1_000)
    expect(state).toEqual({ active: true, expiresAt: 1_000 + DAY })

    const edge = await store.get(spaceMembershipId(DIAGNOSTICS_SPACE_ID, SUPPORT))
    expect(edge?.properties).toMatchObject({
      space: DIAGNOSTICS_SPACE_ID,
      member: SUPPORT,
      role: 'viewer',
      addedBy: OPERATOR,
      expiresAt: 1_000 + DAY
    })
  })

  it('reads as inactive the moment the grant expires, and the sweep deletes the edge', async () => {
    const store = makeStore()
    await grantSupportAccess(store, OPERATOR, SUPPORT, DAY, 1_000)

    expect((await getSupportAccess(store, SUPPORT, 1_000 + DAY - 1)).active).toBe(true)
    // Expired: inactive immediately, even before any sweep runs.
    expect((await getSupportAccess(store, SUPPORT, 1_000 + DAY + 1)).active).toBe(false)

    expect(await sweepExpiredSupportAccess(store, SUPPORT, 1_000 + DAY + 1)).toBe(true)
    // Deletion is a soft tombstone in the LWW store; the edge reads as gone.
    expect((await store.get(spaceMembershipId(DIAGNOSTICS_SPACE_ID, SUPPORT)))?.deleted).toBe(true)
    // Idempotent: nothing left to sweep.
    expect(await sweepExpiredSupportAccess(store, SUPPORT, 1_000 + DAY + 1)).toBe(false)
  })

  it('does not sweep a live grant; revoke removes it immediately', async () => {
    const store = makeStore()
    await grantSupportAccess(store, OPERATOR, SUPPORT, DAY, 1_000)
    expect(await sweepExpiredSupportAccess(store, SUPPORT, 2_000)).toBe(false)

    await revokeSupportAccess(store, SUPPORT)
    expect((await store.get(spaceMembershipId(DIAGNOSTICS_SPACE_ID, SUPPORT)))?.deleted).toBe(true)
    expect((await getSupportAccess(store, SUPPORT, 2_000)).active).toBe(false)
    // Revoking again is a no-op, not an error.
    await revokeSupportAccess(store, SUPPORT)
  })

  it('re-granting extends via LWW upsert on the same deterministic edge', async () => {
    const store = makeStore()
    await grantSupportAccess(store, OPERATOR, SUPPORT, DAY, 1_000)
    await grantSupportAccess(store, OPERATOR, SUPPORT, 7 * DAY, 2_000)
    const state = await getSupportAccess(store, SUPPORT, 2_000)
    expect(state.expiresAt).toBe(2_000 + 7 * DAY)
  })
})
