/**
 * @xnetjs/hub - Unified room authorization for the WebSocket message pump.
 *
 * All WS handlers resolve room access through ONE path: `authorizeRoomAction`
 * (single topic) or `requireRoomAuth` (topic list). The POLICY here is moved
 * verbatim from server.ts (exploration 0276 Theme 2) — only the call sites
 * were unified.
 *
 * The handlers historically invoked this in four subtly different inline
 * forms. The differences are in the DENY handling, not the decision itself,
 * and each is preserved explicitly at its call site:
 *  1. node-sync-request / publish-wrapped sync-request (`hub/relay`):
 *     deny → `node-error` response, connection stays open, no abuse telemetry.
 *  2. node-clear + publish node-change (`hub/relay`): deny → abuse telemetry
 *     (`reportUnauthorizedRemoteWrite`) THEN `node-error`, connection stays open.
 *  3. subscribe under `config.auth` (`hub/signal`, every topic via
 *     `requireRoomAuth`): deny → `auth-denied` response + close(4403).
 *  4. publish to an `xnet-doc-*` topic under `config.auth` (`hub/signal`):
 *     deny → abuse telemetry + `auth-denied` + close(4403)
 *     (`denyAndCloseSocket`).
 */

import type { AuthSession } from '../auth/ucan'
import type { Metrics } from '../middleware/metrics'
import type { ShareAccessService } from '../services/share-access'
import type { HubStorage } from '../storage/interface'
import type { WebSocket } from 'ws'
import { hasHubCapability } from '../auth/capabilities'
import { HUB_METRICS } from '../middleware/metrics'
import { profileSubjectFromDocId } from '../services/share-access'
import { buildWsError } from './errors'

export const topicToResource = (topic: string): string =>
  topic.startsWith('xnet-doc-') ? topic.slice('xnet-doc-'.length) : topic

export type AuthzCode = 'UNAUTHORIZED' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED'

export type AuthzDecision = {
  allowed: boolean
  code?: AuthzCode
  message?: string
  source?: 'capability' | 'grant-index' | 'space-grant' | 'profile-public'
}

export type RoomAuthAction = 'hub/relay' | 'hub/signal'

const isTokenExpired = (session: AuthSession): boolean => {
  const exp = session.token?.exp
  if (typeof exp !== 'number') {
    return false
  }
  return exp <= Math.floor(Date.now() / 1000)
}

const logAuthDecision = (input: {
  allowed: boolean
  did: string
  action: string
  resource: string
  source?: 'capability' | 'grant-index' | 'space-grant' | 'profile-public'
  code?: AuthzCode
  reason?: string
}): void => {
  const base = `[AuthZ] ${input.allowed ? 'allow' : 'deny'} ${input.action} resource=${input.resource} did=${input.did}`
  if (input.allowed) {
    console.log(`${base} source=${input.source ?? 'capability'}`)
    return
  }
  console.warn(
    `${base} code=${input.code ?? 'UNAUTHORIZED'} reason=${input.reason ?? 'unauthorized'}`
  )
}

