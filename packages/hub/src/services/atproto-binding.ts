/**
 * ATProto binding verification (explorations 0301/0322/0337).
 *
 * Given a foreign ATProto DID and (optionally) the xNet DID it claims to be
 * bound to, verify the bidirectional binding:
 *
 *   1. resolve the DID document (`plc.directory` for did:plc, well-known for
 *      did:web) — yields the canonical PDS endpoint + declared handle;
 *   2. fetch the `fyi.xnet.identity.binding` record from that canonical PDS —
 *      only the account holder can place records in the repo;
 *   3. verify the record's Ed25519 signature against the *xNet* key it names —
 *      only the xNet identity holder can produce it.
 *
 * Steps 2+3 are the "dual signature": each side vouches for the other.
 * Results are cached with a TTL, and `revoke()` drops an entry immediately
 * (e.g. when a profile clears its link or an operator intervenes).
 */

import {
  ATPROTO_BINDING_COLLECTION,
  ATPROTO_BINDING_RKEY,
  isAtprotoDid,
  verifyAtprotoBinding
} from '@xnetjs/identity'

export interface AtprotoBindingVerifierOptions {
  fetchImpl?: typeof fetch
  /** PLC directory base URL (default: https://plc.directory). */
  plcDirectoryUrl?: string
  /** How long a successful verification is trusted (default: 1 hour). */
  cacheTtlMs?: number
  now?: () => number
}

export interface VerifiedBinding {
  atprotoDid: string
  xnetDid: string
  /** Handle from the DID document's `alsoKnownAs` (without `at://`), if any. */
  handle: string | null
  /** Canonical PDS endpoint from the DID document. */
  pds: string
  /** `at://` URI of the binding record. */
  bindingUri: string
  /** The record's own createdAt, for freshness policies. */
  createdAt: string
  verifiedAt: number
}

export type BindingCheck =
  | { ok: true; binding: VerifiedBinding; cached: boolean }
  | { ok: false; reason: string }

type DidDoc = {
  id?: string
  alsoKnownAs?: string[]
  service?: Array<{ id?: string; type?: string; serviceEndpoint?: unknown }>
}

const DEFAULT_PLC = 'https://plc.directory'
const DEFAULT_TTL_MS = 60 * 60 * 1000

export class AtprotoBindingVerifier {
  private cache = new Map<string, VerifiedBinding>()
  private fetchImpl: typeof fetch
  private plcUrl: string
  private ttlMs: number
  private now: () => number

  constructor(options: AtprotoBindingVerifierOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch
    this.plcUrl = (options.plcDirectoryUrl ?? DEFAULT_PLC).replace(/\/+$/, '')
    this.ttlMs = options.cacheTtlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? Date.now
  }

  /** Drop a cached verification (revocation / re-check). */
  revoke(atprotoDid: string): void {
    this.cache.delete(atprotoDid)
  }

  async verify(atprotoDid: string, expectedXnetDid?: string): Promise<BindingCheck> {
    if (!isAtprotoDid(atprotoDid)) {
      return { ok: false, reason: `Not an ATProto DID: ${atprotoDid}` }
    }

    const cached = this.cache.get(atprotoDid)
    if (cached && this.now() - cached.verifiedAt < this.ttlMs) {
      if (expectedXnetDid && cached.xnetDid !== expectedXnetDid) {
        return { ok: false, reason: 'Binding names a different xNet DID' }
      }
      return { ok: true, binding: cached, cached: true }
    }

    const doc = await this.resolveDidDoc(atprotoDid)
    if (!doc.ok) return doc

    const record = await this.fetchBindingRecord(doc.pds, atprotoDid)
    if (!record.ok) return record

    const verification = verifyAtprotoBinding(record.value)
    if (!verification.valid) {
      return { ok: false, reason: `Binding record invalid: ${verification.reason}` }
    }
    const value = record.value as {
      xnetDid: string
      atprotoDid: string
      createdAt: string
    }
    if (value.atprotoDid !== atprotoDid) {
      return { ok: false, reason: 'Binding record names a different ATProto DID' }
    }
    if (expectedXnetDid && value.xnetDid !== expectedXnetDid) {
      return { ok: false, reason: 'Binding names a different xNet DID' }
    }

    const binding: VerifiedBinding = {
      atprotoDid,
      xnetDid: value.xnetDid,
      handle: doc.handle,
      pds: doc.pds,
      bindingUri: record.uri,
      createdAt: value.createdAt,
      verifiedAt: this.now()
    }
    this.cache.set(atprotoDid, binding)
    return { ok: true, binding, cached: false }
  }

