/**
 * Resumable upload manifest for recording tracks (exploration 0414, phase 5).
 *
 * > [!CAUTION]
 * > Exploration 0385 found blobs over 1 MB silently unsynced. A screencast is
 * > that failure at 300× the size, and the hub's `getMaxFileSize()` rejects a
 * > whole-file `PUT` outright. A recording that *appears* synced but is not is
 * > precisely the "unreadable presented as absent" bug the root AGENTS.md
 * > bans, so this module is built around one rule: **an upload is complete
 * > only when every chunk is accounted for, and any other state is a typed
 * > failure the caller must handle.**
 *
 * The manifest is a pure, serializable plan: split the track into chunks,
 * record each chunk's digest, and derive what remains from what the server
 * says it already holds. Resume is therefore level-triggered — recomputed from
 * stored state on every attempt rather than remembered by an in-flight loop —
 * which is the same restart-safety posture `packages/AGENTS.md` mandates in
 * place of a workflow engine.
 */

/** Matches `CHUNK_SIZE` in `@xnetjs/storage`; kept local so this stays pure. */
export const UPLOAD_CHUNK_SIZE = 256 * 1024

export interface ChunkPlan {
  index: number
  /** Byte offset into the track. */
  offset: number
  /** Byte length of this chunk — the final chunk is usually short. */
  length: number
  /** Content digest of this chunk, for per-chunk verification. */
  digest: string
}

export interface UploadManifest {
  /** Content id of the whole track. */
  cid: string
  /** Total byte length. */
  size: number
  chunkSize: number
  chunks: ChunkPlan[]
}

export type DigestFn = (offset: number, length: number) => string

/**
 * Plan an upload. `digest` is injected so this module never touches bytes or
 * crypto — callers pass a hasher over their own buffer or file handle.
 */
export function planUpload(
  cid: string,
  size: number,
  digest: DigestFn,
  chunkSize: number = UPLOAD_CHUNK_SIZE
): UploadManifest {
  if (size < 0) throw new RangeError(`invalid track size: ${size}`)
  if (chunkSize <= 0) throw new RangeError(`invalid chunk size: ${chunkSize}`)

  const chunks: ChunkPlan[] = []
  for (let offset = 0; offset < size; offset += chunkSize) {
    const length = Math.min(chunkSize, size - offset)
    chunks.push({ index: chunks.length, offset, length, digest: digest(offset, length) })
  }
  return { cid, size, chunkSize, chunks }
}

export type UploadFailureReason =
  /** The server holds a chunk whose digest disagrees with ours. */
  | 'digest-mismatch'
  /** The server reports a chunk index this manifest does not contain. */
  | 'unknown-chunk'

export type UploadProgress =
  | { status: 'complete'; uploadedBytes: number }
  | { status: 'incomplete'; remaining: ChunkPlan[]; uploadedBytes: number }
  | { status: 'failed'; reason: UploadFailureReason; detail: string }

/**
 * What still needs uploading, given what the server says it holds.
 *
 * A digest disagreement is **not** treated as "re-upload and hope" — it means
 * one side's bytes are wrong, and silently overwriting would hide corruption.
 * The caller gets a typed failure and decides.
 */
export function resumeUpload(
  manifest: UploadManifest,
  serverChunks: ReadonlyArray<{ index: number; digest: string }>
): UploadProgress {
  const byIndex = new Map(manifest.chunks.map((chunk) => [chunk.index, chunk]))
  let uploadedBytes = 0
  const held = new Set<number>()

  for (const chunk of serverChunks) {
    const planned = byIndex.get(chunk.index)
    if (!planned) {
      return {
        status: 'failed',
        reason: 'unknown-chunk',
        detail: `server reports chunk ${chunk.index}, which is not in this manifest`
      }
    }
    if (planned.digest !== chunk.digest) {
      return {
        status: 'failed',
        reason: 'digest-mismatch',
        detail: `chunk ${chunk.index} digest ${chunk.digest} does not match ${planned.digest}`
      }
    }
    if (held.has(chunk.index)) continue
    held.add(chunk.index)
    uploadedBytes += planned.length
  }

  const remaining = manifest.chunks.filter((chunk) => !held.has(chunk.index))
  return remaining.length === 0
    ? { status: 'complete', uploadedBytes }
    : { status: 'incomplete', remaining, uploadedBytes }
}

/** Fraction uploaded, 0–1. A zero-byte track is complete, not divided by zero. */
export function uploadFraction(manifest: UploadManifest, progress: UploadProgress): number {
  if (progress.status === 'failed') return 0
  if (manifest.size === 0) return 1
  return Math.min(1, progress.uploadedBytes / manifest.size)
}
