/**
 * @xnet/hub - UCAN capability helpers.
 */

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

export type { HubCapability }
