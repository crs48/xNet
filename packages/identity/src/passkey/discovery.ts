/**
 * @xnet/identity/passkey - Cross-device passkey discovery
 *
 * Uses WebAuthn conditional mediation to detect whether the user
 * has an existing xNet passkey (possibly synced from another device
 * via iCloud Keychain, Google Password Manager, etc.).
 */
import { deriveKeyBundle } from '../keys'
import type { PasskeyIdentity, PasskeyUnlockResult } from './types'
import { deriveKeySeed, PRF_INPUT } from './derive'

// ─── Types ───────────────────────────────────────────────────

export interface DiscoveredPasskey {
  credentialId: Uint8Array
  rpId: string
  userHandle: Uint8Array | null
}

// ─── Discovery ───────────────────────────────────────────────

/**
 * Check if the user has an existing xNet passkey on this or another device.
 * Uses conditional mediation (passkey autofill UI) when available.
 *
 * Returns null if:
 * - Browser doesn't support conditional mediation
 * - No passkey exists for this RP
 * - User dismisses the prompt
 *
 * Note: This is non-blocking — it shows a passive autofill prompt,
 * not a modal dialog.
 */
export async function discoverExistingPasskey(rpId?: string): Promise<DiscoveredPasskey | null> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return null
  }

  // Check if conditional mediation is available
  const isAvailable =
    'isConditionalMediationAvailable' in PublicKeyCredential &&
    typeof PublicKeyCredential.isConditionalMediationAvailable === 'function'

  if (!isAvailable) {
    return null
  }

  const available = await (
    PublicKeyCredential as typeof PublicKeyCredential & {
      isConditionalMediationAvailable: () => Promise<boolean>
    }
  ).isConditionalMediationAvailable()

  if (!available) {
    return null
  }

  try {
    const resolvedRpId = rpId ?? window.location.hostname

    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: resolvedRpId,
        userVerification: 'required'
      },
      mediation: 'conditional' as CredentialMediationRequirement
    })) as PublicKeyCredential | null

    if (!credential) {
      return null
    }

    const response = credential.response as AuthenticatorAssertionResponse

    return {
      credentialId: new Uint8Array(credential.rawId),
      rpId: resolvedRpId,
      userHandle: response.userHandle ? new Uint8Array(response.userHandle) : null
    }
  } catch {
    // User cancelled or error — not a problem
    return null
  }
}

/**
 * Unlock an identity using a discovered passkey with PRF.
 *
 * This is used after discoverExistingPasskey() finds a credential.
 * It triggers a biometric prompt and derives the key from the PRF output.
 */
export async function unlockDiscoveredPasskey(
  discovered: DiscoveredPasskey
): Promise<PasskeyUnlockResult> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: discovered.rpId,
      allowCredentials: [
        {
          id: discovered.credentialId as unknown as BufferSource,
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
    throw new Error('PRF extension not available on this passkey')
  }

  const prfOutput = new Uint8Array(extensions.prf.results.first)
  const seed = await deriveKeySeed(prfOutput)
  const keyBundle = deriveKeyBundle(seed)

  const passkey: PasskeyIdentity = {
    did: keyBundle.identity.did,
    publicKey: keyBundle.identity.publicKey,
    credentialId: discovered.credentialId,
    createdAt: Date.now(),
    rpId: discovered.rpId,
    mode: 'prf'
  }

  return { keyBundle, passkey }
}
