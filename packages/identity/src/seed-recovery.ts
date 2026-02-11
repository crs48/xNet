/**
 * @xnet/identity - Seed-based recovery and multi-device helpers
 */

import type { DID, HybridKeyBundle } from './types'
import {
  bytesToHex,
  createDIDFromEd25519PublicKey,
  decryptWithNonce,
  ed25519PrivToX25519,
  ed25519ToX25519,
  encryptWithNonce,
  getSigningPublicKeyFromPrivate,
  hexToBytes,
  hkdf,
  randomBytes
} from '@xnet/crypto'
import { createKeyBundle } from './key-bundle'

const DEFAULT_SALT = new TextEncoder().encode('xnet-salt')
const SEED_WORDS = [
  'amber',
  'anchor',
  'apple',
  'arch',
  'arrow',
  'atlas',
  'autumn',
  'beacon',
  'birch',
  'bloom',
  'brave',
  'breeze',
  'canyon',
  'cedar',
  'chess',
  'cinder',
  'copper',
  'coral',
  'crystal',
  'dawn',
  'delta',
  'desert',
  'drift',
  'ember',
  'falcon',
  'fable',
  'fern',
  'flame',
  'forest',
  'frost',
  'galaxy',
  'garden',
  'glacier',
  'harbor',
  'hazel',
  'horizon',
  'island',
  'ivory',
  'jasmine',
  'juniper',
  'keystone',
  'lagoon',
  'lantern',
  'meadow',
  'meteor',
  'mist',
  'navy',
  'nectar',
  'nova',
  'oak',
  'oasis',
  'opal',
  'orbit',
  'phoenix',
  'pine',
  'quartz',
  'raven',
  'river',
  'saffron',
  'sierra',
  'spruce',
  'summit',
  'thunder',
  'valley',
  'violet',
  'willow',
  'winter',
  'zenith'
] as const

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().replace(/\s+/g, ' ')
}

function generateMnemonic(): string {
  const words: string[] = []
  for (let index = 0; index < 12; index++) {
    const bytes = randomBytes(1)
    words.push(SEED_WORDS[bytes[0] % SEED_WORDS.length])
  }
  return words.join(' ')
}

function mnemonicToSeedBytes(mnemonic: string, passphrase?: string): Uint8Array {
  const input = new TextEncoder().encode(`${mnemonic}::${passphrase ?? ''}`)
  return hkdf(input, 'xnet-mnemonic-seed', 64, DEFAULT_SALT)
}

export interface DerivedKeyBundle {
  mnemonic: string
  did: DID
  signingKey: Uint8Array
  signingPublicKey: Uint8Array
  encryptionKey: Uint8Array
  encryptionPublicKey: Uint8Array
  backupKey: Uint8Array
}

export interface EncryptedKeyBackup {
  did: DID
  encryptedPayload: Uint8Array
  nonce: Uint8Array
  version: 1
  createdAt: number
}

export interface SocialRecoveryConfig {
  totalShares: number
  threshold: number
  shareLabels?: string[]
}

export interface RecoveryShare {
  index: number
  share: string
  label: string
  threshold: number
  totalShares: number
  groupId: string
}

/**
 * Derive identity keys from a BIP-39 mnemonic.
 */
export function deriveKeysFromSeed(mnemonic: string, passphrase?: string): DerivedKeyBundle {
  const normalized = normalizeMnemonic(mnemonic)
  const words = normalized.split(' ').filter((word) => word.length > 0)
  if (words.length < 12) {
    throw new Error('Invalid seed phrase: expected at least 12 words')
  }

  const seed = mnemonicToSeedBytes(normalized, passphrase)
  const signingKey = hkdf(seed, 'xnet-ed25519-signing', 32, DEFAULT_SALT)
  const signingPublicKey = getSigningPublicKeyFromPrivate(signingKey)

  // Critical invariant: X25519 is derived from Ed25519 via birational conversion.
  const encryptionKey = ed25519PrivToX25519(signingKey)
  const encryptionPublicKey = ed25519ToX25519(signingPublicKey)

  const backupKey = hkdf(seed, 'xnet-backup-key', 32, DEFAULT_SALT)
  const did = createDIDFromEd25519PublicKey(signingPublicKey) as DID

  return {
    mnemonic: normalized,
    did,
    signingKey,
    signingPublicKey,
    encryptionKey,
    encryptionPublicKey,
    backupKey
  }
}

