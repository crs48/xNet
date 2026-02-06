/**
 * Secure random number generation
 */

/**
 * Generate cryptographically secure random bytes
 *
 * @param length - Number of bytes to generate (must be positive integer, max 65536)
 * @throws Error if length is invalid
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isInteger(length) || length < 0) {
    throw new Error('randomBytes: length must be a non-negative integer')
  }
  if (length > 65536) {
    throw new Error('randomBytes: length must not exceed 65536 bytes')
  }
  if (length === 0) {
    return new Uint8Array(0)
  }
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return bytes
}
