/**
 * @xnet/identity/passkey - Passkey identity creation with PRF extension
 */
import type { PasskeyIdentity, PasskeyCreateOptions, PasskeyUnlockResult } from './types'
import { deriveKeyBundle } from '../keys'
import { deriveKeySeed, PRF_INPUT } from './derive'

/**
 * Create a new passkey identity using WebAuthn with the PRF extension.
 *
 * This prompts the user for biometric authentication (Touch ID / Face ID),
 * then derives an Ed25519 keypair from the PRF output. The private key
 * is never stored — it's re-derived each time via `unlockPasskeyIdentity()`.
 *
 * @throws {Error} If passkey creation is cancelled by the user
 * @throws {Error} If the authenticator doesn't support the PRF extension
 *
 * @example
 * const result = await createPasskeyIdentity({ displayName: 'My xNet' })
 * console.log(result.keyBundle.identity.did) // did:key:z6Mk...
 */
export async function createPasskeyIdentity(
  options: PasskeyCreateOptions = {}
): Promise<PasskeyUnlockResult> {
  const {
    displayName = 'xNet Identity',
    rpId = window.location.hostname,
    userVerification = 'required'
  } = options

  // Random user ID (not the DID — we don't know it yet)
  const userId = crypto.getRandomValues(new Uint8Array(32))

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: {
        id: rpId,
        name: 'xNet'
      },
      user: {
        id: userId,
        name: displayName,
        displayName
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' }, // ES256 (P-256)
        { alg: -257, type: 'public-key' } // RS256 (fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification
      },
      extensions: {
        prf: {
          eval: {
            first: PRF_INPUT
          }
        }
      } as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error('Passkey creation cancelled')
  }

  // Extract PRF output
  const extensions = credential.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } }
  }

  if (!extensions.prf?.results?.first) {
    throw new Error('PRF extension not supported by this authenticator')
  }

  const prfOutput = new Uint8Array(extensions.prf.results.first)

  // Derive Ed25519 seed via HKDF, then derive full key bundle
  const seed = await deriveKeySeed(prfOutput)
  const keyBundle = deriveKeyBundle(seed)

  const passkey: PasskeyIdentity = {
    did: keyBundle.identity.did,
    publicKey: keyBundle.identity.publicKey,
    credentialId: new Uint8Array(credential.rawId),
    createdAt: Date.now(),
    rpId,
    mode: 'prf'
  }

  return { keyBundle, passkey }
}
