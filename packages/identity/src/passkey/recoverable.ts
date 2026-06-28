/**
 * @xnetjs/identity/passkey - Enroll a *recoverable* identity (exploration 0243).
 *
 * Unlike the PRF path (where the passkey derives the key and nothing is stored), a
 * recoverable identity is born from a recovery phrase: its key bundle is derived from
 * the phrase, the passkey only *gates* access, and both the bundle and the phrase are
 * stored encrypted at rest (the same model as the non-PRF fallback). This is opt-in —
 * the user accepts a backed-up identity in exchange for being able to recover it on any
 * device by typing the phrase.
 */
import type { SealedRecoveryPhrase } from '../recoverable'
import type { HybridKeyBundle, DID } from '../types'
import type { PasskeyIdentity, FallbackStorage } from './types'
import { encrypt, generateKey } from '@xnetjs/crypto'
import { serializeKeyBundleToBinary } from '../key-bundle-storage'
import { sealRecoveryPhrase } from '../recoverable'

export interface RecoverableEnrollment {
  keyBundle: HybridKeyBundle
  passkey: PasskeyIdentity
  fallback: FallbackStorage
  recovery: SealedRecoveryPhrase
}

/**
 * Create a passkey that gates a phrase-derived `bundle`, encrypt the bundle at rest,
 * and seal the `phrase` with the same key so it can be revealed later. The passkey is
 * created without PRF (it only verifies the user); recovery comes from the phrase.
 */
export async function enrollRecoverableIdentity(
  bundle: HybridKeyBundle,
  phrase: string,
  rpId?: string
): Promise<RecoverableEnrollment> {
  const resolvedRpId = rpId ?? window.location.hostname

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

  // One key encrypts both the bundle and the phrase; stored alongside (same security
  // model as fallback: the passkey gates the app, not the key's secrecy).
  const encKey = generateKey()
  const encrypted = encrypt(serializeKeyBundleToBinary(bundle), encKey)
  const recovery = sealRecoveryPhrase(phrase, encKey)

  const passkey: PasskeyIdentity = {
    did: bundle.identity.did as DID,
    publicKey: bundle.identity.publicKey,
    pqPublicKey: bundle.pqPublicKey,
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

  return { keyBundle: bundle, passkey, fallback, recovery }
}
