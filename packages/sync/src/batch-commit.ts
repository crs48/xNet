/**
 * Batch commits: one signature over many changes (exploration 0357 Tier 2).
 *
 * A bulk operation in xNet is N changes, one per node — that is deliberate,
 * and it is what makes per-node parent chains, per-property LWW, and selective
 * sync work. But it means a 10,000-node import pays 10,000 Ed25519 signatures
 * on write and 10,000 verifications on read, plus 88 bytes of base64 signature
 * per change on the wire and on disk.
 *
 * Every mature system in this space solved that the same way: hash every unit,
 * sign only at a batch boundary, and prove membership under the signed root.
 * Hypercore signs one Merkle root per append; Certificate Transparency signs
 * one tree head per interval; AT Protocol signs one commit over an MST no
 * matter how many records changed. Per-message signing (Scuttlebutt, Nostr) is
 * the pattern their successors moved away from.
 *
 * A `BatchCommit` is that boundary. It carries the ordered hashes of the
 * changes it covers plus a BLAKE3 root over them, and is signed ONCE. A
 * verifier then does N cheap hash recomputations (which it must do anyway, to
 * confirm each change matches its own content address) plus ONE signature
 * verification, instead of N signature verifications.
 *
 * ## What this does NOT change
 *
 * - The `Change` record, its canonical bytes, its hash recipe, and the LWW
 *   ordering rules are untouched. This is an ADDITIVE record, so the four
 *   conformance kernels gain vectors rather than a re-derivation.
 * - Authorization, ledger enforcement, quota, and LWW still run per change. A
 *   commit amortizes *authentication*, nothing else.
 *
 * ## Where it is valid
 *
 * Only in lanes where the batch travels as a unit — `.xnetpack` import/export,
 * hub NDJSON restore, initial-sync snapshots, migrations. Interactive single
 * edits keep their per-change signature, because live relay fans a change out
 * to peers who may never receive its siblings, and a change whose validity
 * depends on a sibling would break that.
 *
 * Chain-head signing (ATProto's `prev`, Scuttlebutt's feed) is deliberately
 * NOT used here: xNet's parent-hash chains are per-NODE, so a bulk import of N
 * distinct nodes is N chains of depth 1 and a chain head amortizes nothing.
 * The root must span nodes, hence a list/tree over change hashes.
 */

import type { Change } from './change'
import type { DID, ContentId } from '@xnetjs/core'
import { hashHex, sign, verify, verifyFast } from '@xnetjs/crypto'
import { CURRENT_PROTOCOL_VERSION, sortObjectKeys } from './change'

/**
 * Maximum changes one commit may cover.
 *
 * Matches the wire batch cap: a commit is verified by recomputing every member
 * hash, so an unbounded commit would be an unbounded unit of work for the
 * verifier. Larger imports emit several commits.
 */
export const MAX_COMMIT_CHANGES = 1000

/** A batch commit before it has been hashed and signed. */
export interface UnsignedBatchCommit {
  id: string
  type: 'batch-commit'
  protocolVersion: number
  authorDID: DID
  /** Room/scope the covered changes belong to, when the lane has one. */
  room?: string
  /** Ordered hashes of the covered changes. Order is part of the root. */
  changeHashes: ContentId[]
  /** BLAKE3 over the ordered change hashes — see {@link computeBatchRoot}. */
  root: ContentId
  lamport: number
  wallTime: number
}

/** A signed batch commit. One signature covers every change it names. */
export interface BatchCommit extends UnsignedBatchCommit {
  hash: ContentId
  signature: Uint8Array
}

/**
 * Compute the root over an ordered list of change hashes.
 *
 * This is a flat digest, not a Merkle tree: a commit's members always travel
 * together in the lanes where commits are valid, so no member ever needs an
 * O(log n) inclusion proof against the root. If a lane later needs to
 * redistribute covered changes individually, this is the function that becomes
 * a Merkle root (and members gain proofs) — the commit shape does not change.
 *
 * Hashes are joined with a separator that cannot appear in a `cid:blake3:`
 * string, so no concatenation of two hash lists can collide with another.
 */
export function computeBatchRoot(changeHashes: readonly ContentId[]): ContentId {
  const canonical = changeHashes.join('\n')
  return `cid:blake3:${hashHex(new TextEncoder().encode(canonical))}` as ContentId
}

/**
 * Hash a commit for signing. Same recipe as a change: recursively key-sorted
 * canonical JSON, BLAKE3, `cid:blake3:` prefix.
 */
export function computeBatchCommitHash(unsigned: UnsignedBatchCommit): ContentId {
  const canonical = JSON.stringify(sortObjectKeys(unsigned))
  return `cid:blake3:${hashHex(new TextEncoder().encode(canonical))}` as ContentId
}

export interface CreateBatchCommitOptions {
  id: string
  authorDID: DID
  changeHashes: readonly ContentId[]
  lamport: number
  wallTime: number
  room?: string
  protocolVersion?: number
}

