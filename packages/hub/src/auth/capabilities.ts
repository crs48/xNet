/**
 * @xnetjs/hub - UCAN capability helpers.
 */

import { AUTH_ACTIONS, type AuthAction } from '@xnetjs/core'

type HubCapability = {
  with: string
  can: string
}

export type HubAction =
  | 'hub/connect'
  | 'hub/signal'
  | 'hub/relay'
  | 'hub/backup'
  | 'hub/query'
  | 'hub/admin'
  | 'call/join'
  | 'call/signal'
  | 'notify/register'
  | 'notify/push'
  | 'telemetry/ingest'
  | 'telemetry/read'
  | 'audit/read'

/** Canonical bridge from hub actions to AuthAction. */
export const HUB_ACTION_MAP: Record<HubAction, AuthAction> = {
  'hub/connect': 'read',
  'hub/signal': 'write',
  'hub/relay': 'write',
  'hub/backup': 'write',
  'hub/query': 'read',
  'hub/admin': 'admin',
  // Calls (exploration 0167): joining/signaling a call room rides the
  // signaling broker; SFU token minting would gate on call/join.
  'call/join': 'write',
  'call/signal': 'write',
  // Push (exploration 0168): registering device push endpoints and
  // triggering wakeups.
  'notify/register': 'write',
  'notify/push': 'write',
  // Telemetry (exploration 0187): ingest is a write (any authenticated identity
  // may submit its own telemetry; the hub hashes the DID), reads are admin-only
  // (an aggregate of everyone's usage).
  'telemetry/ingest': 'write',
  'telemetry/read': 'admin',
  // Audit (exploration 0337): reading another author's full change history is
  // operator territory; self-reads are always allowed by the route.
  'audit/read': 'admin'
}

/** Check if a granted action pattern covers the requested action. */
export const actionAllows = (granted: string, requested: string): boolean => {
  if (granted === '*' || granted === requested) return true
  if (granted.endsWith('/*')) {
    const prefix = granted.slice(0, -2)
    return requested.startsWith(prefix)
  }
  return false
}

/** Check if a granted resource pattern covers the requested resource. */
export const resourceAllows = (granted: string, requested: string): boolean => {
  if (granted === '*') return true
  if (granted === requested) return true
  if (granted.endsWith('/*')) {
    const prefix = granted.slice(0, -2)
    return requested.startsWith(prefix)
  }
  return false
}

export const hasHubCapability = (
  capabilities: HubCapability[],
  action: HubAction,
  resource?: string
): boolean =>
  capabilities.some((cap) => {
    if (!actionAllows(cap.can, action)) return false
    if (!resource) return true
    return resourceAllows(cap.with, resource)
  })

/**
 * Verify whether a UCAN capability can perform a hub action.
 * Supports canonical `xnet/<action>` and legacy `hub/<action>` forms.
 */
export const verifyHubCapability = (
  capabilities: HubCapability[],
  hubAction: HubAction
): boolean => {
  const canonicalAction = HUB_ACTION_MAP[hubAction]
  if (!AUTH_ACTIONS.includes(canonicalAction)) return false

  const canonicalCapability = `xnet/${canonicalAction}`

  return capabilities.some((cap) => {
    if (cap.can === '*' || cap.can === 'xnet/*') return true
    if (cap.can === canonicalCapability || cap.can === hubAction) return true
    return actionAllows(cap.can, canonicalCapability) || actionAllows(cap.can, hubAction)
  })
}

export type { HubCapability }
