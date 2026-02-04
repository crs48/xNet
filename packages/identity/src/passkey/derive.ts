/**
 * @xnet/identity/passkey - HKDF key derivation from PRF output
 *
 * Shared between create.ts and unlock.ts to ensure identical derivation.
 */

/** Salt for HKDF — constant, app-specific */
const XNET_SALT = new TextEncoder().encode('xnet-identity-v1')

/** PRF input — constant so we get deterministic output from the passkey */
export const PRF_INPUT = new TextEncoder().encode('xnet-identity-key')

/**
 * Derive a 32-byte Ed25519 seed from a PRF output using Web Crypto HKDF.
 *
 * The PRF output is treated as raw key material, expanded with HKDF-SHA256
 * using a fixed salt and info string. The resulting 32 bytes are used as
 * the Ed25519 private key seed.
 */
export async function deriveKeySeed(prfOutput: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput as unknown as ArrayBuffer,
    'HKDF',
    false,
    ['deriveBits']
  )

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: XNET_SALT as unknown as ArrayBuffer,
      info: new TextEncoder().encode('ed25519-seed') as unknown as ArrayBuffer
    },
    keyMaterial,
    256 // 32 bytes
  )

  return new Uint8Array(bits)
}
