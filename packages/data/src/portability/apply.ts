/**
 * applyBundle — import an `.xnetpack` bundle by replaying it through the
 * store's remote-change apply path (exploration 0344). Import is
 * sync-from-disk: every change goes through the exact verification,
 * ledger-enforcement, authz, and LWW machinery a relayed change does, so a
 * bundle can do nothing a hostile sync peer couldn't.
 */

import { compareChangeApplicationOrder, type ContentId } from '@xnetjs/core'
import { base64ToBytes } from '@xnetjs/crypto'
import type { NodeStore } from '../store/store'
import type { NodeChange } from '../store/types'
import { decodeUtf8, fromPortableChangeRecord } from './serialize'
import { verifyBundle } from './verify'
import {
  BUNDLE_ENTRY,
  type ApplyBundleOptions,
  type BundleApplyReport,
  type BundleSource,
  type PortableBlobRecord,
  type PortableChangeRecord,
  type PortableYjsDocRecord,
  type QuarantinedRecord
} from './types'

/** Thrown when the bundle fails a pre-apply gate; nothing was written. */
export class BundleImportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'verify-failed'
      | 'unsigned-manifest'
      | 'foreign-owner'
      | 'missing-prerequisites'
  ) {
    super(message)
    this.name = 'BundleImportError'
  }
}

const APPLY_BATCH_SIZE = 500

export async function applyBundle(
  store: NodeStore,
  source: BundleSource,
  options: ApplyBundleOptions
): Promise<BundleApplyReport> {
  // ── Gates: verify bundle-level integrity before writing anything ─────────
  // Per-change signatures are deliberately NOT verified here: the
  // manifest-signed content digest covers every line, and the apply path
  // below re-verifies each record (hash + signature + ledger + authz)
  // before it is written — see VerifyBundleOptions.
  const verifyReport = await verifyBundle(source, { verifyChangeSignatures: false })
  if (!verifyReport.ok || !verifyReport.manifest) {
    const details = verifyReport.issues
      .filter((i) => i.severity === 'error')
      .map((i) => i.detail)
      .join('; ')
    throw new BundleImportError(`bundle failed verification: ${details}`, 'verify-failed')
  }
  const manifest = verifyReport.manifest

  if (!manifest.signatureB64 && !options.allowUnsigned) {
    throw new BundleImportError(
      'bundle manifest is unsigned — pass allowUnsigned to import anyway',
      'unsigned-manifest'
    )
  }

  // Owner check (the ATProto importRepo lesson, bluesky-social/atproto#4067):
  // restoring your own data is routine; importing someone else's is a
  // deliberate, grant-shaped decision.
  if (manifest.ownerDid !== options.importerDid && !options.allowForeignOwner) {
    throw new BundleImportError(
      `bundle is owned by ${manifest.ownerDid} but the importer is ${options.importerDid} — ` +
        'pass allowForeignOwner to import a bundle from another identity',
      'foreign-owner'
    )
  }

  // Prerequisites (git-bundle semantics): an incremental bundle only makes
  // sense on top of the frontier it was cut from.
  const missingPrerequisites: string[] = []
  if (manifest.prerequisites) {
    for (const head of manifest.prerequisites.heads) {
      if (!(await store.hasChange(head as ContentId))) missingPrerequisites.push(head)
    }
    if (missingPrerequisites.length > 0 && !options.ignoreMissingPrerequisites) {
      throw new BundleImportError(
        `store is missing ${missingPrerequisites.length} prerequisite head(s) — this incremental ` +
          'bundle needs its base bundle imported first (or pass ignoreMissingPrerequisites)',
        'missing-prerequisites'
      )
    }
  }

  const quarantined: QuarantinedRecord[] = []
  const quarantine = (record: QuarantinedRecord) => {
    quarantined.push(record)
    options.onQuarantine?.(record)
  }

  // ── Changes: replay in protocol application order ────────────────────────
  const changes: NodeChange[] = []
  for await (const line of source.readLines(BUNDLE_ENTRY.changes)) {
    try {
      changes.push(fromPortableChangeRecord(JSON.parse(line) as PortableChangeRecord))
    } catch (err) {
      // verifyBundle already flagged unparseable lines; keep the reason here
      // so the report is self-contained.
      quarantine({ kind: 'change', subject: line.slice(0, 80), reason: (err as Error).message })
    }
  }
  changes.sort((a, b) =>
    compareChangeApplicationOrder(
      { lamport: a.lamport, author: a.authorDID },
      { lamport: b.lamport, author: b.authorDID }
    )
  )

  let applied = 0
  let duplicates = 0
  for (let i = 0; i < changes.length; i += APPLY_BATCH_SIZE) {
    for (const change of changes.slice(i, i + APPLY_BATCH_SIZE)) {
      try {
        if (await store.hasChange(change.hash)) {
          duplicates++
          continue
        }
        // Full remote-change pipeline: hash + signature verification,
        // account-ledger enforcement, authz evaluation, LWW apply.
        await store.applyRemoteChange(change)
        applied++
      } catch (err) {
        quarantine({
          kind: 'change',
          subject: change.hash,
          reason: err instanceof Error ? err.message : String(err)
        })
      }
    }
  }

  // ── Blobs ────────────────────────────────────────────────────────────────
  let blobsInstalled = 0
  if (options.blobPort) {
    for await (const line of source.readLines(BUNDLE_ENTRY.blobIndex)) {
      let record: PortableBlobRecord
      try {
        record = JSON.parse(line) as PortableBlobRecord
      } catch (err) {
        quarantine({ kind: 'blob', subject: line.slice(0, 80), reason: (err as Error).message })
        continue
      }
      try {
        if (await options.blobPort.has(record.cid)) continue
        const bytes = await source.readEntry(record.path)
        if (!bytes) {
          quarantine({ kind: 'blob', subject: record.cid, reason: `bundle entry ${record.path} missing` })
          continue
        }
        await options.blobPort.put(bytes, { cid: record.cid, mimeType: record.mimeType })
        blobsInstalled++
      } catch (err) {
        quarantine({ kind: 'blob', subject: record.cid, reason: (err as Error).message })
      }
    }
  }

  // ── Yjs docs: state-vector merge via the port, never re-application ──────
  let yjsDocsApplied = 0
  if (options.yjsPort) {
    for await (const line of source.readLines(BUNDLE_ENTRY.yjsDocs)) {
      let record: PortableYjsDocRecord
      try {
        record = JSON.parse(line) as PortableYjsDocRecord
      } catch (err) {
        quarantine({ kind: 'yjs-doc', subject: line.slice(0, 80), reason: (err as Error).message })
        continue
      }
      try {
        await options.yjsPort.apply(record.nodeId, base64ToBytes(record.updateB64))
        yjsDocsApplied++
      } catch (err) {
        quarantine({ kind: 'yjs-doc', subject: record.nodeId, reason: (err as Error).message })
      }
    }
  }

  return { applied, duplicates, quarantined, blobsInstalled, yjsDocsApplied, missingPrerequisites }
}

/** Convenience: parse a manifest without verifying (for UI preview). */
export async function readBundleManifest(source: BundleSource) {
  const bytes = await source.readEntry(BUNDLE_ENTRY.manifest)
  if (!bytes) return null
  try {
    return JSON.parse(decodeUtf8(bytes))
  } catch {
    return null
  }
}
