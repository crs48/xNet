/**
 * @xnetjs/licenses — platform signing keys.
 *
 * The marketplace signs licenses with an Ed25519 keypair. The **private** key
 * lives only on the hub (e.g. `XNET_LICENSE_PRIVKEY`); the **public** key is
 * baked into client builds (`XNET_LICENSE_PUBKEY`) so the runtime can verify
 * offline. Keys are exchanged as hex strings for easy env-var transport.
 */

import {
  generateSigningKeyPair,
  getSigningPublicKeyFromPrivate,
  bytesToHex,
  hexToBytes
} from '@xnetjs/crypto'

export interface LicenseKeypairHex {
  /** Baked into client builds; used to verify tokens. */
  publicKeyHex: string
  /** Hub-only secret; used to mint tokens. */
  privateKeyHex: string
}

/** Generate a fresh platform signing keypair (run once; store the private half as a secret). */
export function generateLicenseKeypair(): LicenseKeypairHex {
  const { publicKey, privateKey } = generateSigningKeyPair()
  return { publicKeyHex: bytesToHex(publicKey), privateKeyHex: bytesToHex(privateKey) }
}

/** Decode a hex public key into bytes for {@link verifyPluginLicense}. */
export function publicKeyFromHex(hex: string): Uint8Array {
  return hexToBytes(hex)
}

/** Decode a hex private key into bytes for {@link signPluginLicense}. */
export function privateKeyFromHex(hex: string): Uint8Array {
  return hexToBytes(hex)
}

/** Recover the public key from a private key (sanity-check a configured secret). */
export function publicKeyHexFromPrivateHex(privateHex: string): string {
  return bytesToHex(getSigningPublicKeyFromPrivate(hexToBytes(privateHex)))
}
