/**
 * @xnet/identity/passkey - Passkey support detection
 */
import type { PasskeySupport } from './types'

/**
 * Detect passkey and PRF support in the current browser environment.
 *
 * @example
 * const support = await detectPasskeySupport()
 * if (!support.webauthn) showUnsupportedMessage()
 * if (!support.prf) useFallbackFlow()
 */
export async function detectPasskeySupport(): Promise<PasskeySupport> {
  const support: PasskeySupport = {
    webauthn: false,
    prf: false,
    platform: false,
    sync: false
  }

  // Basic WebAuthn check
  if (typeof globalThis === 'undefined' || !('PublicKeyCredential' in globalThis)) {
    return support
  }
  support.webauthn = true

  // Platform authenticator (Touch ID, Face ID, Windows Hello)
  try {
    support.platform = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    support.platform = false
  }

  // PRF extension support — best-effort heuristic.
  // Actual PRF support depends on the authenticator hardware, which can only be
  // determined during credential creation. This check detects browser-level
  // capability by looking for the PublicKeyCredential.getClientExtensionResults
  // method AND checking the browser's user agent for known PRF-capable versions.
  // False positives are possible (e.g. Firefox with non-PRF security keys);
  // the fallback flow handles that gracefully at creation time.
  if (
    'getClientExtensionResults' in PublicKeyCredential.prototype &&
    typeof navigator !== 'undefined'
  ) {
    const ua = navigator.userAgent
    // Chrome/Edge 116+ and Safari 18+ support PRF
    const chromeMatch = ua.match(/Chrom(?:e|ium)\/(\d+)/)
    const safariMatch = ua.match(/Version\/(\d+).*Safari/)
    if (chromeMatch && Number(chromeMatch[1]) >= 116) {
      support.prf = true
    } else if (safariMatch && Number(safariMatch[1]) >= 18) {
      support.prf = true
    } else if (chromeMatch || safariMatch) {
      support.prf = false // Known browser, but too old
    } else {
      // Unknown browser — assume no PRF support, fallback will handle it
      support.prf = false
    }
  }

  // Sync detection (heuristic based on platform)
  if (typeof navigator !== 'undefined') {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('mac') || ua.includes('iphone') || ua.includes('ipad')) {
      support.sync = true // iCloud Keychain likely available
    } else if (ua.includes('android') || ua.includes('chrome')) {
      support.sync = true // Google Password Manager likely available
    }
  }

  return support
}
