/**
 * @xnetjs/identity/sharing - Types for UCAN-based sharing
 */

// ─── Share Permission ────────────────────────────────────────

export type SharePermission = 'read' | 'write' | 'admin'

// ─── Share Options ───────────────────────────────────────────

export type ShareOptions = {
  /** Resource URI to share (e.g. "xnet://did:key:z.../page/123") */
  resource: string

  /** Permission level */
  permission: SharePermission

  /** Token expiration in milliseconds (default: 30 days) */
  expiresIn?: number

  /** Specific recipient DID (optional — for private shares) */
  audience?: string

  /** Hub URL to include in the share link */
  hubUrl?: string

  /** Base URL for the share link (default: "https://xnet.fyi") */
  baseUrl?: string
}

// ─── Share Token ─────────────────────────────────────────────

export type ShareToken = {
  /** The UCAN JWT token string */
  token: string

  /** Resource being shared */
  resource: string

  /** Permission granted */
  permission: SharePermission

  /** When the share expires (ms since epoch) */
  expiresAt: number

  /** Shareable link */
  shareLink: string

  /** Issuer DID */
  issuer: string

  /** When the token was created */
  createdAt: number
}

// ─── Share Data (encoded in the link) ────────────────────────

export type ShareData = {
  /** Version */
  v: 1

  /** Resource URI */
  r: string

  /** UCAN token */
  u: string

  /** Hub URL (optional) */
  h?: string
}

// ─── Link Delegation (B2 of exploration 0169) ────────────────

export type ShareLinkDelegation = {
  /** Owner-signed UCAN delegating the resource to the link's DID. */
  token: string

  /** The link's DID (audience of the token). */
  linkDid: string

  /** Resource URI the delegation covers. */
  resource: string

  /** Permission level delegated to the link. */
  permission: SharePermission

  /** Owner DID that signed the delegation. */
  issuer: string

  /** When the delegation expires (ms since epoch). */
  expiresAt: number
}

// ─── Revocation ──────────────────────────────────────────────

export type Revocation = {
  /** Hash of the UCAN token (for identification) */
  tokenHash: string

  /** The issuer DID who revoked it */
  issuer: string

  /** When revoked */
  revokedAt: number

  /** Ed25519 signature of the revocation payload */
  signature: Uint8Array
}
