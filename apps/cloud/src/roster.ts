/**
 * xNet Cloud — the tenant roster (exploration 0436, Phase T).
 *
 * Who is inside a tenant. This is the layer that was missing: the hub knows how
 * to express "this DID may read that space" — grants, spaces, roles, the CRUD
 * split — but nothing decided **which DIDs are the tenant** in the first place,
 * so a paid hub accepted a self-issued UCAN from a key generated thirty seconds
 * ago (G3), and `seats` was a number we printed (G5).
 *
 * The roster answers both. It projects into `HUB_TRUSTED_DIDS`, which the hub's
 * `checkTrustedRoots` already understands, and its length is what seat billing
 * counts.
 */

import type { TenantMember, TenantRecord } from './registry'
import { canAdmitMember, seatsUsed, type PlanEntitlements } from '@xnetjs/entitlements'

/**
 * The effective roster for a tenant.
 *
 * The single place the legacy fallback is decided. A record written before
 * `members` existed has `undefined`, which means "one owner, the bound DID" —
 * **not** "nobody". Getting this wrong writes an empty trusted-root policy and
 * locks a paying customer out of their own hub, which is why every caller goes
 * through here rather than reading `record.members`.
 */
export function rosterFor(record: Pick<TenantRecord, 'members' | 'did'>): TenantMember[] {
  if (record.members?.length) return record.members
  if (!record.did) return []
  return [{ did: record.did, role: 'owner', addedAtMs: 0, addedBy: '' }]
}

/**
 * The value of `HUB_TRUSTED_DIDS`, or undefined when there is nothing to say.
 *
 * Undefined, never an empty string. `checkTrustedRoots` treats an absent or
 * empty policy as "no policy", so writing an empty value would produce a hub
 * that is wide open while looking configured — the two states must not be
 * indistinguishable.
 */
export function trustedDidsEnv(record: Pick<TenantRecord, 'members' | 'did'>): string | undefined {
  const dids = rosterFor(record)
    .map((m) => m.did)
    .filter(Boolean)
  return dids.length > 0 ? dids.join(',') : undefined
}

/** Seats consumed by this tenant's roster (owners + members; guests are free). */
export function seatsUsedBy(record: Pick<TenantRecord, 'members' | 'did'>): number {
  return seatsUsed(rosterFor(record))
}

/** Why an invitation was refused. */
export type InviteRefusal =
  | { reason: 'already-member' }
  | { reason: 'seats-exhausted'; used: number; seats: number }

export type InviteResult = { ok: true; members: TenantMember[] } | ({ ok: false } & InviteRefusal)

/**
 * Add a member to a tenant's roster.
 *
 * Refuses rather than evicting or silently upgrading:
 *
 *  - a DID already on the roster is `already-member`, not a duplicate row;
 *  - a seat-metered tenant at capacity is `seats-exhausted`, and the existing
 *    members keep working. Enforcement is admission-time only — dropping a
 *    connected member because a seat count moved is a data-loss-shaped event in
 *    a local-first product even when it technically is not.
 */
export function addMember(
  record: Pick<TenantRecord, 'members' | 'did'>,
  entitlements: PlanEntitlements,
  member: TenantMember
): InviteResult {
  const current = rosterFor(record)
  if (current.some((m) => m.did === member.did)) return { ok: false, reason: 'already-member' }
  if (!canAdmitMember(entitlements, current, member.role)) {
    return {
      ok: false,
      reason: 'seats-exhausted',
      used: seatsUsed(current),
      seats: entitlements.seats
    }
  }
  return { ok: true, members: [...current, member] }
}

export type RemoveResult =
  | { ok: true; members: TenantMember[] }
  | { ok: false; reason: 'not-a-member' | 'last-owner' }

/**
 * Remove a member.
 *
 * Refuses to remove the last owner: a tenant with no owner has nobody who can
 * invite, and with the trusted-root policy in force it would also have nobody
 * who can connect. That is an unrecoverable state reachable by one click.
 */
export function removeMember(
  record: Pick<TenantRecord, 'members' | 'did'>,
  did: string
): RemoveResult {
  const current = rosterFor(record)
  const target = current.find((m) => m.did === did)
  if (!target) return { ok: false, reason: 'not-a-member' }
  const remaining = current.filter((m) => m.did !== did)
  if (target.role === 'owner' && !remaining.some((m) => m.role === 'owner')) {
    return { ok: false, reason: 'last-owner' }
  }
  return { ok: true, members: remaining }
}
