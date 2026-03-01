/**
 * @xnet/hub - UCAN authentication helpers.
 */

import type { HubConfig } from '../types'
import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { getCapabilities, type UCANToken, verifyUCAN } from '@xnet/identity'
import { actionAllows, resourceAllows } from './capabilities'

export type AuthSession = {
  did: string
  capabilities: Array<{ with: string; can: string }>
  token: UCANToken | null
}

export type AuthContext = {
  did: string
  can: (action: string, resource: string) => boolean
}

const sessions = new Map<WebSocket, AuthSession>()

const createAnonymousSession = (): AuthSession => ({
  did: 'did:key:anonymous',
  capabilities: [{ with: '*', can: '*' }],
  token: null
})

const createAuthContext = (session: AuthSession): AuthContext => ({
  did: session.did,
  can: (action: string, resource: string) =>
    session.capabilities.some(
      (cap) => actionAllows(cap.can, action) && resourceAllows(cap.with, resource)
    )
})

export const toAuthContext = (session: AuthSession): AuthContext => createAuthContext(session)

const parseWebSocketProtocols = (value: string | string[] | undefined): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => entry.split(','))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

const getTokenFromRequest = (req: IncomingMessage): string | null => {
  const authHeader = req.headers.authorization
  if (typeof authHeader === 'string') {
    const bearer = parseBearerToken(authHeader)
    if (bearer) {
      return bearer
    }
  }

  const protocols = parseWebSocketProtocols(req.headers['sec-websocket-protocol'])
  const authProtocol = protocols.find((entry) => entry.startsWith('xnet-auth.'))
  if (!authProtocol) {
    return null
  }

  const token = authProtocol.slice('xnet-auth.'.length)
  return token.length > 0 ? token : null
}

/**
 * Authenticate a WebSocket connection via UCAN token.
 */
export const authenticateConnection = async (
  ws: WebSocket,
  req: IncomingMessage,
  config: HubConfig
): Promise<AuthSession | null> => {
  if (!config.auth) {
    const session = createAnonymousSession()
    sessions.set(ws, session)
    return session
  }

  const token = getTokenFromRequest(req)
  if (!token) {
    ws.close(4401, 'Missing UCAN token')
    return null
  }

  const result = verifyUCAN(token)
  if (!result.valid || !result.payload) {
    ws.close(4401, `Invalid UCAN: ${result.error ?? 'unknown error'}`)
    return null
  }

  // Verify audience matches this hub's DID (if configured)
  if (config.hubDid && result.payload.aud !== config.hubDid) {
    ws.close(4401, 'UCAN audience does not match this hub')
    return null
  }

  const session: AuthSession = {
    did: result.payload.iss,
    capabilities: getCapabilities(result.payload),
    token: result.payload
  }
  sessions.set(ws, session)
  return session
}

export const getSession = (ws: WebSocket): AuthSession | null => sessions.get(ws) ?? null

export const removeSession = (ws: WebSocket): void => {
  sessions.delete(ws)
}

const parseBearerToken = (value: string | null): string | null => {
  if (!value) return null
  const [scheme, token] = value.split(' ')
  if (!scheme || !token) return null
  if (scheme.toLowerCase() !== 'bearer') return null
  return token.trim()
}

export const authenticateHttpRequest = (
  authHeader: string | null,
  config: HubConfig
): AuthContext | null => {
  if (!config.auth) {
    return createAuthContext(createAnonymousSession())
  }

  const token = parseBearerToken(authHeader)
  if (!token) return null

  const result = verifyUCAN(token)
  if (!result.valid || !result.payload) return null

  // Verify audience matches this hub's DID (if configured)
  if (config.hubDid && result.payload.aud !== config.hubDid) return null

  return createAuthContext({
    did: result.payload.iss,
    capabilities: getCapabilities(result.payload),
    token: result.payload
  })
}