  /**
   * Resolve the authorization server issuer for a PDS (0322: the escrow
   * release must check the OAuth ceremony happened at the DID's *canonical*
   * AS, not wherever a lying client claims).
   */
  async resolveAuthorizationServer(pds: string): Promise<string | null> {
    try {
      const res = await this.fetchImpl(
        `${pds.replace(/\/+$/, '')}/.well-known/oauth-protected-resource`
      )
      if (!res.ok) return null
      const body = (await res.json()) as { authorization_servers?: unknown }
      const servers = body.authorization_servers
      if (Array.isArray(servers) && typeof servers[0] === 'string') return servers[0]
      return null
    } catch {
      return null
    }
  }

  private async resolveDidDoc(
    atprotoDid: string
  ): Promise<{ ok: true; pds: string; handle: string | null } | { ok: false; reason: string }> {
    const url = atprotoDid.startsWith('did:plc:')
      ? `${this.plcUrl}/${atprotoDid}`
      : `https://${decodeURIComponent(atprotoDid.slice('did:web:'.length).split(':')[0])}/.well-known/did.json`
    let doc: DidDoc
    try {
      const res = await this.fetchImpl(url)
      if (!res.ok) {
        return { ok: false, reason: `DID document fetch failed (${res.status})` }
      }
      doc = (await res.json()) as DidDoc
    } catch (err) {
      return {
        ok: false,
        reason: `DID document fetch failed: ${err instanceof Error ? err.message : err}`
      }
    }
    if (doc.id !== atprotoDid) {
      return { ok: false, reason: 'DID document id does not match the requested DID' }
    }
    const service = doc.service?.find(
      (s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds'
    )
    const pds = typeof service?.serviceEndpoint === 'string' ? service.serviceEndpoint : null
    if (!pds || !/^https:\/\//.test(pds)) {
      return { ok: false, reason: 'DID document has no https PDS service endpoint' }
    }
    const aka = doc.alsoKnownAs?.find((entry) => entry.startsWith('at://'))
    return {
      ok: true,
      pds: pds.replace(/\/+$/, ''),
      handle: aka ? aka.slice('at://'.length) : null
    }
  }

  private async fetchBindingRecord(
    pds: string,
    atprotoDid: string
  ): Promise<{ ok: true; uri: string; value: unknown } | { ok: false; reason: string }> {
    const url =
      `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(atprotoDid)}` +
      `&collection=${ATPROTO_BINDING_COLLECTION}&rkey=${ATPROTO_BINDING_RKEY}`
    try {
      const res = await this.fetchImpl(url)
      if (res.status === 400 || res.status === 404) {
        return { ok: false, reason: 'No binding record in the ATProto repo' }
      }
      if (!res.ok) {
        return { ok: false, reason: `Binding record fetch failed (${res.status})` }
      }
      const body = (await res.json()) as { uri?: unknown; value?: unknown }
      const uri =
        typeof body.uri === 'string'
          ? body.uri
          : `at://${atprotoDid}/${ATPROTO_BINDING_COLLECTION}/${ATPROTO_BINDING_RKEY}`
      return { ok: true, uri, value: body.value }
    } catch (err) {
      return {
        ok: false,
        reason: `Binding record fetch failed: ${err instanceof Error ? err.message : err}`
      }
    }
  }
}
