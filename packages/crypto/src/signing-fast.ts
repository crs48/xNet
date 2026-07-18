/**
 * Fast Ed25519 verification seam (exploration 0350 Option B, 0357 Tier 1).
 *
 * The pure-JS `@noble/curves` verifier costs ~1.4 ms/op, which is fine for
 * interactive single writes but dominates every O(history) path: `.xnetpack`
 * import, hub relay under bulk push, NDJSON restore, cold-open integrity
 * checks. WebCrypto's native Ed25519 is ~13x faster (measured: 101 µs vs
 * 1374 µs on M-series/Node 22) and is available in BOTH Node 18.4+ and
 * browsers (Baseline: Chrome 137+, Safari 17+, Firefox 129+), so a single
 * async seam covers the hub and the client with no `node:crypto` import and
 * no bundler special-casing.
 *
 * Semantics are identical to {@link verify}: Ed25519 is deterministic and both
 * implementations accept the same signatures for the keys/messages xNet
 * produces. Signature *malleability* edge cases are pinned by the golden
 * vectors in `signing-fast.test.ts` — if the two ever diverge on a vector,
 * that is a convergence hazard and the native path must be disabled rather
 * than the vector relaxed.
 *
 * NOTE: this is deliberately NOT Ed25519 *batch* verification (one
 * multiscalar multiplication over N signatures). Batch verification checks
 * the cofactored equation and can disagree with single verification on
 * adversarial inputs (see ZIP-215 / "It's 255:19AM"), which would let two
 * replicas legitimately disagree on a change's validity and split
 * convergence. Adopting it requires pinning cofactored validity in the
 * conformance vectors first.
 */
import { verify as nobleVerify } from './signing'

/** One verification unit. */
export interface VerifyRequest {
  message: Uint8Array
  signature: Uint8Array
  publicKey: Uint8Array
}

const ED25519_ALGORITHM = 'Ed25519'

/**
 * Cache imported CryptoKeys by public key. A bulk import is typically
 * single-author, so this turns N key imports into one — importKey is a
 * meaningful fraction of the per-op cost otherwise.
 */
const MAX_CACHED_KEYS = 64
const keyCache = new Map<string, Promise<CryptoKey | null>>()

/** Tri-state so the (async) probe runs at most once per process. */
let nativeSupport: Promise<boolean> | null = null

const subtle = (): SubtleCrypto | null => {
  const webcrypto = globalThis.crypto
  return webcrypto && 'subtle' in webcrypto ? webcrypto.subtle : null
}

const toHex = (bytes: Uint8Array): string => {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/**
 * Probe for WebCrypto Ed25519. Presence of `subtle` is not enough — older
 * Safari/WebViews expose SubtleCrypto without the Ed25519 curve and only fail
 * at importKey time.
 */
export async function hasNativeEd25519(): Promise<boolean> {
  if (nativeSupport === null) {
    nativeSupport = (async () => {
      const api = subtle()
      if (!api) return false
      try {
        // A 32-byte all-zero key is not a valid point; import a known-good
        // generator-derived key instead. Any successful import proves the
        // curve is wired up.
        const probe = new Uint8Array([
          0xd7, 0x5a, 0x98, 0x01, 0x82, 0xb1, 0x0a, 0xb7, 0xd5, 0x4b, 0xfe, 0xd3, 0xc9, 0x64, 0x07,
          0x3a, 0x0e, 0xe1, 0x72, 0xf3, 0xda, 0xa6, 0x23, 0x25, 0xaf, 0x02, 0x1a, 0x68, 0xf7, 0x07,
          0x51, 0x1a
        ])
        await api.importKey('raw', probe, { name: ED25519_ALGORITHM }, false, ['verify'])
        return true
      } catch {
        return false
      }
    })()
  }
  return nativeSupport
}

const importVerifyKey = (publicKey: Uint8Array): Promise<CryptoKey | null> => {
  const cacheKey = toHex(publicKey)
  const cached = keyCache.get(cacheKey)
  if (cached) return cached

  const api = subtle()
  const pending = api
    ? api
        // Copy into a fresh buffer: some runtimes reject views over a larger
        // ArrayBuffer, and callers may hand us a subarray.
        .importKey('raw', Uint8Array.from(publicKey), { name: ED25519_ALGORITHM }, false, [
          'verify'
        ])
        .catch(() => null)
    : Promise.resolve(null)

  if (keyCache.size >= MAX_CACHED_KEYS) {
    const oldest = keyCache.keys().next()
    if (!oldest.done) keyCache.delete(oldest.value)
  }
  keyCache.set(cacheKey, pending)
  return pending
}

/**
 * Verify one signature, using native Ed25519 when the runtime has it and
 * falling back to the pure-JS implementation otherwise.
 *
 * Prefer {@link verifyMany} when verifying more than a handful — it shares
 * the native-support probe and the imported key across the whole set.
 */
export async function verifyFast(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): Promise<boolean> {
  if (!(await hasNativeEd25519())) return nobleVerify(message, signature, publicKey)

  const key = await importVerifyKey(publicKey)
  if (!key) return nobleVerify(message, signature, publicKey)

  const api = subtle()
  if (!api) return nobleVerify(message, signature, publicKey)

  try {
    return await api.verify(
      { name: ED25519_ALGORITHM },
      key,
      Uint8Array.from(signature),
      Uint8Array.from(message)
    )
  } catch {
    // A malformed signature length (or any runtime rejection) is a failed
    // verification, not a reason to fall back — noble would reject it too.
    return false
  }
}

/**
 * Verify many signatures. Results are positional: `result[i]` corresponds to
 * `requests[i]`.
 *
 * This is the bulk seam — one native-support probe, one key import per
 * distinct public key, and (on the fallback path) a plain loop. It does NOT
 * short-circuit on the first failure: callers need to know *which* change
 * failed to report a useful error and to reject only the culprit.
 */
export async function verifyMany(requests: readonly VerifyRequest[]): Promise<boolean[]> {
  if (requests.length === 0) return []

  if (!(await hasNativeEd25519())) {
    return requests.map((request) =>
      nobleVerify(request.message, request.signature, request.publicKey)
    )
  }

  // Warm the key cache once per distinct author before fanning out, so N
  // concurrent verifies against one author share a single importKey.
  const distinctKeys = new Map<string, Uint8Array>()
  for (const request of requests) distinctKeys.set(toHex(request.publicKey), request.publicKey)
  await Promise.all([...distinctKeys.values()].map(importVerifyKey))

  return Promise.all(
    requests.map((request) => verifyFast(request.message, request.signature, request.publicKey))
  )
}

/** Test seam: drop cached keys and the native-support probe. */
export function resetFastVerifyCaches(): void {
  keyCache.clear()
  nativeSupport = null
}
