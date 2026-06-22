/**
 * Vector-tier persistence (exploration 0211, Phase 1 deferred item) — save and
 * restore the semantic index through a blob store (e.g. `@xnetjs/storage`), so it
 * survives reloads like FTS does and tolerates OPFS eviction by rebuilding lazily
 * from the graph when absent.
 *
 * Structural over a `BlobStore` and a `SerializableIndex` (which `@xnetjs/vectors`
 * `SemanticSearch` satisfies), so the brain stays decoupled from the storage layer.
 */

/** A key/value blob store — `@xnetjs/storage`'s adapter satisfies this. */
export interface BlobStore {
  getBlob(key: string): Promise<Uint8Array | null>
  setBlob(key: string, data: Uint8Array): Promise<void>
}

/** A serializable index — `@xnetjs/vectors` `SemanticSearch` satisfies this. */
export interface SerializableIndex<S = unknown> {
  serialize(): S
  restore(data: S): void
}

/** Default storage key for the brain's vector tier. */
export const VECTOR_TIER_BLOB_KEY = 'xnet:brain:vector-tier'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/** Make the serialized form JSON-safe (any `Uint8Array` → tagged number array). */
function toJsonSafe(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __u8: Array.from(value) }
  }
  if (Array.isArray(value)) {
    return value.map(toJsonSafe)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v)
    return out
  }
  return value
}

/** Reverse `toJsonSafe`, rehydrating tagged `Uint8Array`s. */
function fromJsonSafe(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const tagged = (value as { __u8?: unknown }).__u8
    if (Array.isArray(tagged)) return new Uint8Array(tagged as number[])
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = fromJsonSafe(v)
    return out
  }
  if (Array.isArray(value)) return value.map(fromJsonSafe)
  return value
}

/** Persist the index's serialized state under `key`. */
export async function saveVectorTier(
  index: SerializableIndex,
  store: BlobStore,
  key: string = VECTOR_TIER_BLOB_KEY
): Promise<void> {
  const json = JSON.stringify(toJsonSafe(index.serialize()))
  await store.setBlob(key, textEncoder.encode(json))
}

/**
 * Restore the index from `key`. Returns `true` if a snapshot was found and
 * applied, `false` if the tier is cold (the caller should backfill via
 * `BrainIndexer.reindexAll`).
 */
export async function loadVectorTier(
  index: SerializableIndex,
  store: BlobStore,
  key: string = VECTOR_TIER_BLOB_KEY
): Promise<boolean> {
  const bytes = await store.getBlob(key)
  if (!bytes || bytes.length === 0) return false
  try {
    const parsed = JSON.parse(textDecoder.decode(bytes))
    index.restore(fromJsonSafe(parsed) as never)
    return true
  } catch {
    // Corrupt/incompatible snapshot — treat as cold so the caller rebuilds.
    return false
  }
}