/**
 * Generate a new mnemonic and derive a deterministic key bundle.
 */
export function generateIdentity(options: { passphrase?: string } = {}): {
  mnemonic: string
  bundle: DerivedKeyBundle
} {
  const mnemonic = generateMnemonic()
  return {
    mnemonic,
    bundle: deriveKeysFromSeed(mnemonic, options.passphrase)
  }
}

/**
 * Encrypt deterministic key material for hub backup.
 */
export function createKeyBackup(
  bundle: DerivedKeyBundle,
  additionalData?: Record<string, unknown>
): EncryptedKeyBackup {
  const payload = JSON.stringify({
    version: 1,
    did: bundle.did,
    signingKey: bytesToHex(bundle.signingKey),
    encryptionKey: bytesToHex(bundle.encryptionKey),
    createdAt: Date.now(),
    ...additionalData
  })

  const nonce = randomBytes(24)
  const ciphertext = encryptWithNonce(new TextEncoder().encode(payload), bundle.backupKey, nonce)

  return {
    did: bundle.did,
    encryptedPayload: ciphertext,
    nonce,
    version: 1,
    createdAt: Date.now()
  }
}

/**
 * Recover deterministic keys from an encrypted backup blob.
 */
export function recoverFromBackup(
  backup: EncryptedKeyBackup,
  mnemonic: string,
  passphrase?: string
): DerivedKeyBundle {
  const derived = deriveKeysFromSeed(mnemonic, passphrase)
  if (derived.did !== backup.did) {
    throw new Error('Seed phrase does not match backup DID')
  }

  const plaintext = decryptWithNonce(backup.encryptedPayload, derived.backupKey, backup.nonce)
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as {
    signingKey?: string
    encryptionKey?: string
  }

  if (!parsed.signingKey || !parsed.encryptionKey) {
    throw new Error('Backup payload is invalid')
  }

  const signingFromBackup = hexToBytes(parsed.signingKey)
  const encryptionFromBackup = hexToBytes(parsed.encryptionKey)
  if (bytesToHex(signingFromBackup) !== bytesToHex(derived.signingKey)) {
    throw new Error('Backup signing key does not match derived seed keys')
  }
  if (bytesToHex(encryptionFromBackup) !== bytesToHex(derived.encryptionKey)) {
    throw new Error('Backup encryption key does not match derived seed keys')
  }

  return derived
}

/**
 * Create a HybridKeyBundle from a mnemonic-derived classical key pair.
 */
export function createKeyBundleFromSeed(
  mnemonic: string,
  options: { includePQ?: boolean; passphrase?: string } = {}
): { bundle: HybridKeyBundle; mnemonic: string } {
  const derived = deriveKeysFromSeed(mnemonic, options.passphrase)
  const includePQ = options.includePQ ?? false

  if (!includePQ) {
    return {
      bundle: {
        signingKey: derived.signingKey,
        encryptionKey: derived.encryptionKey,
        identity: {
          did: derived.did,
          publicKey: derived.signingPublicKey,
          created: Date.now()
        },
        maxSecurityLevel: 0
      },
      mnemonic: derived.mnemonic
    }
  }

  const pq = createKeyBundle({ includePQ: true })
  return {
    bundle: {
      signingKey: derived.signingKey,
      encryptionKey: derived.encryptionKey,
      identity: {
        did: derived.did,
        publicKey: derived.signingPublicKey,
        created: Date.now()
      },
      pqSigningKey: pq.pqSigningKey,
      pqPublicKey: pq.pqPublicKey,
      pqEncryptionKey: pq.pqEncryptionKey,
      pqEncryptionPublicKey: pq.pqEncryptionPublicKey,
      maxSecurityLevel: 2
    },
    mnemonic: derived.mnemonic
  }
}

