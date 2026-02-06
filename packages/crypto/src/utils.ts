/**
 * Encoding utilities
 */

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Alias for bytesToHex
 */
export const toHex = bytesToHex

/**
 * Convert hex string to bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length')
  }
  // Validate hex characters
  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error('Invalid hex string: contains non-hex characters')
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Alias for hexToBytes
 */
export const fromHex = hexToBytes

/**
 * Convert bytes to base64 string
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Use loop instead of spread to avoid stack overflow on large arrays
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Alias for bytesToBase64
 */
export const toBase64 = bytesToBase64

/**
 * Convert base64 string to bytes
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Alias for base64ToBytes
 */
export const fromBase64 = base64ToBytes

/**
 * Convert bytes to base64url string (URL-safe base64)
 */
export function bytesToBase64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Convert base64url string to bytes
 */
export function base64urlToBytes(base64url: string): Uint8Array {
  // Restore padding
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padding = base64.length % 4
  if (padding) {
    base64 += '='.repeat(4 - padding)
  }
  return base64ToBytes(base64)
}

/**
 * Constant-time comparison of two byte arrays
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i]
  }
  return result === 0
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}
