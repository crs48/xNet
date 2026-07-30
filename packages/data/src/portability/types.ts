/**
 * Portability types — the `.xnetpack` bundle format (exploration 0344).
 *
 * A bundle is the sync protocol written to disk: an NDJSON stream of the
 * signed, hash-chained change log plus optional content-addressed blobs and
 * Yjs document states, indexed by a signed manifest. Export is
 * "sync-to-disk"; import is verify-then-replay through the same apply path
 * the sync layer uses, so a bundle behaves like a peer that happens to be a
 * file.
 *
 * Bundle layout (a directory, or the same paths inside a zip):
 *
 *   manifest.json          — XnetpackManifest, signed by the exporting DID
 *   changes.ndjson         — one PortableChangeRecord per line
 *   blobs.ndjson           — one PortableBlobRecord per line (index)
 *   blobs/<algo>/<hex>     — raw blob bytes, filename = content hash
 *   yjs/docs.ndjson        — one PortableYjsDocRecord per line
 */

import type { NodePayload } from '../store/types'
import type { ContentId } from '@xnetjs/core'

/** Format identifier + version for the bundle layout itself. */
export const XNETPACK_FORMAT_VERSION = 'xnetpack/1'

/** Entry paths within a bundle. */
export const BUNDLE_ENTRY = {
  manifest: 'manifest.json',
  changes: 'changes.ndjson',
  /** Batch commits covering the owner's own changes (exploration 0357). */
  commits: 'commits.ndjson',
  blobIndex: 'blobs.ndjson',
  yjsDocs: 'yjs/docs.ndjson'
} as const

/**
 * A change serialized for the bundle. Mirrors the hub wire shape
 * (`SerializedNodeChange`) minus the transport-only `room` field, so a
 * bundle line and a relayed change are interchangeable representations of
 * the same signed record.
 */
