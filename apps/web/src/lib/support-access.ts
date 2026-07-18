/**
 * Time-boxed vendor support access to the Diagnostics Space (0341 P4) — the
 * THIRD escalation switch. "Let xNet help debug" is ordinary space
 * membership under `spaceCascadeAuthorization`: granting adds a viewer
 * membership edge for the published support identity with an `expiresAt`,
 * revoking (or expiry) removes the edge. No new access machinery — the same
 * sync/authz path every other member uses, which is exactly why it is
 * trustworthy and auditable.
 *
 * Expiry is enforced by the sweep: clients treat an expired membership as
 * revoked and delete the edge on sight (`sweepExpiredSupportAccess` runs
 * whenever the Diagnostics settings section renders). Until the sweep runs on
 * a writing device, an expired edge may briefly persist — the UI therefore
 * reports `expired` as inactive immediately, regardless of the node's fate.
 */

import type { NodeStore } from '@xnetjs/data'
import { SpaceMembershipSchema, spaceMembershipId } from '@xnetjs/data'
import { DIAGNOSTICS_SPACE_ID } from './diagnostics-console'

/**
 * The published xNet support identity this build escalates to. Build-time and
 * vendor-published; unset (self-host builds without it) disables the grant UI.
 */
export function supportIdentityDid(): string | null {
  const did = import.meta.env.VITE_XNET_SUPPORT_DID as string | undefined
  return did && did.startsWith('did:') ? did : null
}

export interface SupportAccessState {
  active: boolean
  expiresAt: number | null
}

const membershipNodeId = (supportDid: string): string =>
  spaceMembershipId(DIAGNOSTICS_SPACE_ID, supportDid)

/** The live membership edge, treating a soft-deleted node as absent. */
async function liveMembership(store: NodeStore, supportDid: string) {
  const node = await store.get(membershipNodeId(supportDid))
  return node && !node.deleted ? node : null
}

/** Current grant state; `active` is false the instant the grant expires. */
export async function getSupportAccess(
  store: NodeStore,
  supportDid: string,
  nowMs: number = Date.now()
): Promise<SupportAccessState> {
  const node = await liveMembership(store, supportDid)
  if (!node) return { active: false, expiresAt: null }
  const expiresAt = typeof node.properties.expiresAt === 'number' ? node.properties.expiresAt : null
  return { active: expiresAt === null || expiresAt > nowMs, expiresAt }
}

/**
 * Grant (or extend) the support identity's viewer membership on the
 * Diagnostics Space for `durationMs`. Deterministic edge id → re-granting
 * upserts rather than duplicating.
 */
export async function grantSupportAccess(
  store: NodeStore,
  granterDid: string,
  supportDid: string,
  durationMs: number,
  nowMs: number = Date.now()
): Promise<SupportAccessState> {
  const expiresAt = nowMs + durationMs
  await store.create({
    id: membershipNodeId(supportDid),
    schemaId: SpaceMembershipSchema.schema['@id'],
    properties: {
      space: DIAGNOSTICS_SPACE_ID,
      member: supportDid,
      role: 'viewer',
      addedBy: granterDid,
      addedAt: nowMs,
      expiresAt
    }
  })
  return { active: true, expiresAt }
}

/** One-click revoke: delete the membership edge (delete the node, never mutate a flag — 0190). */
export async function revokeSupportAccess(store: NodeStore, supportDid: string): Promise<void> {
  if ((await liveMembership(store, supportDid)) !== null) {
    await store.delete(membershipNodeId(supportDid))
  }
}

/**
 * Enforce expiry: delete the edge once its `expiresAt` has passed. Returns
 * true when a sweep removed the grant.
 */
export async function sweepExpiredSupportAccess(
  store: NodeStore,
  supportDid: string,
  nowMs: number = Date.now()
): Promise<boolean> {
  const state = await getSupportAccess(store, supportDid, nowMs)
  const node = await liveMembership(store, supportDid)
  if (node && !state.active) {
    await store.delete(membershipNodeId(supportDid))
    return true
  }
  return false
}