/** Build an unsigned commit, computing its root. */
export function createUnsignedBatchCommit(options: CreateBatchCommitOptions): UnsignedBatchCommit {
  if (options.changeHashes.length === 0) {
    throw new Error('[xnet/sync] a batch commit must cover at least one change')
  }
  if (options.changeHashes.length > MAX_COMMIT_CHANGES) {
    throw new Error(
      `[xnet/sync] a batch commit may cover at most ${MAX_COMMIT_CHANGES} changes ` +
        `(got ${options.changeHashes.length}); split the batch`
    )
  }

  const changeHashes = [...options.changeHashes]
  const unsigned: UnsignedBatchCommit = {
    id: options.id,
    type: 'batch-commit',
    protocolVersion: options.protocolVersion ?? CURRENT_PROTOCOL_VERSION,
    authorDID: options.authorDID,
    changeHashes,
    root: computeBatchRoot(changeHashes),
    lamport: options.lamport,
    wallTime: options.wallTime
  }
  if (options.room !== undefined) unsigned.room = options.room
  return unsigned
}

/** Hash and sign a commit — the ONE signature that covers the whole batch. */
export function signBatchCommit(
  unsigned: UnsignedBatchCommit,
  signingKey: Uint8Array
): BatchCommit {
  const hash = computeBatchCommitHash(unsigned)
  return {
    ...unsigned,
    hash,
    signature: sign(new TextEncoder().encode(hash), signingKey)
  }
}

/** Recompute a commit's hash from its own fields (the tamper check). */
export function recomputeBatchCommitHash(commit: BatchCommit): ContentId {
  const unsigned: UnsignedBatchCommit = {
    id: commit.id,
    type: commit.type,
    protocolVersion: commit.protocolVersion,
    authorDID: commit.authorDID,
    changeHashes: commit.changeHashes,
    root: commit.root,
    lamport: commit.lamport,
    wallTime: commit.wallTime
  }
  if (commit.room !== undefined) unsigned.room = commit.room
  return computeBatchCommitHash(unsigned)
}

/**
 * Verify a commit in isolation: its hash matches its fields, its root matches
 * its change-hash list, and its signature matches its author.
 *
 * This says nothing about whether any particular change belongs to it — use
 * {@link verifyBatch} for that.
 */
export function verifyBatchCommit(commit: BatchCommit, publicKey: Uint8Array): boolean {
  if (recomputeBatchCommitHash(commit) !== commit.hash) return false
  if (computeBatchRoot(commit.changeHashes) !== commit.root) return false
  return verify(new TextEncoder().encode(commit.hash), commit.signature, publicKey)
}

/** Async form of {@link verifyBatchCommit}, using native Ed25519 when present. */
export async function verifyBatchCommitFast(
  commit: BatchCommit,
  publicKey: Uint8Array
): Promise<boolean> {
  if (recomputeBatchCommitHash(commit) !== commit.hash) return false
  if (computeBatchRoot(commit.changeHashes) !== commit.root) return false
  return verifyFast(new TextEncoder().encode(commit.hash), commit.signature, publicKey)
}

export interface BatchVerificationResult {
  /** True only if the commit is valid AND every supplied change is covered by it. */
  ok: boolean
  /** Per-change verdicts, positional with the input. */
  members: boolean[]
  reason?: string
}

/**
 * Verify a whole batch: ONE signature check plus N hash recomputations.
 *
 * The membership rules are what keep this from being weaker than per-change
 * signatures:
 *
 * - each change must recompute to its own claimed hash (so payload tampering
 *   is caught exactly as it would be for a signed change);
 * - that hash must appear in the commit's list (so a change cannot be smuggled
 *   into a batch it was not signed over);
 * - the change's author must equal the commit's author (so a commit cannot
 *   launder someone else's authorship — the signer vouches only for their own
 *   changes);
 * - the commit's own hash/root/signature must be valid (so the list itself
 *   cannot be edited).
 *
 * `recomputeChangeHash` is injected rather than imported to keep this module
 * free of a cycle with `change.ts`.
 */
export async function verifyBatch<T>(
  commit: BatchCommit,
  changes: readonly Change<T>[],
  publicKey: Uint8Array,
  recomputeChangeHash: (change: Change<T>) => ContentId
): Promise<BatchVerificationResult> {
  if (!(await verifyBatchCommitFast(commit, publicKey))) {
    return { ok: false, members: changes.map(() => false), reason: 'commit is invalid' }
  }

  const covered = new Set<string>(commit.changeHashes)
  const members = changes.map((change) => {
    if (recomputeChangeHash(change) !== change.hash) return false
    if (!covered.has(change.hash)) return false
    if (change.authorDID !== commit.authorDID) return false
    return true
  })

  const failed = members.filter((ok) => !ok).length
  return failed === 0
    ? { ok: true, members }
    : { ok: false, members, reason: `${failed} change(s) are not covered by this commit` }
}

/**
 * Split an ordered change list into commit-sized groups.
 *
 * Order is preserved, so the caller can emit commits and their member changes
 * in causal order.
 */
export function chunkForCommits<T>(
  changes: readonly T[],
  size: number = MAX_COMMIT_CHANGES
): T[][] {
  const limit = Math.max(1, Math.min(size, MAX_COMMIT_CHANGES))
  const chunks: T[][] = []
  for (let index = 0; index < changes.length; index += limit) {
    chunks.push(changes.slice(index, index + limit))
  }
  return chunks
}
