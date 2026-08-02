/**
 * The tenant roster (exploration 0436 G3/G4/G5).
 *
 * Two invariants carry the weight here and both have a loud failure mode:
 * a legacy record must not project an EMPTY trusted-root policy (that locks the
 * owner out of their own hub), and seat enforcement must refuse admission
 * without ever removing someone who is already on the roster.
 */

import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import type { TenantMember } from './registry'
import { addMember, removeMember, rosterFor, seatsUsedBy, trustedDidsEnv } from './roster'

const member = (did: string, role: TenantMember['role'] = 'member'): TenantMember => ({
  did,
  role,
  addedAtMs: 1,
  addedBy: 'u'
})

describe('rosterFor', () => {
  it('reads an explicit roster', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b')]
    }
    expect(rosterFor(record).map((m) => m.did)).toEqual(['did:key:a', 'did:key:b'])
  })

  // The lockout bug: `members` absent means "one owner", never "nobody".
  it('treats a record written before members existed as its owner', () => {
    expect(rosterFor({ did: 'did:key:a' })).toEqual([
      { did: 'did:key:a', role: 'owner', addedAtMs: 0, addedBy: '' }
    ])
  })

  it('is empty only when there is genuinely nobody bound yet', () => {
    expect(rosterFor({ did: '' })).toEqual([])
  })
})

describe('trustedDidsEnv', () => {
  it('joins the roster into the hub policy', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b')]
    }
    expect(trustedDidsEnv(record)).toBe('did:key:a,did:key:b')
  })

  // `checkTrustedRoots` treats absent and empty identically, so writing an empty
  // string produces a hub that is wide open while looking configured.
  it('returns undefined rather than an empty policy', () => {
    expect(trustedDidsEnv({ did: '' })).toBeUndefined()
    expect(trustedDidsEnv({ did: '', members: [] })).toBeUndefined()
  })

  it('never drops the owner of a legacy record', () => {
    expect(trustedDidsEnv({ did: 'did:key:a' })).toBe('did:key:a')
  })
})

describe('seats', () => {
  const team = resolveEntitlements('team') // 3 seats
  const community = resolveEntitlements('community') // flat, seats: 0

  it('counts owners and members, never guests', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b'), member('did:key:g', 'guest')]
    }
    expect(seatsUsedBy(record)).toBe(2)
  })

  it('refuses the invitation that would exceed the seat count', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b'), member('did:key:c')]
    }
    expect(seatsUsedBy(record)).toBe(3)
    const result = addMember(record, team, member('did:key:d'))
    expect(result).toEqual({ ok: false, reason: 'seats-exhausted', used: 3, seats: 3 })
    // …and the three who are already there are untouched. Enforcement is
    // admission-time only: evicting a member mid-sync reads as data loss.
    expect(rosterFor(record)).toHaveLength(3)
  })

  it('still admits a guest at a full seat count', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b'), member('did:key:c')]
    }
    const result = addMember(record, team, member('did:key:g', 'guest'))
    expect(result.ok).toBe(true)
  })

  // Charter §6: `community` is flat-billed, and its membership must stay
  // unlimited and uncounted. A seat cap here would be the per-member meter.
  it('never caps a flat-billed plan', () => {
    const many = Array.from({ length: 500 }, (_, i) => member(`did:key:${i}`))
    const record = { did: 'did:key:0', members: many }
    expect(addMember(record, community, member('did:key:next')).ok).toBe(true)
  })

  it('rejects a duplicate DID rather than seating them twice', () => {
    const record = { did: 'did:key:a', members: [member('did:key:a', 'owner')] }
    expect(addMember(record, team, member('did:key:a'))).toEqual({
      ok: false,
      reason: 'already-member'
    })
  })
})

describe('removeMember', () => {
  it('removes a member and narrows the policy', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b')]
    }
    const result = removeMember(record, 'did:key:b')
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(trustedDidsEnv({ did: 'did:key:a', members: result.members })).toBe('did:key:a')
  })

  // A tenant with no owner has nobody who can invite and — with the policy in
  // force — nobody who can connect. One click must not reach that state.
  it('refuses to remove the last owner', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b')]
    }
    expect(removeMember(record, 'did:key:a')).toEqual({ ok: false, reason: 'last-owner' })
  })

  it('allows removing an owner when another remains', () => {
    const record = {
      did: 'did:key:a',
      members: [member('did:key:a', 'owner'), member('did:key:b', 'owner')]
    }
    expect(removeMember(record, 'did:key:a').ok).toBe(true)
  })

  it('reports an unknown DID rather than silently succeeding', () => {
    const record = { did: 'did:key:a', members: [member('did:key:a', 'owner')] }
    expect(removeMember(record, 'did:key:zzz')).toEqual({ ok: false, reason: 'not-a-member' })
  })
})