function gfMul(a: number, b: number): number {
  let multiplicand = a & 0xff
  let multiplier = b & 0xff
  let product = 0

  for (let index = 0; index < 8; index++) {
    if ((multiplier & 1) === 1) {
      product ^= multiplicand
    }
    const highBit = multiplicand & 0x80
    multiplicand = (multiplicand << 1) & 0xff
    if (highBit) {
      multiplicand ^= 0x1b
    }
    multiplier >>= 1
  }

  return product
}

function gfPow(value: number, exponent: number): number {
  let result = 1
  let base = value
  let power = exponent

  while (power > 0) {
    if ((power & 1) === 1) {
      result = gfMul(result, base)
    }
    base = gfMul(base, base)
    power >>= 1
  }

  return result
}

function gfInv(value: number): number {
  if (value === 0) {
    throw new Error('Invalid recovery share: divide by zero')
  }
  return gfPow(value, 254)
}

function gfDiv(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Invalid recovery share: divide by zero')
  }
  if (a === 0) return 0
  return gfMul(a, gfInv(b))
}

function evaluatePolynomial(coeffs: Uint8Array, x: number): number {
  let result = 0
  let power = 1
  for (let index = 0; index < coeffs.length; index++) {
    result ^= gfMul(coeffs[index], power)
    power = gfMul(power, x)
  }
  return result
}

export function createRecoveryShares(
  mnemonic: string,
  config: SocialRecoveryConfig
): RecoveryShare[] {
  if (config.threshold < 2) {
    throw new Error('Recovery threshold must be >= 2')
  }
  if (config.totalShares < config.threshold) {
    throw new Error('Total shares must be >= threshold')
  }
  if (config.totalShares > 255) {
    throw new Error('Total shares must be <= 255')
  }

  const secret = new TextEncoder().encode(normalizeMnemonic(mnemonic))
  const groupId = bytesToHex(randomBytes(8))
  const shares = Array.from({ length: config.totalShares }, () => new Uint8Array(secret.length + 1))

  for (let index = 0; index < config.totalShares; index++) {
    shares[index][0] = index + 1
  }

  for (let byteIndex = 0; byteIndex < secret.length; byteIndex++) {
    const coeffs = new Uint8Array(config.threshold)
    coeffs[0] = secret[byteIndex]
    if (config.threshold > 1) {
      const randomCoeffs = randomBytes(config.threshold - 1)
      coeffs.set(randomCoeffs, 1)
    }

    for (let index = 0; index < config.totalShares; index++) {
      shares[index][byteIndex + 1] = evaluatePolynomial(coeffs, index + 1)
    }
  }

  return shares.map((shareBytes, index) => ({
    index: index + 1,
    share: bytesToHex(shareBytes),
    label: config.shareLabels?.[index] ?? `Share ${index + 1}`,
    threshold: config.threshold,
    totalShares: config.totalShares,
    groupId
  }))
}

export function recoverFromShares(shares: RecoveryShare[]): string {
  if (shares.length === 0) {
    throw new Error('No recovery shares provided')
  }

  const threshold = shares[0].threshold
  const totalShares = shares[0].totalShares
  const groupId = shares[0].groupId

  if (shares.length < threshold) {
    throw new Error(`Need at least ${threshold} shares, got ${shares.length}`)
  }

  for (const share of shares) {
    if (share.threshold !== threshold || share.totalShares !== totalShares) {
      throw new Error('Recovery shares are from different groups')
    }
    if (share.groupId !== groupId) {
      throw new Error('Recovery shares are from different groups')
    }
  }

  const selected = shares.slice(0, threshold).map((share) => hexToBytes(share.share))
  const payloadLength = selected[0].length - 1
  const recovered = new Uint8Array(payloadLength)

  for (let byteIndex = 0; byteIndex < payloadLength; byteIndex++) {
    let value = 0

    for (let i = 0; i < selected.length; i++) {
      const xi = selected[i][0]
      const yi = selected[i][byteIndex + 1]

      let basis = 1
      for (let j = 0; j < selected.length; j++) {
        if (i === j) continue
        const xj = selected[j][0]
        basis = gfMul(basis, gfDiv(xj, xi ^ xj))
      }

      value ^= gfMul(yi, basis)
    }

    recovered[byteIndex] = value
  }

  return new TextDecoder().decode(recovered)
}
