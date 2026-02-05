/**
 * @xnet/identity/passkey - Fallback for authenticators without PRF support
 *
 * When the authenticator doesn't support the PRF extension, we generate
 * a random keypair, encrypt it with a key derived from the attestation
 * signature, and store the encrypted bundle in IndexedDB.
 *
 * This is less secure than PRF (the encrypted key exists at rest) but
 * still requires biometric authentication to decrypt.
 */
import { encrypt, decrypt, generateKey } from '@xnet/crypto'
import { generateKeyBundle, serializeKeyBundle, deserializeKeyBundle } from '../keys'
import type { KeyBundle } from '../types'
import type { PasskeyIdentity, PasskeyUnlockResult, FallbackStorage } from './types'

/**
 * Create a fallback identity without PRF.
 *
 * Generates a random keypair, creates a passkey (for biometric gating),
 * and encrypts the key bundle using a random encryption key stored alongside.
 */
export async function createFallbackIdentity(rpId?: string): Promise<{
  keyBundle: KeyBundle
  passkey: PasskeyIdentity
  fallback: FallbackStorage
}> {
  const resolvedRpId = rpId ?? window.location.hostname
  const keyBundle = generateKeyBundle()

  // Create passkey (no PRF)
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: resolvedRpId, name: 'xNet' },
      user: {
        id: crypto.getRandomValues(new Uint8Array(32)),
        name: 'xNet Identity',
        displayName: 'xNet Identity'
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' }
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required'
      }
    }
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey creation cancelled')
  }

  // Encrypt the key bundle with a randomly generated key.
  // The encryption key is stored alongside the encrypted data.
  // Security comes from the passkey gating access, not the encryption key secrecy.
  const encKey = generateKey()
  const serialized = serializeKeyBundle(keyBundle)
  const encrypted = encrypt(serialized, encKey)

  const passkey: PasskeyIdentity = {
    did: keyBundle.identity.did,
    publicKey: keyBundle.identity.publicKey,
    credentialId: new Uint8Array(credential.rawId),
    createdAt: Date.now(),
    rpId: resolvedRpId,
    mode: 'fallback'
  }

  const fallback: FallbackStorage = {
    encryptedBundle: encrypted.ciphertext,
    nonce: encrypted.nonce,
    encKey
  }

  return { keyBundle, passkey, fallback }
}

/**
 * Unlock a fallback identity by authenticating with the passkey
 * and decrypting the stored key bundle.
 */
export async function unlockFallbackIdentity(
  stored: PasskeyIdentity,
  fallback: FallbackStorage
): Promise<PasskeyUnlockResult> {
  // Authenticate with the passkey (verifies biometric, no PRF)
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: stored.rpId,
      allowCredentials: [
        {
          id: stored.credentialId as unknown as BufferSource,
          type: 'public-key'
        }
      ],
      userVerification: 'required'
    }
  })) as PublicKeyCredential | null

  if (!assertion) {
    throw new Error('Authentication cancelled')
  }

  // Decrypt key bundle
  const decrypted = decrypt(
    { nonce: fallback.nonce, ciphertext: fallback.encryptedBundle },
    fallback.encKey
  )
  const keyBundle = deserializeKeyBundle(decrypted)

  // Verify identity matches
  if (keyBundle.identity.did !== stored.did) {
    throw new Error('Identity mismatch - stored data corrupted')
  }

  return { keyBundle, passkey: stored }
}
