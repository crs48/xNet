/**
 * `net.x.identity.binding` — the bidirectional identity binding record
 * (explorations 0301/0322/0337).
 *
 * The binding is a *social proof* in both directions:
 *
 * - it lives in the user's ATProto repo (collection `net.x.identity.binding`,
 *   rkey `self`), so only someone who controls the ATProto account could have
 *   put it there; and
 * - its `sig` is an Ed25519 signature by the **xNet** key over the canonical
 *   binding message, so only someone who controls the xNet identity could
 *   have produced it.
 *
 * A verifier (the hub) resolves the ATProto DID document, fetches the record
 * from the DID's canonical PDS, and checks both facts. Neither side alone can
 * claim the other.
 */

import { sign, verify } from '@xnetjs/crypto'
import { parseDID } from '../did'
import { isAtprotoDid } from './did'

export const ATPROTO_BINDING_COLLECTION = 'net.x.identity.binding'
export const ATPROTO_BINDING_RKEY = 'self'

export interface AtprotoBindingRecord {
  $type: typeof ATPROTO_BINDING_COLLECTION
  /** The xNet data identity (`did:key`) this ATProto account vouches for. */
  xnetDid: string
  /** The ATProto identity (`did:plc`/`did:web`) the xNet key vouches for. */
  atprotoDid: string
  /** ISO-8601 creation time; verifiers may bound acceptable age. */
  createdAt: string
  /** base64url Ed25519 signature by the xNet key over `bindingMessage(...)`. */
  sig: string
}

/**
 * The canonical signed message. Version-prefixed and newline-delimited so it
 * can never collide with another domain's signatures.
 */
export function bindingMessage(xnetDid: string, atprotoDid: string, createdAt: string): Uint8Array {
  return new TextEncoder().encode(
    `xnet-atproto-binding.v1\n${xnetDid}\n${atprotoDid}\n${createdAt}`
  )
}

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

const fromBase64Url = (value: string): Uint8Array | null => {
  try {
    let base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = base64.length % 4
    if (padding) base64 += '='.repeat(4 - padding)
    const binary = atob(base64)
    return Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

/** Create a signed binding record, ready to `putRecord` into the ATProto repo. */
export function createAtprotoBinding(input: {
  xnetDid: string
  signingKey: Uint8Array
  atprotoDid: string
  now?: Date
}): AtprotoBindingRecord {
  if (!isAtprotoDid(input.atprotoDid)) {
    throw new Error(`Not an ATProto DID: ${input.atprotoDid}`)
  }
  // Throws unless xnetDid is a well-formed did:key — the signing side stays native.
  parseDID(input.xnetDid)
  const createdAt = (input.now ?? new Date()).toISOString()
  const signature = sign(
    bindingMessage(input.xnetDid, input.atprotoDid, createdAt),
    input.signingKey
  )
  return {
    $type: ATPROTO_BINDING_COLLECTION,
    xnetDid: input.xnetDid,
    atprotoDid: input.atprotoDid,
    createdAt,
    sig: toBase64Url(signature)
  }
}

export type BindingVerification =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Verify the xNet half of a binding record: shape, DID formats, and the
 * Ed25519 signature by `xnetDid`'s key. The ATProto half — that the record
 * really lives in `atprotoDid`'s repo on its canonical PDS — is the fetching
 * verifier's job (it knows where the bytes came from).
 */
export function verifyAtprotoBinding(record: unknown): BindingVerification {
  if (!record || typeof record !== 'object') return { valid: false, reason: 'Not an object' }
  const r = record as Record<string, unknown>
  if (r.$type !== ATPROTO_BINDING_COLLECTION) {
    return { valid: false, reason: `Wrong $type: ${String(r.$type)}` }
  }
  if (typeof r.xnetDid !== 'string' || typeof r.atprotoDid !== 'string') {
    return { valid: false, reason: 'Missing DID fields' }
  }
  if (typeof r.createdAt !== 'string' || Number.isNaN(Date.parse(r.createdAt))) {
    return { valid: false, reason: 'Invalid createdAt' }
  }
  if (typeof r.sig !== 'string') return { valid: false, reason: 'Missing signature' }
  if (!isAtprotoDid(r.atprotoDid)) {
    return { valid: false, reason: `Not an ATProto DID: ${r.atprotoDid}` }
  }

  let publicKey: Uint8Array
  try {
    publicKey = parseDID(r.xnetDid)
  } catch (err) {
    return { valid: false, reason: `Invalid xNet DID: ${err instanceof Error ? err.message : err}` }
  }
  const signature = fromBase64Url(r.sig)
  if (!signature) return { valid: false, reason: 'Malformed signature encoding' }
  if (!verify(bindingMessage(r.xnetDid, r.atprotoDid, r.createdAt), signature, publicKey)) {
    return { valid: false, reason: 'Signature does not verify against the xNet key' }
  }
  return { valid: true }
}
