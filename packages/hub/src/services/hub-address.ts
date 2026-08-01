/**
 * @xnetjs/hub - Hub address records (exploration 0423).
 *
 * A hub's substrate URL is an implementation detail of whoever is hosting it
 * today — a Cloud Run service uri, a Fargate task, a LAN address. Handing that
 * URL to a client as durable configuration couples every device to the
 * substrate, so a region move or a substrate swap silently misconfigures all of
 * them, and the `Provisioner` abstraction that exists to keep xNet off any one
 * vendor is defeated at the last inch.
 *
 * The fix is the piece a sharded database gets from its router — one stable
 * name — taken as **resolution only, never proxying**:
 *
 * - a resolver is consulted once per session, is cacheable, is mirrorable, and
 *   can be down without taking anyone offline (the client keeps its last-known
 *   address);
 * - a proxy is in the path of every byte and can be none of those things, which
 *   is why `docs/CHARTER.md` §6 refuses it as a "global chokepoint tier".
 *
 * The record is signed by the hub's system identity (the DID served on
 * `/health`), so a resolver that mirrors it cannot rewrite where a client
 * connects. Everything here is pure and dependency-injected; the transport and
 * the cache live at the call sites.
 */

import { base64ToBytes, bytesToBase64, sign, verify } from '@xnetjs/crypto'
import { parseDID } from '@xnetjs/identity'

/**
 * `ready` — `url` is live and dialable.
 * `waking` — the hub is cold (its DB lives only in object storage) and is being
 * restored. This is the state a client could not previously observe at all: a
 * cold tenant's URL is emptied by the control plane, so the client got a
 * connection failure indistinguishable from an outage. `retryAfterMs` says how
 * long to wait instead of reporting the hub as down.
 */
export type HubAddressStatus = 'ready' | 'waking'

export interface HubAddressRecord {
  /** The stable name being resolved — the owner's `did:key`. */
  did: string
  /** The hub system identity that signed this record (matches `/health`). */
  hubDid: string
  /** Current substrate URL. Opaque, may change on migration. Empty when waking. */
  url: string
  /** Ordered alternates to try before declaring the hub unreachable. */
  fallbacks?: readonly string[]
  status: HubAddressStatus
  /** Hint for how long to wait before re-resolving a `waking` hub. */
  retryAfterMs?: number
  /** Issue time (ms since epoch). */
  issuedAt: number
  /** Absolute ms after which a client must re-resolve. */
  validUntil: number
  /** Base64 Ed25519 signature by `hubDid` over the canonical bytes. */
  proof: string
}

/** A record before it has been signed. */
export type UnsignedHubAddressRecord = Omit<HubAddressRecord, 'proof'>

export type ResolveOutcome =
  | { kind: 'resolved'; record: HubAddressRecord; source: 'network' | 'cache' }
  /**
   * No usable address — resolver unreachable AND no cache, or every candidate
   * failed verification. Deliberately distinct from a resolved record with an
   * empty URL: "we could not find out" and "you have no hub" are different
   * facts, and collapsing them would drop a client into local-only mode while
   * its data sits on a healthy server.
   */
  | { kind: 'unresolvable'; reason: string }

const encoder = new TextEncoder()

/**
 * Canonical bytes a signature covers. The field order is written out rather
 * than derived from `Object.keys`, because key order is an accident of
 * construction and a signature that depends on it would verify on the machine
 * that made it and fail everywhere else.
 */
export function canonicalHubAddressBytes(record: UnsignedHubAddressRecord): Uint8Array {
  return encoder.encode(
    JSON.stringify([
      'xnet-hub-address-v1',
      record.did,
      record.hubDid,
      record.url,
      [...(record.fallbacks ?? [])],
      record.status,
      record.retryAfterMs ?? null,
      record.issuedAt,
      record.validUntil
    ])
  )
}

/** Sign a record with the hub's system private key. */
export function signHubAddress(
  record: UnsignedHubAddressRecord,
  hubPrivateKey: Uint8Array
): HubAddressRecord {
  return { ...record, proof: bytesToBase64(sign(canonicalHubAddressBytes(record), hubPrivateKey)) }
}

