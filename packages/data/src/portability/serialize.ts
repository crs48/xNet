/**
 * Bundle serialization helpers: change ↔ NDJSON line, canonical manifest
 * bytes, and the chunked entry digest (exploration 0344).
 */

import type { ContentId, DID } from '@xnetjs/core'
import { bytesToBase64, base64ToBytes, hash, hashHex } from '@xnetjs/crypto'
import type { NodeChange, NodePayload } from '../store/types'
import type { PortableChangeRecord, XnetpackManifest } from './types'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** Serialize a signed change to its bundle-line form. */
export function toPortableChangeRecord(change: NodeChange): PortableChangeRecord {
  const record: PortableChangeRecord = {
    id: change.id,
    type: change.type,
    hash: change.hash,
    nodeId: change.payload.nodeId,
    schemaId: change.payload.schemaId,
    lamportTime: change.lamport,
    authorDid: change.authorDID,
    wallTime: change.wallTime,
    parentHash: change.parentHash,
    payload: change.payload,
    signatureB64: bytesToBase64(change.signature),
    // protocolVersion is part of the hashed fields — dropping it makes the
    // record fail verifyChangeHash on the importing side.
    protocolVersion: change.protocolVersion,
    batchId: change.batchId,
    batchIndex: change.batchIndex,
    batchSize: change.batchSize
  }
  return record
}

/** Rehydrate a bundle line into a signed change. */
export function fromPortableChangeRecord(record: PortableChangeRecord): NodeChange {
  // schemaId travels both in the payload and (redundantly) at the top level;
  // fall back so a first change still materializes (exploration 0206).
  const payload =
    record.payload && !record.payload.schemaId && record.schemaId
      ? { ...record.payload, schemaId: record.schemaId as NodePayload['schemaId'] }
      : record.payload
  return {
    id: record.id,
    type: record.type,
    hash: record.hash as ContentId,
    parentHash: record.parentHash as ContentId | null,
    authorDID: record.authorDid as DID,
    signature: base64ToBytes(record.signatureB64),
    wallTime: record.wallTime,
    lamport: record.lamportTime,
    payload,
    protocolVersion: record.protocolVersion,
    batchId: record.batchId,
    batchIndex: record.batchIndex,
    batchSize: record.batchSize
  }
}

/** Recursively sort object keys — canonical JSON for signing/digesting. */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(sortObjectKeys)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key])
  }
  return sorted
}

/**
 * The bytes the manifest signature covers: canonical JSON of the manifest
 * with `signatureB64` removed.
 */
export function canonicalManifestBytes(manifest: XnetpackManifest): Uint8Array {
  const unsigned: Partial<XnetpackManifest> = { ...manifest }
  delete unsigned.signatureB64
  return textEncoder.encode(JSON.stringify(sortObjectKeys(unsigned)))
}

/**
 * Streaming digest for an NDJSON entry: blake3 over the concatenation of
 * each line's blake3 digest. Chunk boundary = line, so producer and
 * verifier digest identically without buffering the whole entry.
 */
export function createNdjsonDigest(): {
  addLine(line: string): void
  finish(): string
  lineCount(): number
} {
  const lineDigests: Uint8Array[] = []
  return {
    addLine(line: string) {
      lineDigests.push(hash(textEncoder.encode(line)))
    },
    finish() {
      const concat = new Uint8Array(lineDigests.length * 32)
      lineDigests.forEach((d, i) => concat.set(d, i * 32))
      return hashHex(concat)
    },
    lineCount() {
      return lineDigests.length
    }
  }
}

/** Single-shot digest for a non-NDJSON entry (blobs). */
export function digestEntryBytes(bytes: Uint8Array): string {
  return hashHex(bytes)
}

/**
 * The manifest's `contentDigest`: blake3 over `<path>\n<digest>\n` lines
 * sorted by path, one per non-manifest entry.
 */
export function combineEntryDigests(entries: ReadonlyMap<string, string>): string {
  const lines = [...entries.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, digest]) => `${path}\n${digest}\n`)
  return hashHex(textEncoder.encode(lines.join('')))
}

export function encodeNdjsonLine(value: unknown): string {
  return JSON.stringify(value)
}

export function decodeUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes)
}

export function encodeUtf8(text: string): Uint8Array {
  return textEncoder.encode(text)
}
