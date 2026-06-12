/**
 * Shared identity manager singleton for the web app.
 *
 * Lives outside App.tsx so UI deep in the router tree (e.g. settings)
 * can trigger logout without prop drilling.
 */
import { createIdentityManager } from '@xnetjs/identity'

export const identityManager = createIdentityManager()

/**
 * End the unlocked session on this device and return to the
 * authentication screen. Keeps the identity and all local data —
 * the user signs back in with their passkey.
 */
export async function logout(): Promise<void> {
  await identityManager.lock()
  // Reload tears down providers holding key material and lands on the
  // unlock screen (no resumable session exists anymore).
  window.location.reload()
}
