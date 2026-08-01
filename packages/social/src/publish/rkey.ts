/**
 * @xnetjs/social — record keys and the map that makes republish idempotent
 * (0420 WP1).
 *
 * This is the most bug-prone piece of the publish path, so it is the piece
 * with the most explanation.
 *
 * `community.lexicon.bookmarks.bookmark` declares `"key": "tid"`. A TID is
 * timestamp-ordered and assigned by the PDS at write time, so it CANNOT encode
 * the node it came from. The deterministic-id upsert that makes every other
 * import in this repo idempotent is therefore unavailable for the adopted
 * record, and idempotence has to come from a local `nodeId → at-uri` map.
 *
 * Get this wrong and a second publish run duplicates the user's entire set —
 * visibly, publicly, and with no undo. Hence `reconcile()`: before the first
 * write of any run, the local map is checked against what is actually in the
 * repo, so a map lost with a device does not become 2,000 duplicate records.
 *
 * `fyi.xnet.social.affinity` declares `"key": "any"` and uses
 * {@link affinityRkey}. That is the real reason the extension record exists.
 */

import type { PublishedEdge } from './types'
import { AFFINITY_NSID } from './constants'

/**
 * Characters an atproto record key allows. Anything else is replaced, because a
 * rejected rkey surfaces as an opaque 400 from the PDS halfway through a run.
 */
const RKEY_SAFE = /[^A-Za-z0-9.\-_~]/g

/**
 * A deterministic rkey for the affinity record, derived from the interaction's
 * node id (itself a hash — see `createSocialNodeId`).
 *
 * Same node ⇒ same rkey ⇒ `putRecord` overwrites in place rather than
 * appending. Re-importing the same archive on a fresh device produces the same
 * node ids and therefore the same rkeys, which is what makes the "delete the
 * workspace and start over" case safe.
 */
export function affinityRkey(nodeId: string): string {
  const key = nodeId.replace(RKEY_SAFE, '-')
  // atproto rkeys are 1–512 chars and `.`/`..` are reserved.
  if (key === '' || key === '.' || key === '..') {
    throw new Error(`[social/publish] cannot derive an rkey from node id "${nodeId}"`)
  }
  return key.slice(0, 512)
}

/** `at://did/collection/rkey` for an affinity record. */
export function affinityUri(did: string, nodeId: string): string {
  return `at://${did}/${AFFINITY_NSID}/${affinityRkey(nodeId)}`
}

/** A record already in the repo, as `listRecords` reports it. */
export interface RemoteBookmark {
  uri: string
  cid: string
  /** The record's `subject` — the only field that can identify it as ours. */
  subject: string
}

export interface ReconcileResult {
  /** The map to use for this run: local entries plus adopted remote ones. */
  map: PublishedEdge[]
  /** Remote records we matched to a local node and adopted into the map. */
  adopted: number
  /**
   * Map entries whose record is no longer in the repo — the user (or another
   * app) deleted it. Dropped from the map so a re-publish re-creates it, and
   * counted so the caller can say so rather than silently resurrecting things.
   */
  dropped: number
}

/**
 * Reconcile a local publish map against the repo before writing anything.
 *
 * `nodeIdForSubject` is the caller's index from normalised subject URL back to
 * the interaction node — the same normalisation the lens applies, or matching
 * fails and duplicates follow.
 *
 * Adoption is deliberately one-directional: a remote record with no local node
 * is left completely alone. It may belong to another bookmark app entirely, and
 * this pipeline has no business claiming, rewriting, or deleting it.
 */
export function reconcile(
  local: readonly PublishedEdge[],
  remote: readonly RemoteBookmark[],
  nodeIdForSubject: (subject: string) => string | undefined
): ReconcileResult {
  const remoteByUri = new Map(remote.map((r) => [r.uri, r]))
  const map = new Map<string, PublishedEdge>()
  let dropped = 0

  for (const entry of local) {
    const live = remoteByUri.get(entry.uri)
    if (!live) {
      dropped++
      continue
    }
    // Keep the live CID: ours may be stale if another app touched the record.
    map.set(entry.nodeId, { ...entry, cid: live.cid })
  }

  let adopted = 0
  const claimedUris = new Set([...map.values()].map((e) => e.uri))
  for (const record of remote) {
    if (claimedUris.has(record.uri)) continue
    const nodeId = nodeIdForSubject(record.subject)
    if (!nodeId || map.has(nodeId)) continue
    map.set(nodeId, {
      nodeId,
      uri: record.uri,
      cid: record.cid,
      // Unknown: we did not write it in this lifetime. Better an empty string
      // the UI can render as "adopted" than a fabricated timestamp.
      publishedAt: ''
    })
    adopted++
  }

  return {
    map: [...map.values()].sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1)),
    adopted,
    dropped
  }
}

/** Index a publish map by node id. */
export function indexByNodeId(entries: readonly PublishedEdge[]): Map<string, PublishedEdge> {
  return new Map(entries.map((entry) => [entry.nodeId, entry]))
}
