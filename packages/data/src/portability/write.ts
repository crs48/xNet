/**
 * writeBundle — export a scope of the store as an `.xnetpack` bundle
 * (exploration 0344). Export is sync-to-disk: the entries are the same
 * signed records the sync layer ships, so the bundle needs no bespoke
 * parser on the other side.
 */

import type { SchemaIRI } from '../schema/node'
import type { NodeStore } from '../store/store'
import type { NodeChange } from '../store/types'
import { compareChangeApplicationOrder } from '@xnetjs/core'
import { bytesToBase64 } from '@xnetjs/crypto'
import {
  CURRENT_PROTOCOL_VERSION,
  chunkForCommits,
  computeBatchCommitHash,
  createUnsignedBatchCommit
} from '@xnetjs/sync'
import {
  combineEntryDigests,
  createNdjsonDigest,
  encodeNdjsonLine,
  encodeUtf8,
  digestEntryBytes,
  toPortableChangeRecord,
  canonicalManifestBytes
} from './serialize'
import {
  BUNDLE_ENTRY,
  FRONTIER_HEADS_CAP,
  XNETPACK_FORMAT_VERSION,
  type BundleFrontier,
  type BundleScope,
  type BundleSink,
  type PortableBlobRecord,
  type PortableCommitRecord,
  type WriteBundleOptions,
  type XnetpackManifest
} from './types'

/** `cid:<algo>:<hex>` → bundle entry path; opaque cids go under blobs/raw/. */
export function blobEntryPath(cid: string): string {
  const match = /^cid:([a-z0-9-]+):([0-9a-f]+)$/i.exec(cid)
  if (match) return `blobs/${match[1]}/${match[2]}`
  return `blobs/raw/${encodeURIComponent(cid)}`
}

function frontierOf(changes: readonly NodeChange[]): BundleFrontier {
  let lamport = 0
  for (const change of changes) if (change.lamport > lamport) lamport = change.lamport
  const heads = changes
    .filter((c) => c.lamport === lamport)
    .slice(0, FRONTIER_HEADS_CAP)
    .map((c) => c.hash as string)
  return { lamport, heads, changeCount: changes.length }
}

function spaceOf(properties: Record<string, unknown>): unknown {
  return properties['space']
}

async function collectScopedNodeIds(store: NodeStore, scope: BundleScope): Promise<string[]> {
  if (scope.kind === 'nodes') return [...scope.nodeIds]
  if (scope.kind === 'schemas') {
    const ids: string[] = []
    for (const schemaId of scope.schemaIds) {
      const nodes = await store.list({ schemaId: schemaId as SchemaIRI, includeDeleted: true })
      for (const node of nodes) ids.push(node.id)
    }
    return ids
  }
  if (scope.kind !== 'space') return []
  // space: the space node itself plus every node whose `space` relation
  // points at it (relation values are plain node-id strings; see
  // auth/evaluator.ts membershipMatchesContainer).
  const all = await store.list({ includeDeleted: true })
  const ids: string[] = []
  for (const node of all) {
    if (node.id === scope.spaceId) {
      ids.push(node.id)
      continue
    }
    const space = spaceOf(node.properties)
    if (space === scope.spaceId) ids.push(node.id)
    else if (Array.isArray(space) && space.includes(scope.spaceId)) ids.push(node.id)
  }
  return ids
}

async function collectChanges(
  store: NodeStore,
  scope: BundleScope,
  since?: BundleFrontier
): Promise<NodeChange[]> {
  let changes: NodeChange[]
  if (scope.kind === 'full') {
    changes = since ? await store.getChangesSince(since.lamport) : await store.getAllChanges()
  } else {
    const nodeIds = await collectScopedNodeIds(store, scope)
    const byHash = new Map<string, NodeChange>()
    for (const nodeId of nodeIds) {
      for (const change of await store.getChanges(nodeId)) {
        if (!since || change.lamport > since.lamport) byHash.set(change.hash, change)
      }
    }
    changes = [...byHash.values()]
  }
  // Deterministic file order = the shared protocol application order.
  return changes.sort((a, b) =>
    compareChangeApplicationOrder(
      { lamport: a.lamport, author: a.authorDID },
      { lamport: b.lamport, author: b.authorDID }
    )
  )
}

