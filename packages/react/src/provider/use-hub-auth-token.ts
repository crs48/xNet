/**
 * Hub UCAN authentication for `XNetProvider` (0276): mints short-lived
 * capability tokens from the local signing key, or passes through a static
 * token when one is configured.
 */

import { createUCAN } from '@xnetjs/identity'
import { useCallback } from 'react'

const HUB_CAPABILITIES = [
  { with: '*', can: 'hub/*' },
  { with: '*', can: 'backup/*' },
  { with: '*', can: 'files/*' },
  { with: '*', can: 'query/*' },
  { with: '*', can: 'index/*' }
] as const

const HUB_TOKEN_TTL_SECONDS = 60 * 60 * 24

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
      audience: hubUrl,
      capabilities: HUB_CAPABILITIES as unknown as Array<{ with: string; can: string }>,
      expiration: Math.floor(Date.now() / 1000) + HUB_TOKEN_TTL_SECONDS
    })
  }, [authorDID, autoAuth, signingKey, hubUrl, staticHubAuthToken])
}
