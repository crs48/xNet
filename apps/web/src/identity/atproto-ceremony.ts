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
 * flow → then `writeBinding` signs `fyi.xnet.identity.binding` with the new xNet
 * key and `putRecord`s it into the user's repo via the DPoP-bound session.
 *
 * The client metadata is the static document served at
 * https://xnet.fyi/oauth/atproto-client.json (site/public/oauth/…).
 */
import type { RunAtprotoCeremony } from '@xnetjs/react'
import { createAtprotoBinding, ATPROTO_BINDING_COLLECTION } from '@xnetjs/identity'
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'

/**
 * Two client metadata documents, because the OAuth scope lives *in* the
 * document and `BrowserOAuthClient.load` fetches exactly one of them.
 *
 * The primary document asks for the granular `repo:` scope that actually
 * authorises the `putRecord` below. Older self-hosted PDSes reject the granular
 * scope syntax in `client-metadata.json` outright
 * (bluesky-social/atproto#4118), so a single document cannot carry both — a
 * PDS that chokes on `repo:` chokes on it whatever we go on to request. The
 * compat document asks for the legacy `transition:generic` scope, which every
 * PDS understands and which also covers the write.
 *
 * Order matters: granular first (least privilege), compat only on rejection.
 */
const CLIENT_METADATA_URL = 'https://xnet.fyi/oauth/atproto-client.json'
const COMPAT_CLIENT_METADATA_URL = 'https://xnet.fyi/oauth/atproto-client-compat.json'
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

const clientCache = new Map<string, Promise<BrowserOAuthClient>>()

function getClient(clientId: string): Promise<BrowserOAuthClient> {
  let cached = clientCache.get(clientId)
  if (!cached) {
    cached = BrowserOAuthClient.load({ clientId, handleResolver: 'https://bsky.social' })
    clientCache.set(clientId, cached)
    // A failed load must not poison the cache — the compat retry needs a clean
    // slate, and a transient network failure should not disable sign-in.
    cached.catch(() => clientCache.delete(clientId))
  }
  return cached
}

/**
 * Does this failure look like the PDS rejecting our scope *syntax* rather than
 * the user declining, the popup closing, or the network dropping?
 *
 * Deliberately narrow: retrying on a user cancellation would reopen a popup
 * they just dismissed, and retrying on a network error would double the wait
 * before the real error surfaces. Anything we do not recognise propagates.
 */
export function isScopeSyntaxRejection(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  if (!message) return false
  // User-driven and transport failures are never scope problems.
  if (/abort|cancel|closed|denied|timeout|network|offline/.test(message)) return false
  return /scope|invalid_client_metadata|invalid_scope|unsupported|client metadata/.test(message)
}

/**
 * Sign in against the granular-scope client, falling back to the compat client
 * when the PDS rejects the granular scope syntax.
 */
async function signInWithFallback(handleOrPds: string) {
  try {
    const client = await getClient(CLIENT_METADATA_URL)
    return await client.signInPopup(handleOrPds)
  } catch (err) {
    if (!isScopeSyntaxRejection(err)) throw err
    console.warn(
      '[xnet] PDS rejected the granular OAuth scope; retrying with transition:generic.',
      err
    )
    const compat = await getClient(COMPAT_CLIENT_METADATA_URL)
    return await compat.signInPopup(handleOrPds)
  }
}

/**
 * The web ceremony. Pass to `<OnboardingProvider runAtprotoCeremony={…}>` to
 * enable the "Continue with Bluesky (or any PDS)" door.
 */
export const runAtprotoCeremony: RunAtprotoCeremony = async ({ handleOrPds }) => {
  const session = await signInWithFallback(handleOrPds)
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
