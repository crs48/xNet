/**
 * @xnetjs/identity/sharing - Link-keypair delegation chains (B2 of
 * exploration 0169).
 *
 * Phase B1 share links are hub-mediated: the hub's link record is the
 * authorization root. B2 upgrades the cryptography without changing URLs:
 * each link gets its own keypair, the owner signs a UCAN delegating the
 * resource to the link's DID, and the link's PRIVATE KEY becomes the URL
 * fragment secret. At claim time the recipient's client uses the link key
 * to sign a sub-delegation `linkDID → recipientDID` carrying the owner's
 * token as proof — any hub (or peer) holding only public information can
 * verify the chain `owner → link → recipient`.
 */

import type { ShareLinkDelegation, SharePermission } from './types'
import { bytesToBase64, base64ToBytes } from '@xnetjs/crypto'
import { generateIdentity, identityFromPrivateKey } from '../did'
import { createUCAN, verifyUCAN, getCapabilities } from '../ucan'
import { buildCapabilities } from './create-share'

const DEFAULT_LINK_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const DEFAULT_CLAIM_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

export type ShareLinkKeypair = {
  /** The link's own DID — audience of the owner's delegation. */
  did: string
  /** The link's private key — this is the URL fragment secret. */
  signingKey: Uint8Array
}

/** Generate a fresh keypair identifying one share link. */
export function createShareLinkKeypair(): ShareLinkKeypair {
  const { identity, privateKey } = generateIdentity()
  return { did: identity.did, signingKey: privateKey }
}

/** Encode the link private key for transport in a URL fragment. */
export function encodeLinkSecret(signingKey: Uint8Array): string {
  return bytesToBase64(signingKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Decode a URL-fragment secret back into the link private key. */
export function decodeLinkSecret(secret: string): Uint8Array {
  let base64 = secret.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return base64ToBytes(base64)
}

export type CreateLinkDelegationOptions = {
  resource: string
  permission: SharePermission
  /** Lifetime of the owner→link delegation (default 30 days). */
  expiresIn?: number
}

/**
 * Owner side: delegate a resource to a link's DID. The returned token is
 * stored alongside the hub link record (it contains no secrets).
 */
export function createLinkDelegation(
  ownerDid: string,
  ownerSigningKey: Uint8Array,
  link: ShareLinkKeypair | string,
  options: CreateLinkDelegationOptions
): ShareLinkDelegation {
  const linkDid = typeof link === 'string' ? link : link.did
  const expiresAt = Date.now() + (options.expiresIn ?? DEFAULT_LINK_EXPIRY_MS)
  const token = createUCAN({
    issuer: ownerDid,
    issuerKey: ownerSigningKey,
    audience: linkDid,
    capabilities: buildCapabilities(options.resource, options.permission),
    expiration: Math.floor(expiresAt / 1000)
  })
  return {
    token,
    linkDid,
    resource: options.resource,
    permission: options.permission,
    issuer: ownerDid,
    expiresAt
  }
}

export type ClaimLinkDelegationOptions = {
  /** Lifetime of the link→recipient sub-delegation (default 24 hours). */
  expiresIn?: number
}

/**
 * Recipient side: holding the link secret (the link's private key), sign a
 * sub-delegation from the link DID to the recipient's own DID, carrying the
 * owner's delegation as proof. The result is a self-contained chain any
 * verifier can check with public keys alone.
 */
export function claimLinkDelegation(
  delegation: ShareLinkDelegation,
  linkSecret: Uint8Array | string,
  recipientDid: string,
  options: ClaimLinkDelegationOptions = {}
): string {
  const signingKey = typeof linkSecret === 'string' ? decodeLinkSecret(linkSecret) : linkSecret
  const linkIdentity = identityFromPrivateKey(signingKey)
  if (linkIdentity.did !== delegation.linkDid) {
    throw new Error('Link secret does not match the delegation audience')
  }

  const ownerToken = verifyUCAN(delegation.token)
  if (!ownerToken.valid || !ownerToken.payload) {
    throw new Error(`Owner delegation is invalid: ${ownerToken.error ?? 'unknown error'}`)
  }

  const expiresAt = Math.min(
    Date.now() + (options.expiresIn ?? DEFAULT_CLAIM_EXPIRY_MS),
    delegation.expiresAt
  )

  return createUCAN({
    issuer: delegation.linkDid,
    issuerKey: signingKey,
    audience: recipientDid,
    capabilities: getCapabilities(ownerToken.payload),
    expiration: Math.floor(expiresAt / 1000),
    proofs: [delegation.token]
  })
}

export type VerifiedLinkClaim = {
  valid: boolean
  error?: string
  /** Original resource owner (root issuer of the chain). */
  owner?: string
  /** The recipient the chain terminates at. */
  recipient?: string
  capabilities?: Array<{ with: string; can: string }>
}

/**
 * Verifier side (hub or peer): check a recipient's claimed chain
 * `owner → link → recipient` using public information only.
 */
export function verifyLinkClaim(chainToken: string): VerifiedLinkClaim {
  const result = verifyUCAN(chainToken)
  if (!result.valid || !result.payload) {
    return { valid: false, error: result.error ?? 'Invalid token' }
  }
  if (result.payload.prf.length === 0) {
    return { valid: false, error: 'Claim chain is missing the owner delegation proof' }
  }

  const rootProof = result.payload.prf[0]
  const proofResult = verifyUCAN(rootProof)
  if (!proofResult.valid || !proofResult.payload) {
    return { valid: false, error: proofResult.error ?? 'Invalid owner delegation' }
  }

  return {
    valid: true,
    owner: proofResult.payload.iss,
    recipient: result.payload.aud,
    capabilities: getCapabilities(result.payload)
  }
}
