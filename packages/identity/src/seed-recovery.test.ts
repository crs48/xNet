import {
  decryptWithNonce,
  ed25519ToX25519,
  encryptWithNonce,
  generateContentKey,
  randomBytes,
  unwrapKey,
  wrapKeyForRecipient
} from '@xnet/crypto'
import { describe, expect, it } from 'vitest'
import {
  createKeyBackup,
  createKeyBundleFromSeed,
  createRecoveryShares,
  deriveKeysFromSeed,
  generateIdentity,
  recoverFromShares,
  recoverFromBackup
} from './seed-recovery'

const MNEMONIC_A =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const MNEMONIC_B = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

describe('seed recovery', () => {
  it('deriveKeysFromSeed is deterministic for the same mnemonic', () => {
    const a = deriveKeysFromSeed(MNEMONIC_A)
    const b = deriveKeysFromSeed(MNEMONIC_A)

    expect(a.did).toBe(b.did)
    expect(a.signingKey).toEqual(b.signingKey)
    expect(a.encryptionKey).toEqual(b.encryptionKey)
    expect(a.encryptionPublicKey).toEqual(b.encryptionPublicKey)
  })

  it('deriveKeysFromSeed produces different keys for different mnemonics', () => {
    const a = deriveKeysFromSeed(MNEMONIC_A)
    const b = deriveKeysFromSeed(MNEMONIC_B)

    expect(a.did).not.toBe(b.did)
    expect(a.signingKey).not.toEqual(b.signingKey)
    expect(a.encryptionKey).not.toEqual(b.encryptionKey)
  })

  it('enforces Ed25519 -> X25519 birational invariant', () => {
    const bundle = deriveKeysFromSeed(MNEMONIC_A)
    const converted = ed25519ToX25519(bundle.signingPublicKey)
    expect(bundle.encryptionPublicKey).toEqual(converted)
  })

  it('generateIdentity returns mnemonic and matching bundle', () => {
    const generated = generateIdentity()
    expect(generated.mnemonic.split(' ').length).toBe(12)

    const replay = deriveKeysFromSeed(generated.mnemonic)
    expect(generated.bundle.did).toBe(replay.did)
  })

  it('createKeyBackup and recoverFromBackup round-trip', () => {
    const original = deriveKeysFromSeed(MNEMONIC_A)
    const backup = createKeyBackup(original, { label: 'test-backup' })
    const recovered = recoverFromBackup(backup, MNEMONIC_A)

    expect(recovered.did).toBe(original.did)
    expect(recovered.signingKey).toEqual(original.signingKey)
    expect(recovered.encryptionKey).toEqual(original.encryptionKey)
  })

  it('recoverFromBackup fails when mnemonic does not match backup DID', () => {
    const original = deriveKeysFromSeed(MNEMONIC_A)
    const backup = createKeyBackup(original)

    expect(() => recoverFromBackup(backup, MNEMONIC_B)).toThrow(
      'Seed phrase does not match backup DID'
    )
  })

  it('createKeyBundleFromSeed bridges deterministic keys into HybridKeyBundle', () => {
    const { bundle } = createKeyBundleFromSeed(MNEMONIC_A)
    const derived = deriveKeysFromSeed(MNEMONIC_A)

    expect(bundle.identity.did).toBe(derived.did)
    expect(bundle.signingKey).toEqual(derived.signingKey)
    expect(bundle.encryptionKey).toEqual(derived.encryptionKey)
    expect(bundle.maxSecurityLevel).toBe(0)
  })

  it('two devices with same mnemonic decrypt the same wrapped content key', () => {
    const deviceA = deriveKeysFromSeed(MNEMONIC_A)
    const deviceB = deriveKeysFromSeed(MNEMONIC_A)

    const contentKey = generateContentKey()
    const wrapped = wrapKeyForRecipient(contentKey, deviceA.encryptionPublicKey)
    const unwrapped = unwrapKey(wrapped, deviceB.encryptionKey)

    expect(unwrapped).toEqual(contentKey)
  })

  it('backup payload is encrypted and not plain JSON', () => {
    const bundle = deriveKeysFromSeed(MNEMONIC_A)
    const backup = createKeyBackup(bundle)

    const decoded = new TextDecoder().decode(backup.encryptedPayload)
    expect(decoded.includes(bundle.did)).toBe(false)

    const plaintext = new TextEncoder().encode(JSON.stringify({ did: bundle.did }))
    const nonce = randomBytes(24)
    const ciphertext = encryptWithNonce(plaintext, bundle.backupKey, nonce)
    const decrypted = decryptWithNonce(ciphertext, bundle.backupKey, nonce)
    expect(new TextDecoder().decode(decrypted)).toContain(bundle.did)
  })

  it('createRecoveryShares reconstructs mnemonic with threshold shares', () => {
    const shares = createRecoveryShares(MNEMONIC_A, {
      totalShares: 5,
      threshold: 3,
      shareLabels: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve']
    })

    expect(shares).toHaveLength(5)
    expect(shares[0].label).toBe('Alice')

    const recovered = recoverFromShares([shares[0], shares[2], shares[4]])
    expect(recovered).toBe(MNEMONIC_A)
  })

  it('recoverFromShares fails with fewer than threshold shares', () => {
    const shares = createRecoveryShares(MNEMONIC_A, {
      totalShares: 4,
      threshold: 3
    })

    expect(() => recoverFromShares([shares[0], shares[1]])).toThrow('Need at least 3 shares, got 2')
  })

  it('recoverFromShares fails for mixed share groups', () => {
    const sharesA = createRecoveryShares(MNEMONIC_A, {
      totalShares: 4,
      threshold: 3
    })
    const sharesB = createRecoveryShares(MNEMONIC_B, {
      totalShares: 4,
      threshold: 3
    })

    expect(() => recoverFromShares([sharesA[0], sharesA[1], sharesB[2]])).toThrow(
      'Recovery shares are from different groups'
    )
  })
})