export type PortableChangeRecord = {
  id: string
  type: string
  hash: string
  nodeId: string
  schemaId?: string
  lamportTime: number
  authorDid: string
  wallTime: number
  parentHash: string | null
  payload: NodePayload
  signatureB64: string
  protocolVersion?: number
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

/**
 * A batch commit serialized for the bundle (exploration 0357).
 *
 * One commit authenticates up to `MAX_COMMIT_CHANGES` of the owner's changes
 * with a single signature, so importing a large self-export costs ~1 signature
 * verification per 1000 changes instead of one per change.
 *
 * A commit may only cover changes by its OWN author — a commit cannot vouch
 * for someone else's change (see the membership rules in L1 §6.1) — so a
 * bundle containing several authors' changes commits only the owner's, and
 * the rest keep per-change verification.
 */
export type PortableCommitRecord = {
  id: string
  type: 'batch-commit'
  protocolVersion: number
  authorDid: string
  changeHashes: string[]
  root: string
  lamportTime: number
  wallTime: number
  hash: string
  signatureB64: string
}

/** Blob index line: metadata for a `blobs/<algo>/<hex>` entry. */
export type PortableBlobRecord = {
  cid: string
  /** Entry path within the bundle holding the raw bytes. */
  path: string
  size: number
  mimeType?: string
}

/** Yjs doc line: the full doc state as a single Yjs update (base64). */
export type PortableYjsDocRecord = {
  nodeId: string
  updateB64: string
}

/** What to export. */
export type BundleScope =
  | { kind: 'full' }
  | { kind: 'nodes'; nodeIds: readonly string[] }
  | { kind: 'schemas'; schemaIds: readonly string[] }
  | { kind: 'space'; spaceId: string }

/**
 * A position in the change log: the highest Lamport time in the exported
 * set plus the hashes of the changes at that frontier. A later incremental
 * export passes a previous manifest's `frontier` as `since`; it becomes the
 * new bundle's `prerequisites` (git-bundle semantics: the importer must
 * already hold these heads).
 */
export type BundleFrontier = {
  lamport: number
  /** Hashes of exported changes at `lamport` (capped sample). */
  heads: string[]
  changeCount: number
}

export type XnetpackManifest = {
  formatVersion: typeof XNETPACK_FORMAT_VERSION
  /** Protocol versions the records were produced under. */
  protocolVersion: { change: number }
  ownerDid: string
  scope: BundleScope
  createdAt: number
  frontier: BundleFrontier
  /** Present on incremental bundles: the frontier this bundle starts after. */
  prerequisites?: BundleFrontier
  counts: { changes: number; blobs: number; yjsDocs: number; commits?: number }
  /**
   * Digest over every non-manifest entry (see `digestEntries`): detects a
   * bundle whose entries were swapped or truncated after manifest signing.
   */
  contentDigest: string
  /** Ed25519 signature by `ownerDid` over the canonical unsigned manifest. */
  signatureB64?: string
}

// ─── Sink / source ───────────────────────────────────────────────────────────

/**
 * Where a bundle is written. Implementations: in-memory (tests, zip
 * assembly in the browser), a directory on disk (CLI/hub), a streaming zip.
 */
export interface BundleSink {
  writeEntry(path: string, data: Uint8Array): Promise<void> | void
}

/** Where a bundle is read from. */
export interface BundleSource {
  /** Returns null when the entry does not exist. */
  readEntry(path: string): Promise<Uint8Array | null>
  /** Stream the lines of an NDJSON entry (without trailing newlines). */
  readLines(path: string): AsyncIterable<string>
  /** List entry paths under a prefix (used for `blobs/`). */
  listEntries(prefix: string): Promise<string[]>
}

// ─── Ports ───────────────────────────────────────────────────────────────────
//
// Blobs and Yjs docs live outside the NodeStore, so the codec reaches them
// through narrow ports the caller wires up. Both are optional: a bundle
// without a port simply carries no blobs / no docs.

export interface BundleBlobPort {
  list(): AsyncIterable<{ cid: string; bytes: Uint8Array; mimeType?: string }>
  has(cid: string): Promise<boolean>
  put(bytes: Uint8Array, meta?: { cid?: string; mimeType?: string }): Promise<void>
}

export interface BundleYjsPort {
  /** Yield each doc's full state as one Yjs update. */
  list(): AsyncIterable<{ nodeId: string; update: Uint8Array }>
  /**
   * Merge an update into the node's doc. Implementations use Yjs
   * `applyUpdate`, which merges by state vector — re-importing a doc the
   * store already has must not duplicate content.
   */
  apply(nodeId: string, update: Uint8Array): Promise<void>
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export type BundleVerifyIssue = {
  severity: 'error' | 'warning'
  code:
    | 'unknown-format'
    | 'future-protocol'
    | 'manifest-unsigned'
    | 'manifest-signature-invalid'
    | 'content-digest-mismatch'
    | 'count-mismatch'
    | 'change-hash-invalid'
    | 'change-signature-invalid'
    | 'change-unparseable'
    | 'blob-digest-mismatch'
    | 'dangling-parent'
  detail: string
  /** For per-record issues: the change hash / blob cid / line number. */
  subject?: string
}

export type BundleVerifyReport = {
  ok: boolean
  manifest: XnetpackManifest | null
  issues: BundleVerifyIssue[]
  /** Changes whose parentHash is neither in the bundle nor a prerequisite head. */
  danglingParents: number
}

export type QuarantinedRecord = {
  kind: 'change' | 'blob' | 'yjs-doc'
  subject: string
  reason: string
}

export type BundleApplyReport = {
  applied: number
  /** Changes the store already held (idempotent redelivery). */
  duplicates: number
  quarantined: QuarantinedRecord[]
  blobsInstalled: number
  yjsDocsApplied: number
  /** Prerequisite heads the store did not hold (empty when none missing). */
  missingPrerequisites: string[]
}

export type ApplyBundleOptions = {
  /** DID of the identity performing the import. */
  importerDid: string
  /**
   * Import a bundle whose ownerDid differs from importerDid. Off by
   * default: importing someone else's bundle is a grant-shaped decision
   * (ATProto learned this the hard way — bluesky-social/atproto#4067).
   */
  allowForeignOwner?: boolean
  /** Accept a bundle with no manifest signature (default false). */
  allowUnsigned?: boolean
  /** Continue even when prerequisite heads are missing (default false). */
  ignoreMissingPrerequisites?: boolean
  blobPort?: BundleBlobPort
  yjsPort?: BundleYjsPort
  onQuarantine?: (record: QuarantinedRecord) => void
}

export type WriteBundleOptions = {
  ownerDid: string
  /**
   * Signs the canonical unsigned manifest bytes. Wire this to the
   * identity's Ed25519 key (`sign` from @xnetjs/crypto) or a WebCrypto /
   * remote signer. When omitted the manifest is unsigned and import
   * requires `allowUnsigned`.
   */
  manifestSigner?: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array
  /**
   * Signs the UTF-8 bytes of a batch commit's hash, enabling one signature to
   * cover up to 1000 of the owner's changes on import (exploration 0357).
   * Same key as `manifestSigner`; omit to emit a bundle with no commits
   * (every change is then verified individually, as before).
   */
  commitSigner?: (bytes: Uint8Array) => Promise<Uint8Array> | Uint8Array
  /** Export only changes after this frontier (becomes `prerequisites`). */
  since?: BundleFrontier
  blobPort?: BundleBlobPort
  yjsPort?: BundleYjsPort
}

/** Hash of a change at the frontier — capped to keep manifests small. */
export const FRONTIER_HEADS_CAP = 32

export type { ContentId }
