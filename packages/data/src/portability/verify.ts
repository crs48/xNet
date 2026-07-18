/**
 * verifyBundle — read-only integrity check of an `.xnetpack` bundle
 * (exploration 0344). git-bundle-verify semantics: report everything wrong
 * before any write happens. A foreign bundle is hostile input; nothing here
 * trusts a byte it hasn't re-hashed or re-verified.
 */

import type { DID } from '@xnetjs/core'
import { base64ToBytes, verify as verifySignature } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'
import { verifyChangeFast, verifyChangeHash, CURRENT_PROTOCOL_VERSION } from '@xnetjs/sync'
import {
  canonicalManifestBytes,
  combineEntryDigests,
  createNdjsonDigest,
  decodeUtf8,
  digestEntryBytes,
  fromPortableChangeRecord
} from './serialize'
import {
  BUNDLE_ENTRY,
  XNETPACK_FORMAT_VERSION,
  type BundleSource,
  type BundleVerifyIssue,
  type BundleVerifyReport,
  type PortableChangeRecord,
  type XnetpackManifest
} from './types'

function parseCidHex(path: string): { algo: string; hex: string } | null {
  const match = /^blobs\/([a-z0-9-]+)\/([0-9a-f]+)$/i.exec(path)
  if (!match || match[1] === 'raw') return null
  return { algo: match[1], hex: match[2] }
}

export type VerifyBundleOptions = {
  /**
   * Verify each change's hash + Ed25519 signature (default true). The
   * apply pipeline passes false: the manifest-signed content digest
   * already proves bundle-level integrity here, and `applyRemoteChange`
   * re-verifies every record individually before it is written — checking
   * signatures twice doubles import time (~1.4ms/change) for no added
   * safety.
   */
  verifyChangeSignatures?: boolean
}