/**
 * Verify a record against the `hubDid` it names. Returns false — never throws —
 * on a malformed DID or signature, so a hostile resolver cannot crash a client
 * by returning garbage.
 */
export function verifyHubAddress(record: HubAddressRecord): boolean {
  try {
    const { proof, ...unsigned } = record
    return verify(canonicalHubAddressBytes(unsigned), base64ToBytes(proof), parseDID(record.hubDid))
  } catch {
    return false
  }
}

/**
 * Is this record still usable as a *fresh* answer? Expiry is not fatal — an
 * expired record is still the best guess a client has when the resolver is
 * unreachable — so this only decides whether to skip the network round trip.
 */
export function isHubAddressFresh(record: HubAddressRecord, nowMs: number): boolean {
  return record.validUntil > nowMs
}

/** Every URL worth dialling, in order, for a resolved record. */
export function dialCandidates(record: HubAddressRecord): string[] {
  return [record.url, ...(record.fallbacks ?? [])].filter((url) => url.length > 0)
}

/**
 * What a *resolver* returns. Two layers, deliberately separated:
 *
 * - `record` is hub-signed and is the only thing that decides **where** to
 *   connect. A mirror cannot author or alter it.
 * - `liveness` is the mirror's own unsigned observation, and decides only
 *   **whether to wait** — a UX call, not a security one. A lying mirror can
 *   make a client pause; it cannot redirect one.
 *
 * The split exists because a control plane genuinely cannot sign as a hub, and
 * the alternative — letting the resolver mint records — would hand every mirror
 * a redirect primitive.
 */
export interface HubLiveness {
  status: HubAddressStatus | 'unknown'
  /** How long to wait before re-resolving a `waking` hub. */
  retryAfterMs?: number
}

export interface HubAddressResolution {
  record: HubAddressRecord | null
  liveness: HubLiveness
}

export interface HubAddressCache {
  get(did: string): HubAddressRecord | null
  put(record: HubAddressRecord): void
}

export interface ResolveHubAddressDeps {
  /** Fetch the current record. Returns null when the resolver has no such name. */
  fetchRecord(did: string): Promise<HubAddressRecord | null>
  cache: HubAddressCache
  nowMs(): number
  /** Override for tests; defaults to real signature verification. */
  verifyRecord?(record: HubAddressRecord): boolean
}

/**
 * Resolve a name to a hub address: cache-first while fresh, then network, then
 * **stale cache** rather than failure.
 *
 * That last fallback is the whole reason this is a resolver and not a gateway.
 * An address that worked yesterday is far more useful than none, and a wrong
 * one costs exactly one failed dial — so a resolver outage degrades to "connect
 * where you connected last time" instead of to "you are offline".
 *
 * A record whose signature does not verify against the `hubDid` it names is
 * discarded, not used: a mirror that could rewrite `url` would be a redirect
 * primitive for anyone who compromised it.
 */
export async function resolveHubAddress(
  did: string,
  deps: ResolveHubAddressDeps
): Promise<ResolveOutcome> {
  const verifyRecord = deps.verifyRecord ?? verifyHubAddress
  const cached = deps.cache.get(did)
  if (cached && isHubAddressFresh(cached, deps.nowMs())) {
    return { kind: 'resolved', record: cached, source: 'cache' }
  }

  let fetchFailed: string | null = null
  try {
    const fresh = await deps.fetchRecord(did)
    if (fresh) {
      if (!verifyRecord(fresh)) {
        fetchFailed = `address record for ${did} failed signature verification`
      } else if (fresh.did !== did) {
        // A resolver answering for a different name is either broken or
        // attempting a substitution; either way it is not an answer to this
        // question.
        fetchFailed = `address record names ${fresh.did}, expected ${did}`
      } else {
        deps.cache.put(fresh)
        return { kind: 'resolved', record: fresh, source: 'network' }
      }
    } else {
      fetchFailed = `resolver has no address record for ${did}`
    }
  } catch (err) {
    fetchFailed = `resolver unreachable: ${err instanceof Error ? err.message : String(err)}`
  }

  if (cached) return { kind: 'resolved', record: cached, source: 'cache' }
  return { kind: 'unresolvable', reason: fetchFailed ?? `no address record for ${did}` }
}
