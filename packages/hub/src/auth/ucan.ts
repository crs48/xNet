/**
 * @xnet/hub - UCAN authentication helpers.
 */

import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import type { HubConfig } from '../types'
import { getCapabilities, type UCANToken, verifyUCAN } from '@xnet/identity'

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

const actionAllows = (granted: string, requested: string): boolean => {
  if (granted === '*' || granted === requested) return true
  if (granted.endsWith('/*')) {
    const prefix = granted.slice(0, -2)
    return requested.startsWith(prefix)
  }
  return false
}

const resourceAllows = (granted: string, requested: string): boolean => {
  if (granted === '*') return true
  if (granted === requested) return true
  if (granted.endsWith('/*')) {
    const prefix = granted.slice(0, -2)
    return requested.startsWith(prefix)
  }
  return false
}

const createAuthContext = (session: AuthSession): AuthContext => ({
  did: session.did,
  can: (action: string, resource: string) =>
    session.capabilities.some(
      (cap) => actionAllows(cap.can, action) && resourceAllows(cap.with, resource)
    )
})

const getTokenFromRequest = (req: IncomingMessage): string | null => {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  return url.searchParams.get('token')
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

export const authenticateHttpRequest = (authHeader: string | null, config: HubConfig): AuthContext | null => {
  if (!config.auth) {
    return createAuthContext(createAnonymousSession())
  }

  const token = parseBearerToken(authHeader)
  if (!token) return null

  const result = verifyUCAN(token)
  if (!result.valid || !result.payload) return null

  return createAuthContext({
    did: result.payload.iss,
    capabilities: getCapabilities(result.payload),
    token: result.payload
  })
}