export async function verifyBundle(
  source: BundleSource,
  options: VerifyBundleOptions = {}
): Promise<BundleVerifyReport> {
  const verifyChangeSignatures = options.verifyChangeSignatures ?? true
  const issues: BundleVerifyIssue[] = []
  const error = (code: BundleVerifyIssue['code'], detail: string, subject?: string) =>
    issues.push({ severity: 'error', code, detail, subject })
  const warning = (code: BundleVerifyIssue['code'], detail: string, subject?: string) =>
    issues.push({ severity: 'warning', code, detail, subject })

  // ── Manifest ──────────────────────────────────────────────────────────────
  const manifestBytes = await source.readEntry(BUNDLE_ENTRY.manifest)
  if (!manifestBytes) {
    error('unknown-format', 'bundle has no manifest.json')
    return { ok: false, manifest: null, issues, danglingParents: 0 }
  }
  let manifest: XnetpackManifest
  try {
    manifest = JSON.parse(decodeUtf8(manifestBytes)) as XnetpackManifest
  } catch (err) {
    error('unknown-format', `manifest.json is not valid JSON: ${(err as Error).message}`)
    return { ok: false, manifest: null, issues, danglingParents: 0 }
  }
  if (manifest.formatVersion !== XNETPACK_FORMAT_VERSION) {
    error('unknown-format', `unsupported formatVersion "${manifest.formatVersion}"`)
    return { ok: false, manifest, issues, danglingParents: 0 }
  }
  if ((manifest.protocolVersion?.change ?? 0) > CURRENT_PROTOCOL_VERSION) {
    error(
      'future-protocol',
      `bundle uses change protocol v${manifest.protocolVersion.change}, this build supports v${CURRENT_PROTOCOL_VERSION}`
    )
  }

  if (!manifest.signatureB64) {
    warning('manifest-unsigned', 'manifest carries no signature')
  } else {
    try {
      const publicKey = parseDID(manifest.ownerDid as DID)
      const signature = base64ToBytes(manifest.signatureB64)
      if (!verifySignature(canonicalManifestBytes(manifest), signature, publicKey)) {
        error(
          'manifest-signature-invalid',
          `manifest signature does not verify against ${manifest.ownerDid}`
        )
      }
    } catch (err) {
      error(
        'manifest-signature-invalid',
        `cannot verify manifest signature: ${(err as Error).message}`
      )
    }
  }

  // ── Changes ───────────────────────────────────────────────────────────────
  const entryDigests = new Map<string, string>()
  const changesDigest = createNdjsonDigest()
  const presentHashes = new Set<string>()
  const parentHashes: (string | null)[] = []
  let lineNumber = 0
  for await (const line of source.readLines(BUNDLE_ENTRY.changes)) {
    lineNumber++
    changesDigest.addLine(line)
    let record: PortableChangeRecord
    try {
      record = JSON.parse(line) as PortableChangeRecord
    } catch {
      error(
        'change-unparseable',
        `changes.ndjson line ${lineNumber} is not valid JSON`,
        `line:${lineNumber}`
      )
      continue
    }
    let change
    try {
      change = fromPortableChangeRecord(record)
    } catch (err) {
      error('change-unparseable', `line ${lineNumber}: ${(err as Error).message}`, record.hash)
      continue
    }
    if (verifyChangeSignatures) {
      if (!verifyChangeHash(change)) {
        error(
          'change-hash-invalid',
          `change ${change.id} fails hash re-computation (tampered?)`,
          record.hash
        )
        continue
      }
      try {
        const publicKey = parseDID(change.authorDID)
        if (!(await verifyChangeFast(change, publicKey))) {
          error(
            'change-signature-invalid',
            `change ${change.id} signature does not match ${change.authorDID}`,
            record.hash
          )
          continue
        }
      } catch (err) {
        error(
          'change-signature-invalid',
          `change ${change.id}: ${(err as Error).message}`,
          record.hash
        )
        continue
      }
    }
    presentHashes.add(change.hash)
    parentHashes.push(change.parentHash)
  }
  entryDigests.set(BUNDLE_ENTRY.changes, changesDigest.finish())
  if (changesDigest.lineCount() !== manifest.counts.changes) {
    error(
      'count-mismatch',
      `manifest declares ${manifest.counts.changes} changes, bundle has ${changesDigest.lineCount()}`
    )
  }

  // Parent-chain accounting: parents may legitimately live outside the
  // bundle (incremental export, scoped export) — CAR-style dangling refs.
  // They are counted and surfaced, not fatal.
  const prerequisiteHeads = new Set(manifest.prerequisites?.heads ?? [])
  let danglingParents = 0
  for (const parent of parentHashes) {
    if (parent !== null && !presentHashes.has(parent) && !prerequisiteHeads.has(parent)) {
      danglingParents++
    }
  }
  if (danglingParents > 0) {
    warning(
      'dangling-parent',
      `${danglingParents} change(s) reference parents outside the bundle (expected for scoped/incremental exports)`
    )
  }

  // ── Blob index + blob entries ─────────────────────────────────────────────
  const blobIndexDigest = createNdjsonDigest()
  const indexedPaths = new Set<string>()
  for await (const line of source.readLines(BUNDLE_ENTRY.blobIndex)) {
    blobIndexDigest.addLine(line)
    try {
      const record = JSON.parse(line) as { cid: string; path: string }
      indexedPaths.add(record.path)
    } catch {
      error('change-unparseable', 'blobs.ndjson contains an unparseable line')
    }
  }
  entryDigests.set(BUNDLE_ENTRY.blobIndex, blobIndexDigest.finish())
  if (blobIndexDigest.lineCount() !== manifest.counts.blobs) {
    error(
      'count-mismatch',
      `manifest declares ${manifest.counts.blobs} blobs, index has ${blobIndexDigest.lineCount()}`
    )
  }
  for (const path of await source.listEntries('blobs/')) {
    if (path === BUNDLE_ENTRY.blobIndex) continue
    const bytes = await source.readEntry(path)
    if (!bytes) continue
    entryDigests.set(path, digestEntryBytes(bytes))
    const cid = parseCidHex(path)
    // Content-addressed name check: for blake3 entries the filename IS the
    // expected digest of the bytes.
    if (cid && cid.algo === 'blake3' && digestEntryBytes(bytes) !== cid.hex.toLowerCase()) {
      error('blob-digest-mismatch', `blob ${path} bytes do not hash to their filename`, path)
    }
    if (!indexedPaths.has(path)) {
      warning('count-mismatch', `blob entry ${path} is not listed in blobs.ndjson`, path)
    }
  }

  // ── Yjs docs ──────────────────────────────────────────────────────────────
  const yjsDigest = createNdjsonDigest()
  for await (const line of source.readLines(BUNDLE_ENTRY.yjsDocs)) {
    yjsDigest.addLine(line)
  }
  entryDigests.set(BUNDLE_ENTRY.yjsDocs, yjsDigest.finish())
  if (yjsDigest.lineCount() !== manifest.counts.yjsDocs) {
    error(
      'count-mismatch',
      `manifest declares ${manifest.counts.yjsDocs} yjs docs, bundle has ${yjsDigest.lineCount()}`
    )
  }

  // ── Whole-bundle digest ───────────────────────────────────────────────────
  if (combineEntryDigests(entryDigests) !== manifest.contentDigest) {
    error('content-digest-mismatch', 'entry digests do not match manifest.contentDigest')
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    manifest,
    issues,
    danglingParents
  }
}
