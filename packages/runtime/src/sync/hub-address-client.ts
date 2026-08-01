/**
 * Client-side hub address resolution (exploration 0423).
 *
 * A client configured with a substrate URL is configured with an
 * implementation detail of today's host: move the hub between regions or
 * substrates and every device is silently misconfigured. Instead the client
 * holds a stable name and resolves it to an address it dials **directly**.
 *
 * The resolver is never in the data path — that is the whole design. It is
 * consulted at most once per session, its answer is cached in local storage,
 * and when it is unreachable the client falls back to the last address that
 * worked. A resolver outage therefore degrades to "connect where you connected
 * last time" rather than to "you are offline", which is what lets this exist at
 * all under `docs/CHARTER.md` §6 ("No global chokepoint tier").
 *
 * Records are signed by the hub's own system identity, so a mirror can cache
 * one but cannot author or alter it — otherwise every mirror would be a
 * redirect primitive.
 */

import { extractEd25519PubKey, hybridVerify, type DID } from '@xnetjs/crypto'

export type HubAddressStatus = 'ready' | 'waking'

/**
 * Mirrors `packages/hub/src/services/hub-address.ts`. The client cannot depend
 * on the hub package, so the canonical serializer below is duplicated and both
 * sides pin the same byte fixture in their tests.
 */
export interface HubAddressRecord {
  did: string
  hubDid: string
  url: string
  fallbacks?: readonly string[]
  status: HubAddressStatus
  retryAfterMs?: number
  issuedAt: number
  validUntil: number
  proof: string
}

export interface HubLiveness {
  status: HubAddressStatus | 'unknown'
  retryAfterMs?: number
}

/** What a resolver returns: a hub-signed record plus its own unsigned hint. */
export interface HubAddressResolution {
  record: HubAddressRecord | null
  liveness: HubLiveness
}

export type HubAddressOutcome =
  | { kind: 'ready'; url: string; fallbacks: string[]; record: HubAddressRecord; stale: boolean }
  /** The hub is cold and being restored — wait, do not report it down. */
  | { kind: 'waking'; retryAfterMs: number; record: HubAddressRecord | null }
  /**
   * No usable address. Deliberately distinct from `ready` with an empty URL:
   * "we could not find out" and "you have no hub" are different facts, and
   * collapsing them drops a client into local-only mode while its data sits on
   * a healthy server.
   */
  | { kind: 'unresolvable'; reason: string }

const CANONICAL_PREFIX = 'xnet-hub-address-v1'

/** Canonical signed bytes — must stay identical to the hub's serializer. */
export function canonicalHubAddressBytes(record: Omit<HubAddressRecord, 'proof'>): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify([
      CANONICAL_PREFIX,
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

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Verify a record against the `hubDid` it names. Never throws. */
export function verifyHubAddress(record: HubAddressRecord): boolean {
  try {
    const publicKey = extractEd25519PubKey(record.hubDid as DID)
    if (!publicKey) return false
    const signature = base64ToBytes(record.proof)
    if (signature.length !== 64) return false
    const { proof: _proof, ...unsigned } = record
    return hybridVerify(canonicalHubAddressBytes(unsigned), { level: 0, ed25519: signature }, {
      ed25519: publicKey
    }).valid
  } catch {
    return false
  }
}

/** The last-known address, persisted so a resolver outage is survivable. */
export interface HubAddressStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const cacheKey = (name: string): string => `xnet:hub-address:${name}`

export function readCachedAddress(
  name: string,
  storage: HubAddressStorage
): HubAddressRecord | null {
  try {
    const raw = storage.getItem(cacheKey(name))
    if (!raw) return null
    const record = JSON.parse(raw) as HubAddressRecord
    // A cached record is re-verified on read: local storage is not a trusted
    // channel (any script on the origin can write it).
    return verifyHubAddress(record) && record.did === name ? record : null
  } catch {
    return null
  }
}

export function writeCachedAddress(record: HubAddressRecord, storage: HubAddressStorage): void {
  try {
    storage.setItem(cacheKey(record.did), JSON.stringify(record))
  } catch {
    // A full or unavailable quota costs freshness, never correctness.
  }
}

export interface ResolveHubUrlDeps {
  /** Fetch a resolution for `name`. Throws or returns null when unavailable. */
  fetchResolution(name: string): Promise<HubAddressResolution | null>
  storage: HubAddressStorage
  nowMs?: () => number
  verifyRecord?: (record: HubAddressRecord) => boolean
}

const DEFAULT_WAKING_RETRY_MS = 5_000

const readyOutcome = (record: HubAddressRecord, stale: boolean): HubAddressOutcome => ({
  kind: 'ready',
  url: record.url,
  fallbacks: [...(record.fallbacks ?? [])].filter((url) => url.length > 0),
  record,
  stale
})

/**
 * Resolve a name to a dialable hub URL: fresh cache → network → stale cache.
 *
 * The stale-cache step is the point. An address that worked yesterday is far
 * more useful than none, and a wrong one costs exactly one failed dial.
 */
export async function resolveHubUrl(
  name: string,
  deps: ResolveHubUrlDeps
): Promise<HubAddressOutcome> {
  const now = (deps.nowMs ?? Date.now)()
  const verifyRecord = deps.verifyRecord ?? verifyHubAddress
  const cached = readCachedAddress(name, deps.storage)
  if (cached && cached.validUntil > now && cached.url) return readyOutcome(cached, false)

  let failure: string | null = null
  try {
    const resolution = await deps.fetchResolution(name)
    if (!resolution) {
      failure = `resolver has no address record for ${name}`
    } else {
      const record = resolution.record
      if (record && !verifyRecord(record)) {
        failure = `address record for ${name} failed signature verification`
      } else if (record && record.did !== name) {
        failure = `address record names ${record.did}, expected ${name}`
      } else {
        if (record) writeCachedAddress(record, deps.storage)
        if (resolution.liveness.status === 'waking') {
          return {
            kind: 'waking',
            retryAfterMs: resolution.liveness.retryAfterMs ?? DEFAULT_WAKING_RETRY_MS,
            record
          }
        }
        if (record && record.url) return readyOutcome(record, false)
        failure = `resolver could not determine an address for ${name}`
      }
    }
  } catch (err) {
    failure = `resolver unreachable: ${err instanceof Error ? err.message : String(err)}`
  }

  if (cached && cached.url) return readyOutcome(cached, true)
  return { kind: 'unresolvable', reason: failure ?? `no address record for ${name}` }
}

/** Fetch a resolution over HTTP from a resolver base URL. */
export function httpResolver(
  resolverBaseUrl: string,
  fetchImpl: typeof fetch = fetch
): (name: string) => Promise<HubAddressResolution | null> {
  const base = resolverBaseUrl.replace(/\/+$/, '')
  return async (name: string) => {
    const res = await fetchImpl(`${base}/${encodeURIComponent(name)}`)
    if (!res.ok) return null
    return (await res.json()) as HubAddressResolution
  }
}