export const authorizeRoomAction = async (input: {
  storage: HubStorage
  session: AuthSession
  action: RoomAuthAction
  topic: string
  shareAccess?: ShareAccessService
}): Promise<AuthzDecision> => {
  const resource = topicToResource(input.topic)

  if (isTokenExpired(input.session)) {
    const decision: AuthzDecision = {
      allowed: false,
      code: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired'
    }
    logAuthDecision({
      allowed: false,
      did: input.session.did,
      action: input.action,
      resource,
      code: decision.code,
      reason: decision.message
    })
    return decision
  }

  // A DID whose share grants were all revoked ("remove access") is denied
  // outright — wildcard self-issued capabilities do not restore access.
  if (
    input.shareAccess &&
    input.session.did !== 'did:key:anonymous' &&
    (await input.shareAccess.isDenied(input.session.did, resource))
  ) {
    const decision: AuthzDecision = {
      allowed: false,
      code: 'TOKEN_REVOKED',
      message: 'Access to this resource has been revoked'
    }
    logAuthDecision({
      allowed: false,
      did: input.session.did,
      action: input.action,
      resource,
      code: decision.code,
      reason: decision.message
    })
    return decision
  }

  // Profile rooms (`profile-<did>`) are hub-published identity: any
  // authenticated DID may subscribe so shared content can render author
  // names/avatars, regardless of grants or capabilities. Writes stay
  // subject-only — enforced on the write paths (canWriteNodeChange /
  // canWriteYjs in ShareAccessService).
  if (input.session.did !== 'did:key:anonymous' && profileSubjectFromDocId(resource)) {
    logAuthDecision({
      allowed: true,
      did: input.session.did,
      action: input.action,
      resource,
      source: 'profile-public'
    })
    return { allowed: true, source: 'profile-public' }
  }

  if (
    hasHubCapability(input.session.capabilities, input.action, resource) ||
    hasHubCapability(input.session.capabilities, 'hub/signal', resource)
  ) {
    logAuthDecision({
      allowed: true,
      did: input.session.did,
      action: input.action,
      resource,
      source: 'capability'
    })
    return { allowed: true, source: 'capability' }
  }

  const grantedDocIds = await input.storage.listGrantedDocIds(input.session.did)
  if (grantedDocIds.includes(resource)) {
    logAuthDecision({
      allowed: true,
      did: input.session.did,
      action: input.action,
      resource,
      source: 'grant-index'
    })
    return { allowed: true, source: 'grant-index' }
  }

  // Container (Space) membership: a member of an ancestor Space may access nodes
  // beneath it even without a direct per-doc grant (exploration 0179).
  if (
    input.shareAccess &&
    input.session.did !== 'did:key:anonymous' &&
    (await input.shareAccess.canAccessNode(input.session.did, resource))
  ) {
    logAuthDecision({
      allowed: true,
      did: input.session.did,
      action: input.action,
      resource,
      source: 'space-grant'
    })
    return { allowed: true, source: 'space-grant' }
  }

  if (Array.isArray(input.session.token?.prf) && input.session.token.prf.length > 0) {
    const decision: AuthzDecision = {
      allowed: false,
      code: 'TOKEN_REVOKED',
      message: 'Grant token is no longer active for this resource'
    }
    logAuthDecision({
      allowed: false,
      did: input.session.did,
      action: input.action,
      resource,
      code: decision.code,
      reason: decision.message
    })
    return decision
  }

  const decision: AuthzDecision = {
    allowed: false,
    code: 'UNAUTHORIZED',
    message: 'Capability and grant index checks denied access'
  }
  logAuthDecision({
    allowed: false,
    did: input.session.did,
    action: input.action,
    resource,
    code: decision.code,
    reason: decision.message
  })
  return decision
}

export type RoomAuthResult = { ok: true } | { ok: false; topic: string; decision: AuthzDecision }

/**
 * Authorize an action against every topic in a list; stops at the first denial
 * (formerly `checkRoomAuth`, which was hardwired to `hub/signal`).
 */
export const requireRoomAuth = async (input: {
  storage: HubStorage
  session: AuthSession
  action: RoomAuthAction
  topics: string[]
  shareAccess?: ShareAccessService
}): Promise<RoomAuthResult> => {
  for (const topic of input.topics) {
    const decision = await authorizeRoomAction({
      storage: input.storage,
      session: input.session,
      action: input.action,
      topic,
      shareAccess: input.shareAccess
    })
    if (!decision.allowed) {
      return { ok: false, topic, decision }
    }
  }
  return { ok: true }
}

/** Send an `auth-denied` error and close the socket with the room-auth code. */
export const denyAndCloseSocket = (
  ws: WebSocket,
  decision: AuthzDecision,
  action: RoomAuthAction,
  topic: string,
  metrics: Metrics
): void => {
  ws.send(
    JSON.stringify(
      buildWsError({
        kind: 'auth-denied',
        code: decision.code ?? 'UNAUTHORIZED',
        action,
        resource: topicToResource(topic),
        error: decision.message ?? 'Insufficient capabilities for room'
      })
    )
  )
  metrics.increment(HUB_METRICS.WS_MESSAGES_SENT)
  ws.close(4403, decision.message ?? 'Insufficient capabilities for room')
}
