/**
 * Hub UCAN authentication for `XNetProvider` (0276): mints short-lived
 * capability tokens from the local signing key, or passes through a static
 * token when one is configured.
 *
 * Least-privilege minting (0307-B): every action a client legitimately needs
 * is enumerated explicitly — no `hub/*`-style action wildcards. The old
 * wildcard grant implicitly self-issued `hub/admin`, `telemetry/read`,
 * `notify/push`, `crawl/write`, and `federation/register`; none of those are
 * client capabilities and none are minted here. Resource scope (`with`)
 * remains `*` for data-plane actions because room-level access is decided
 * hub-side (grant index, Space cascade, deny list — `authorizeRoomAction`),
 * not by the self-issued token. Tokens also carry a per-mint nonce so the
 * hub's revocation list can kill exactly one token by id.
 */

import { createUCAN } from '@xnetjs/identity'
import { useCallback } from 'react'

const HUB_CAPABILITIES = [
  // Connection + rooms: room-level authorization happens hub-side.
  { with: '*', can: 'hub/connect' },
  { with: '*', can: 'hub/signal' },
  { with: '*', can: 'hub/relay' },
  { with: '*', can: 'hub/query' },
  { with: '*', can: 'hub/backup' },
  // Per-DID stores: backup blobs, files, query, search shards.
  { with: '*', can: 'backup/read' },
  { with: '*', can: 'backup/write' },
  { with: '*', can: 'backup/delete' },
  { with: '*', can: 'files/read' },
  { with: '*', can: 'files/write' },
  { with: '*', can: 'query/read' },
  { with: '*', can: 'index/write' },
  // Calls (0167) + push registration (0168) + own-usage telemetry (0187).
  { with: '*', can: 'call/join' },
  { with: '*', can: 'call/signal' },
  { with: '*', can: 'notify/register' },
  { with: '*', can: 'telemetry/ingest' }
] as const

const HUB_TOKEN_TTL_SECONDS = 60 * 60 * 24

const mintNonce = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function useHubAuthToken(input: {
  authorDID: string | undefined
  signingKey: Uint8Array | undefined
  hubUrl: string | null
  autoAuth: boolean
  staticHubAuthToken: string
}): () => Promise<string> {
  const { authorDID, signingKey, hubUrl, autoAuth, staticHubAuthToken } = input

  return useCallback(async (): Promise<string> => {
    if (staticHubAuthToken) return staticHubAuthToken
    if (!hubUrl || !autoAuth) return ''
    if (!authorDID || !signingKey) {
      throw new Error('Missing authorDID/signingKey for hub auth')
    }

    return createUCAN({
      issuer: authorDID,
      issuerKey: signingKey,
      // The hub accepts its DID or its URL as audience (audienceAccepted);
      // the URL is what the client reliably knows before connecting.
      audience: hubUrl,
      capabilities: HUB_CAPABILITIES as unknown as Array<{ with: string; can: string }>,
      expiration: Math.floor(Date.now() / 1000) + HUB_TOKEN_TTL_SECONDS,
      nonce: mintNonce()
    })
  }, [authorDID, autoAuth, signingKey, hubUrl, staticHubAuthToken])
}
