/**
 * Deterministic DM channel identity (exploration 0167).
 *
 * The DM channel node ID is derived from the sorted participant DIDs, so
 * every participant materializes the *same* node without coordination and
 * duplicate-channel races cannot happen. Create is an upsert at the change
 * level: two sides creating the same node ID converge via LWW.
 */

import { hashHex } from '@xnetjs/crypto'

export const DM_ID_PREFIX = 'dm-'

/** Derive the canonical channel node ID for a DM between these DIDs. */
export function dmChannelId(dids: string[]): string {
  const sorted = [...new Set(dids)].sort()
  if (sorted.length < 2) {
    throw new Error('A DM needs at least two distinct participants')
  }
  const digest = hashHex(new TextEncoder().encode(sorted.join('\n')), 'sha256')
  return `${DM_ID_PREFIX}${digest.slice(0, 40)}`
}

export function isDmChannelId(id: string): boolean {
  return id.startsWith(DM_ID_PREFIX)
}

/** Sorted, deduped member list as stored on the DM channel node. */
export function dmMembers(dids: string[]): string[] {
  return [...new Set(dids)].sort()
}
