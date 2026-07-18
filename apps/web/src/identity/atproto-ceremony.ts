/**
 * apps/web — ATProto login-door ceremony (0322/0338).
 *
 * Implements the `RunAtprotoCeremony` contract from `@xnetjs/react` against the
 * real `@atproto/oauth-client-browser`. It is the *host* half of the login door:
 * `@xnetjs/react` stays dependency-light and only knows the contract; this file
 * carries the OAuth 2.1 / PKCE / DPoP machinery.
 *
 * Flow: popup sign-in with the user's handle → prove control of `did:plc` →
 * return the DID + handle so the machine can run the *existing* passkey-create
 * flow → then `writeBinding` signs `net.x.identity.binding` with the new xNet
 * key and `putRecord`s it into the user's repo via the DPoP-bound session.
 *
 * The client metadata is the static document served at
 * https://xnet.fyi/oauth/atproto-client.json (site/public/oauth/…).
 */
import type { RunAtprotoCeremony } from '@xnetjs/react'
import { createAtprotoBinding, ATPROTO_BINDING_COLLECTION } from '@xnetjs/identity'
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'

const CLIENT_METADATA_URL = 'https://xnet.fyi/oauth/atproto-client.json'
const BINDING_RKEY = 'self'

/**
 * Where the ceremony stashes the linked identity so the authenticated app
 * (which remounts after onboarding) can pre-fill the profile once. Consumed
 * and cleared by `useEnsureAtprotoLink`.
 */
export const ATPROTO_LINK_STASH_KEY = 'xnet.atproto.pending-link'

export interface PendingAtprotoLink {
  atprotoDid: string
  atprotoHandle: string
  displayName?: string
}

export function readPendingAtprotoLink(): PendingAtprotoLink | null {
  try {
    const raw = sessionStorage.getItem(ATPROTO_LINK_STASH_KEY)
    return raw ? (JSON.parse(raw) as PendingAtprotoLink) : null
  } catch {
    return null
  }
}

export function clearPendingAtprotoLink(): void {
  try {
    sessionStorage.removeItem(ATPROTO_LINK_STASH_KEY)
  } catch {
    // best-effort
  }
}

let clientPromise: Promise<BrowserOAuthClient> | null = null

function getClient(): Promise<BrowserOAuthClient> {
  if (!clientPromise) {
    clientPromise = BrowserOAuthClient.load({
      clientId: CLIENT_METADATA_URL,
      handleResolver: 'https://bsky.social'
    })
  }
  return clientPromise
}

/**
 * The web ceremony. Pass to `<OnboardingProvider runAtprotoCeremony={…}>` to
 * enable the "Continue with Bluesky (or any PDS)" door.
 */
export const runAtprotoCeremony: RunAtprotoCeremony = async ({ handleOrPds }) => {
  const client = await getClient()
  const session = await client.signInPopup(handleOrPds)
  const atprotoDid = session.did

  // Best-effort handle + display name from the profile record (non-fatal).
  const atprotoHandle = handleOrPds.replace(/^@/, '').trim().toLowerCase()
  let displayName: string | undefined
  try {
    const res = await session.fetchHandler(
      `/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(atprotoDid)}` +
        `&collection=app.bsky.actor.profile&rkey=self`
    )
    if (res.ok) {
      const body = (await res.json()) as { value?: { displayName?: string } }
      displayName = body.value?.displayName
    }
  } catch {
    // Profile lookup is cosmetic; ignore failures.
  }

  // Stash so the authenticated app can pre-fill the profile after remount.
  try {
    sessionStorage.setItem(
      ATPROTO_LINK_STASH_KEY,
      JSON.stringify({ atprotoDid, atprotoHandle, displayName } satisfies PendingAtprotoLink)
    )
  } catch {
    // Non-fatal — prefill is a convenience.
  }

  return {
    atprotoDid,
    atprotoHandle,
    displayName,
    // Called after the xNet passkey identity exists: sign + write the binding.
    writeBinding: async (xnetDid: string, signingKey: Uint8Array) => {
      const record = createAtprotoBinding({ xnetDid, signingKey, atprotoDid })
      const res = await session.fetchHandler('/xrpc/com.atproto.repo.putRecord', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repo: atprotoDid,
          collection: ATPROTO_BINDING_COLLECTION,
          rkey: BINDING_RKEY,
          record
        })
      })
      if (!res.ok) {
        throw new Error(`Failed to write binding record (${res.status})`)
      }
    }
  }
}
