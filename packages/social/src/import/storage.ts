/**
 * Large archive storage planning.
 */

import type { ArchiveManifest } from './types'

export type ArchiveBlobStorageMode = 'single-archive-blob' | 'entry-level-blobs' | 'manifest-only'

export type LargeArchiveStoragePolicy = {
  maxSingleBlobBytes: number
  storeMediaEntries: boolean
  storeLargeJsonEntries: boolean
}

export type LargeArchiveStoragePlan = {
  mode: ArchiveBlobStorageMode
  archiveByteSize: number
  entryBlobPaths: string[]
  skippedBlobPaths: string[]
  warnings: string[]
}

const DEFAULT_POLICY: LargeArchiveStoragePolicy = {
  maxSingleBlobBytes: 100 * 1024 * 1024,
  storeMediaEntries: true,
  storeLargeJsonEntries: true
}

export function createLargeArchiveStoragePlan(
  manifest: ArchiveManifest,
  policy: Partial<LargeArchiveStoragePolicy> = {}
): LargeArchiveStoragePlan {
  const resolvedPolicy = { ...DEFAULT_POLICY, ...policy }
  const tooLargeForSingleBlob = manifest.byteSize > resolvedPolicy.maxSingleBlobBytes
  const entryBlobPaths = tooLargeForSingleBlob
    ? manifest.entries
        .filter((entry) => shouldStoreEntryBlob(entry.path, resolvedPolicy))
        .map((entry) => entry.path)
    : []

  return {
    mode: tooLargeForSingleBlob ? 'entry-level-blobs' : 'single-archive-blob',
    archiveByteSize: manifest.byteSize,
    entryBlobPaths,
    skippedBlobPaths: tooLargeForSingleBlob
      ? manifest.entries
          .filter((entry) => !entryBlobPaths.includes(entry.path))
          .map((entry) => entry.path)
      : [],
    warnings: tooLargeForSingleBlob
      ? [
          `Archive is ${manifest.byteSize} bytes; store selected entries instead of one blob above ${resolvedPolicy.maxSingleBlobBytes} bytes.`
        ]
      : []
  }
}

function shouldStoreEntryBlob(path: string, policy: LargeArchiveStoragePolicy): boolean {
  if (policy.storeLargeJsonEntries && /\.json$/i.test(path)) return true
  if (
    policy.storeMediaEntries &&
    /\.(png|jpe?g|webp|gif|mp4|mov|m4a|mp3|srt|wav|heic|avif)$/i.test(path)
  ) {
    return true
  }
  return false
}