export async function writeBundle(
  store: NodeStore,
  scope: BundleScope,
  sink: BundleSink,
  options: WriteBundleOptions
): Promise<XnetpackManifest> {
  const entryDigests = new Map<string, string>()

  // 1. Changes.
  const changes = await collectChanges(store, scope, options.since)
  const changesDigest = createNdjsonDigest()
  const changeLines: string[] = []
  for (const change of changes) {
    const line = encodeNdjsonLine(toPortableChangeRecord(change))
    changesDigest.addLine(line)
    changeLines.push(line)
  }
  await sink.writeEntry(
    BUNDLE_ENTRY.changes,
    encodeUtf8(changeLines.join('\n') + (changeLines.length ? '\n' : ''))
  )
  entryDigests.set(BUNDLE_ENTRY.changes, changesDigest.finish())

  // 2. Batch commits over the owner's own changes (exploration 0357).
  // A commit may only cover changes by its own author, so changes authored by
  // anyone else are left to per-change verification on import.
  const commitLines: string[] = []
  const commitsDigest = createNdjsonDigest()
  let commitCount = 0
  if (options.commitSigner) {
    const ownChanges = changes.filter((change) => change.authorDID === options.ownerDid)
    let commitIndex = 0
    for (const group of chunkForCommits(ownChanges)) {
      const unsigned = createUnsignedBatchCommit({
        id: `${options.ownerDid}:commit:${commitIndex++}`,
        authorDID: options.ownerDid as NodeChange['authorDID'],
        changeHashes: group.map((change) => change.hash),
        // Commits order after every change they cover, so a consumer replaying
        // in lamport order sees the members first.
        lamport: group[group.length - 1].lamport,
        wallTime: group[group.length - 1].wallTime
      })
      const hash = computeBatchCommitHash(unsigned)
      const signature = await options.commitSigner(encodeUtf8(hash))
      const record: PortableCommitRecord = {
        id: unsigned.id,
        type: 'batch-commit',
        protocolVersion: unsigned.protocolVersion,
        authorDid: unsigned.authorDID,
        changeHashes: unsigned.changeHashes,
        root: unsigned.root,
        lamportTime: unsigned.lamport,
        wallTime: unsigned.wallTime,
        hash,
        signatureB64: bytesToBase64(signature)
      }
      const line = encodeNdjsonLine(record)
      commitsDigest.addLine(line)
      commitLines.push(line)
      commitCount++
    }
  }
  await sink.writeEntry(
    BUNDLE_ENTRY.commits,
    encodeUtf8(commitLines.join('\n') + (commitLines.length ? '\n' : ''))
  )
  entryDigests.set(BUNDLE_ENTRY.commits, commitsDigest.finish())

  // 3. Blobs (optional port).
  let blobCount = 0
  const blobIndexDigest = createNdjsonDigest()
  const blobIndexLines: string[] = []
  if (options.blobPort) {
    for await (const blob of options.blobPort.list()) {
      const path = blobEntryPath(blob.cid)
      await sink.writeEntry(path, blob.bytes)
      entryDigests.set(path, digestEntryBytes(blob.bytes))
      const record: PortableBlobRecord = {
        cid: blob.cid,
        path,
        size: blob.bytes.byteLength,
        mimeType: blob.mimeType
      }
      const line = encodeNdjsonLine(record)
      blobIndexDigest.addLine(line)
      blobIndexLines.push(line)
      blobCount++
    }
  }
  await sink.writeEntry(
    BUNDLE_ENTRY.blobIndex,
    encodeUtf8(blobIndexLines.join('\n') + (blobIndexLines.length ? '\n' : ''))
  )
  entryDigests.set(BUNDLE_ENTRY.blobIndex, blobIndexDigest.finish())

  // 4. Yjs docs (optional port).
  let yjsCount = 0
  const yjsDigest = createNdjsonDigest()
  const yjsLines: string[] = []
  if (options.yjsPort) {
    for await (const doc of options.yjsPort.list()) {
      const line = encodeNdjsonLine({ nodeId: doc.nodeId, updateB64: bytesToBase64(doc.update) })
      yjsDigest.addLine(line)
      yjsLines.push(line)
      yjsCount++
    }
  }
  await sink.writeEntry(
    BUNDLE_ENTRY.yjsDocs,
    encodeUtf8(yjsLines.join('\n') + (yjsLines.length ? '\n' : ''))
  )
  entryDigests.set(BUNDLE_ENTRY.yjsDocs, yjsDigest.finish())

  // 5. Manifest.
  const manifest: XnetpackManifest = {
    formatVersion: XNETPACK_FORMAT_VERSION,
    protocolVersion: { change: CURRENT_PROTOCOL_VERSION },
    ownerDid: options.ownerDid,
    scope,
    createdAt: Date.now(),
    frontier: frontierOf(changes),
    prerequisites: options.since,
    counts: {
      changes: changes.length,
      blobs: blobCount,
      yjsDocs: yjsCount,
      commits: commitCount
    },
    contentDigest: combineEntryDigests(entryDigests)
  }
  if (options.manifestSigner) {
    const signature = await options.manifestSigner(canonicalManifestBytes(manifest))
    manifest.signatureB64 = bytesToBase64(signature)
  }
  await sink.writeEntry(BUNDLE_ENTRY.manifest, encodeUtf8(JSON.stringify(manifest, null, 2)))
  return manifest
}
