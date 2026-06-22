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
  /**
   * Reset to an empty index. Used to guarantee the "false ⇒ cold" contract: a
   * non-atomic `restore()` (e.g. `SemanticSearch` sets its index then its
   * documents) can leave a half-populated index when the blob is partial, which
   * the caller would then pollute by backfilling on top. Clearing on failure
   * yields a true clean slate. Optional for back-compat.
   */
  clear?(): void
}

/** Default storage key for the brain's vector tier. */
export const VECTOR_TIER_BLOB_KEY = 'xnet:brain:vector-tier'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

/**
 * Realm-robust `Uint8Array` check. A plain `instanceof` is unreliable across
 * module/realm boundaries (e.g. a `Uint8Array` produced inside a dynamically
 * imported `@xnetjs/vectors` vs the host realm), which silently mangles the
 * persisted bytes; the `Symbol.toStringTag` brand holds across realms.
 */
function isUint8Array(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === '[object Uint8Array]'
}

/** Make the serialized form JSON-safe (any `Uint8Array` → tagged number array). */
function toJsonSafe(value: unknown): unknown {
  if (isUint8Array(value)) {
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
    // Corrupt/incompatible/partial snapshot — `restore()` may be non-atomic and
    // leave a half-populated index, so clear it to honor the "false ⇒ cold"
    // contract; the caller then backfills onto a true clean slate.
    index.clear?.()
    return false
  }
}
