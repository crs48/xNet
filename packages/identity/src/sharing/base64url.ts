/**
 * @xnet/identity/sharing - Unicode-safe base64url encoding/decoding
 *
 * Uses TextEncoder/TextDecoder to handle all Unicode correctly,
 * unlike raw btoa/atob which only support Latin-1.
 */

/**
 * Encode a UTF-8 string to base64url (no padding).
 * Safe for all Unicode characters.
 */
export function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Decode a base64url string back to a UTF-8 string.
 * Safe for all Unicode characters.
 */
export function fromBase64Url(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
