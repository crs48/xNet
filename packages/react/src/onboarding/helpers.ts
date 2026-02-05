/**
 * @xnet/react/onboarding - Helper utilities
 */

/**
 * Get a human-friendly name for the platform's biometric authenticator.
 */
export function getPlatformAuthName(): string {
  if (typeof navigator === 'undefined') return 'Biometric authentication'

  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad')) {
    return 'Touch ID'
  }
  if (ua.includes('windows')) {
    return 'Windows Hello'
  }
  if (ua.includes('android')) {
    return 'Fingerprint'
  }
  return 'Biometric authentication'
}

/**
 * Truncate a DID for display, showing first and last segments.
 * e.g. "did:key:z6MkhaXg...yz" → "did:key:z6Mkha...xyz"
 */
export function truncateDid(did: string, headLen = 16, tailLen = 4): string {
  if (did.length <= headLen + tailLen + 3) return did
  return `${did.slice(0, headLen)}...${did.slice(-tailLen)}`
}

/**
 * Copy text to clipboard, returns true on success.
 * Returns false in SSR environments where navigator is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
