/**
 * @xnetjs/hub - URL validation and SSRF protection utilities.
 */

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd/
]

/**
 * Check if a hostname resolves to a private/internal IP address.
 */
const isPrivateHost = (hostname: string): boolean => {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower === '[::1]') return true
  return PRIVATE_IP_RANGES.some((re) => re.test(hostname))
}

/**
 * Validate a URL is safe for server-side requests (no SSRF).
 * Rejects private IPs, non-HTTP(S) schemes, and link-local addresses.
 */
export const validateExternalUrl = (rawUrl: string): { valid: boolean; error?: string } => {
  try {
    const url = new URL(rawUrl)
    const scheme = url.protocol.toLowerCase()

    if (scheme !== 'http:' && scheme !== 'https:') {
      return { valid: false, error: `Invalid scheme: ${scheme}` }
    }

    if (isPrivateHost(url.hostname)) {
      return { valid: false, error: 'Private/internal URLs are not allowed' }
    }

    if (!url.hostname || url.hostname.length === 0) {
      return { valid: false, error: 'Empty hostname' }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}
