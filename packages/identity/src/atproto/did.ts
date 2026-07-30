/**
 * Foreign ATProto DID representation (explorations 0301/0322/0337).
 *
 * xNet's signing kernel is `did:key`/Ed25519 and stays that way — an ATProto
 * DID (`did:plc:` / `did:web:`) is *represented*, never *signed with*. This
 * module is the type-level seam: recognizing, parsing, and formatting foreign
 * DIDs and handles, with zero changes to `parseDID`'s guarantees (it still
 * accepts only `did:key` and still returns a verifying key).
 */

import type { DID } from '../types'

/** The native, signing-capable identity (alias for the kernel DID type). */
export type XNetDid = DID

/** A foreign ATProto identity: represent-only, resolves via PLC or HTTPS. */
export type AtprotoDid = `did:plc:${string}` | `did:web:${string}`

export type AnyDid = XNetDid | AtprotoDid

/** did:plc identifiers are exactly 24 chars of lowercase base32 (RFC 4648, no padding). */
const PLC_SUFFIX = /^[a-z2-7]{24}$/

/**
 * did:web method-specific ids are percent-encoded hostnames with optional
 * colon-separated path segments; we accept hostname[:port-less] forms only.
 */
const WEB_SUFFIX = /^[a-z0-9._%-]+(?::[a-z0-9._%-]+)*$/i

export function isAtprotoDid(value: string): value is AtprotoDid {
  if (value.startsWith('did:plc:')) return PLC_SUFFIX.test(value.slice('did:plc:'.length))
  if (value.startsWith('did:web:')) {
    const suffix = value.slice('did:web:'.length)
    return suffix.length > 0 && suffix.length <= 253 && WEB_SUFFIX.test(suffix)
  }
  return false
}

export function isXNetDid(value: string): value is XNetDid {
  return value.startsWith('did:key:z')
}

export type ParsedAnyDid =
  | { kind: 'xnet'; did: XNetDid }
  | { kind: 'atproto-plc' | 'atproto-web'; did: AtprotoDid }

/** Classify a DID string, or return null for anything unrecognized. */
export function parseAnyDid(value: string): ParsedAnyDid | null {
  if (isXNetDid(value)) return { kind: 'xnet', did: value }
  if (isAtprotoDid(value)) {
    return {
      kind: value.startsWith('did:plc:') ? 'atproto-plc' : 'atproto-web',
      did: value
    }
  }
  return null
}

/** ATProto handles are domains: `alice.bsky.social`, `example.com`. */
const HANDLE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/

/** Strip a leading `@` and lowercase — the canonical handle form. */
export function normalizeAtprotoHandle(handle: string): string {
  return handle.replace(/^@/, '').trim().toLowerCase()
}

export function isValidAtprotoHandle(handle: string): boolean {
  const normalized = normalizeAtprotoHandle(handle)
  return normalized.length <= 253 && HANDLE.test(normalized)
}
