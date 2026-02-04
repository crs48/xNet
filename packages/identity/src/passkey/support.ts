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

  // PRF extension support — check for getClientExtensionResults method
  // This is a heuristic; actual PRF support depends on the authenticator.
  // Chrome 116+, Safari 18+, Edge 116+ all support the PRF extension.
  support.prf = 'getClientExtensionResults' in PublicKeyCredential.prototype

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
