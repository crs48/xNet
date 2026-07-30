/**
 * Browser-side `.xnetpack` bundle export/import (exploration 0344).
 *
 * The real backup: the signed change log from the OPFS SQLite master (NOT
 * the IndexedDB sidecars) plus per-node Yjs doc states, zipped into one
 * `.xnetpack` file. Import verifies (signatures, hash chain, owner DID)
 * and replays through the store's remote-change path — the same pipeline a
 * sync peer goes through.
 */
import type { NodeStore } from '@xnetjs/data'
import {
  applyBundle,
  createStoreYjsPort,
  MemoryBundleSink,
  MemoryBundleSource,
  verifyBundle,
  writeBundle,
  type BundleApplyReport,
  type BundleVerifyReport,
  type XnetpackManifest
} from '@xnetjs/data'
import { strToU8, unzipSync, zipSync } from 'fflate'

export type XnetpackExport = {
  bytes: Uint8Array
  manifest: XnetpackManifest
  filename: string
}

/** Export the full workspace as a zipped `.xnetpack`, signed when a key is given. */
export async function exportXnetpack(
  store: NodeStore,
  ownerDid: string,
  signBytes?: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
): Promise<XnetpackExport> {
  const sink = new MemoryBundleSink()
  const manifest = await writeBundle(store, { kind: 'full' }, sink, {
    ownerDid,
    manifestSigner: signBytes,
    yjsPort: createStoreYjsPort(store)
  })
  const zipInput: Record<string, Uint8Array> = {}
  for (const [path, data] of sink.entries) zipInput[path] = data
  const bytes = zipSync(zipInput, { level: 6 })
  const day = new Date().toISOString().slice(0, 10)
  return { bytes, manifest, filename: `xnet-${day}.xnetpack` }
}

/** Text entries of a full export (for embedding in the JSON leave bundle). */
export async function exportXnetpackEntries(
  store: NodeStore,
  ownerDid: string,
  signBytes?: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>
): Promise<Record<string, string>> {
  const sink = new MemoryBundleSink()
  await writeBundle(store, { kind: 'full' }, sink, {
    ownerDid,
    manifestSigner: signBytes,
    yjsPort: createStoreYjsPort(store)
  })
  const decoder = new TextDecoder()
  const files: Record<string, string> = {}
  for (const [path, data] of sink.entries) {
    files[path] = decoder.decode(data)
  }
  return files
}

export function downloadBytes(
  filename: string,
  bytes: Uint8Array,
  mimeType = 'application/zip'
): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Open a `.xnetpack` file (zip) as a bundle source. */
export function sourceFromXnetpackFile(zipBytes: Uint8Array): MemoryBundleSource {
  const entries = unzipSync(zipBytes)
  const map = new Map<string, Uint8Array>()
  for (const [path, data] of Object.entries(entries)) {
    if (!path.endsWith('/')) map.set(path, data)
  }
  return new MemoryBundleSource(map)
}

/** Dry-run: verify a `.xnetpack` file without writing anything. */
export async function verifyXnetpackFile(zipBytes: Uint8Array): Promise<BundleVerifyReport> {
  return verifyBundle(sourceFromXnetpackFile(zipBytes))
}

/** Import a verified `.xnetpack` file into the live store. */
export async function importXnetpackFile(
  store: NodeStore,
  zipBytes: Uint8Array,
  options: { importerDid: string; allowForeignOwner?: boolean; allowUnsigned?: boolean }
): Promise<BundleApplyReport> {
  return applyBundle(store, sourceFromXnetpackFile(zipBytes), {
    ...options,
    yjsPort: createStoreYjsPort(store)
  })
}

/** Test helper: make a deterministic zip entry from text. */
export const textEntry = strToU8
