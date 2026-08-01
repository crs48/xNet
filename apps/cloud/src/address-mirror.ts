/**
 * xNet Cloud — hub address mirror (exploration 0423).
 *
 * A client cannot ask a hub where it is when the hub is cold, moving, or not
 * yet dialable — which is exactly when it most needs to know. The control plane
 * already holds that truth (`TenantRecord.hubUrl`), so it mirrors each hub's
 * **own signed** address record and serves it from a stable endpoint.
 *
 * The mirror is deliberately not an authority:
 *
 * - it re-serves the hub's signature verbatim, so it cannot change where a
 *   client connects even if it is compromised;
 * - it adds an unsigned liveness hint, which only decides whether a client
 *   waits or reports the hub down.
 *
 * This is the resolution half of "one connection string" without the proxy
 * half. Nothing here sits in the data path — the client dials the hub directly
 * with what it learns, and a mirror outage degrades to the client's cached
 * address rather than to an outage (`docs/CHARTER.md` §6, BATNA + Vanish).
 */

import type { TenantRecord } from './registry'
import { extractEd25519PubKey, hybridVerify, type DID } from '@xnetjs/crypto'

export const HUB_ADDRESS_PATH = '/.well-known/xnet-hub-address'

export type HubAddressStatus = 'ready' | 'waking'

/**
 * Local mirror of `@xnetjs/hub`'s `HubAddressRecord`, so the control plane never
 * takes a dependency on the hub package (the same reason the hub keeps its own
 * copy of `isReplicaFresh` rather than depending on `@xnetjs/cloud`).
 *
 * `CANONICAL_PREFIX` and the field order below MUST match
 * `packages/hub/src/services/hub-address.ts`. Both sides pin the same canonical
 * byte fixture in their tests, so a change to either serializer fails the other
 * package's suite rather than silently rejecting every record in production.
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

export interface HubAddressResolution {
  record: HubAddressRecord | null
  liveness: HubLiveness
}

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

/**
 * Verify a record against the `hubDid` it names. Returns false — never throws —
 * so a malformed record from a misbehaving hub is a clean rejection.
 */
export function verifyHubAddress(record: HubAddressRecord): boolean {
  try {
    const publicKey = extractEd25519PubKey(record.hubDid as DID)
    if (!publicKey) return false
    const signature = new Uint8Array(Buffer.from(record.proof, 'base64'))
    if (signature.length !== 64) return false
    const { proof: _proof, ...unsigned } = record
    return hybridVerify(canonicalHubAddressBytes(unsigned), { level: 0, ed25519: signature }, {
      ed25519: publicKey
    }).valid
  } catch {
    return false
  }
}

/** Last-known signed record per tenant. Losing it costs a refetch, not data. */
export interface AddressMirrorStore {
  get(tenantId: string): Promise<HubAddressRecord | null>
  put(tenantId: string, record: HubAddressRecord): Promise<void>
}

export class MemoryAddressMirrorStore implements AddressMirrorStore {
  private readonly records = new Map<string, HubAddressRecord>()
  async get(tenantId: string): Promise<HubAddressRecord | null> {
    return this.records.get(tenantId) ?? null
  }
  async put(tenantId: string, record: HubAddressRecord): Promise<void> {
    this.records.set(tenantId, record)
  }
}

export interface AddressMirrorDeps {
  store: AddressMirrorStore
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  /** How long a cold tenant should wait before re-resolving. */
  wakingRetryMs?: number
  verifyRecord?(record: HubAddressRecord): boolean
}

const DEFAULT_WAKING_RETRY_MS = 5_000

/**
 * Pull a hub's current record and mirror it.
 *
 * An unverifiable record is dropped rather than stored: mirroring a forgery
 * would launder it behind our hostname, which is strictly worse than having no
 * mirror at all. Returns the record on success, null on any failure — callers
 * fall back to whatever was already mirrored.
 */
export async function refreshMirroredAddress(
  tenant: TenantRecord,
  deps: AddressMirrorDeps
): Promise<HubAddressRecord | null> {
  if (tenant.dataTier !== 'hot' || !tenant.hubUrl) return null
  const fetchImpl = deps.fetchImpl ?? fetch
  const verifyRecord = deps.verifyRecord ?? verifyHubAddress
  try {
    const res = await fetchImpl(`${tenant.hubUrl.replace(/\/+$/, '')}${HUB_ADDRESS_PATH}`)
    if (!res.ok) return null
    const record = (await res.json()) as HubAddressRecord
    if (!verifyRecord(record)) return null
    await deps.store.put(tenant.tenantId, record)
    return record
  } catch {
    return null
  }
}

/**
 * Answer "where is this tenant's hub" for a client.
 *
 * A cold tenant is the case this exists for. Its `hubUrl` is emptied by the
 * reconcile loop, so today a client holding the old URL gets a connection
 * failure indistinguishable from an outage. Here it gets `waking` plus a retry
 * hint — and still gets the last signed record, so it knows what to dial once
 * the hub is back.
 */
export async function resolveTenantAddress(
  tenant: TenantRecord | null,
  deps: AddressMirrorDeps
): Promise<HubAddressResolution | null> {
  if (!tenant) return null
  const mirrored = await deps.store.get(tenant.tenantId)

  if (tenant.dataTier !== 'hot' || !tenant.hubUrl) {
    return {
      record: mirrored,
      liveness: { status: 'waking', retryAfterMs: deps.wakingRetryMs ?? DEFAULT_WAKING_RETRY_MS }
    }
  }

  const fresh = (await refreshMirroredAddress(tenant, deps)) ?? mirrored
  return {
    // A hot tenant we have never successfully mirrored reads as `unknown`, not
    // as `ready` — "we could not check" and "it is up" are different facts.
    record: fresh,
    liveness: { status: fresh ? 'ready' : 'unknown' }
  }
}
