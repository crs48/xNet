/**
 * @xnet/identity/sharing - Create share tokens using UCAN
 */
import type { UCANCapability } from '../types'
import type { ShareOptions, ShareToken, ShareData, SharePermission } from './types'
import { createUCAN } from '../ucan'
import { toBase64Url } from './base64url'

const DEFAULT_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const DEFAULT_BASE_URL = 'https://xnet.fyi'
const DEFAULT_AUDIENCE = 'did:web:xnet.fyi'

/**
 * Create a share token for a resource.
 *
 * Generates a UCAN token signed by the issuer that grants specific
 * permissions on a resource. The token is encoded into a shareable link.
 *
 * @param issuerDid - DID of the identity creating the share
 * @param signingKey - Ed25519 private key for signing
 * @param options - Share configuration
 *
 * @example
 * const share = createShareToken(myDid, myKey, {
 *   resource: 'xnet://did:key:z.../page/abc',
 *   permission: 'read'
 * })
 * // share.shareLink → "https://xnet.fyi/s/eyJ..."
 */
export function createShareToken(
  issuerDid: string,
  signingKey: Uint8Array,
  options: ShareOptions
): ShareToken {
  const {
    resource,
    permission,
    expiresIn = DEFAULT_EXPIRY_MS,
    audience = DEFAULT_AUDIENCE,
    hubUrl,
    baseUrl = DEFAULT_BASE_URL
  } = options

  const now = Date.now()
  const expiresAt = now + expiresIn
  const expirationUnix = Math.floor(expiresAt / 1000)

  // Build UCAN capabilities from permission level
  const capabilities = buildCapabilities(resource, permission)

  // Create the UCAN token
  const token = createUCAN({
    issuer: issuerDid,
    issuerKey: signingKey,
    audience,
    capabilities,
    expiration: expirationUnix
  })

  // Build the share link
  const shareData: ShareData = {
    v: 1,
    r: resource,
    u: token
  }
  if (hubUrl) {
    shareData.h = hubUrl
  }

  const encoded = toBase64Url(JSON.stringify(shareData))
  const shareLink = `${baseUrl}/s/${encoded}`

  return {
    token,
    resource,
    permission,
    expiresAt,
    shareLink,
    issuer: issuerDid,
    createdAt: now
  }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Build UCAN capabilities from a permission level.
 * Higher permissions include lower ones (admin > write > read).
 */
export function buildCapabilities(resource: string, permission: SharePermission): UCANCapability[] {
  const capabilities: UCANCapability[] = [{ with: resource, can: 'xnet/read' }]

  if (permission === 'write' || permission === 'admin') {
    capabilities.push({ with: resource, can: 'xnet/write' })
  }

  if (permission === 'admin') {
    capabilities.push({ with: resource, can: 'xnet/admin' })
  }

  return capabilities
}
