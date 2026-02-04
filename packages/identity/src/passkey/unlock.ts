/**
 * @xnet/identity/passkey - Unlock an existing passkey identity
 */
import { deriveKeyBundle } from '../keys'
import type { PasskeyIdentity, PasskeyUnlockResult } from './types'
import { deriveKeySeed, PRF_INPUT } from './derive'

/**
 * Unlock an existing passkey identity by re-deriving the key from PRF output.
 *
 * Prompts the user for biometric authentication, then verifies that the
 * derived key matches the stored public key / DID.
 *
 * @throws {Error} If authentication is cancelled
 * @throws {Error} If PRF extension is not available
 * @throws {Error} If the derived key doesn't match (wrong passkey used)
 *
 * @example
 * const stored = await getStoredPasskey()
 * const result = await unlockPasskeyIdentity(stored)
 * // result.keyBundle.signingKey is the same every time
 */
export async function unlockPasskeyIdentity(stored: PasskeyIdentity): Promise<PasskeyUnlockResult> {
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
      userVerification: 'required',
      extensions: {
        prf: {
          eval: {
            first: PRF_INPUT
          }
        }
      } as AuthenticationExtensionsClientInputs
    }
  })) as PublicKeyCredential | null

  if (!assertion) {
    throw new Error('Authentication cancelled')
  }

  const extensions = assertion.getClientExtensionResults() as {
    prf?: { results?: { first?: ArrayBuffer } }
  }

  if (!extensions.prf?.results?.first) {
    throw new Error('PRF extension not available')
  }

  const prfOutput = new Uint8Array(extensions.prf.results.first)
  const seed = await deriveKeySeed(prfOutput)
  const keyBundle = deriveKeyBundle(seed)

  // Verify we derived the same identity
  if (keyBundle.identity.did !== stored.did) {
    throw new Error('Identity mismatch - wrong passkey used')
  }

  return { keyBundle, passkey: stored }
}
