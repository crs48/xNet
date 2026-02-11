/**
 * @xnet/hub - Structured authorization error payloads.
 */

import type { AuthDenyReason, AuthTraceStep } from '@xnet/core'

export type HubAuthErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'TOKEN_EXPIRED' | 'TOKEN_REVOKED'

export type HubAuthError = {
  code: HubAuthErrorCode
  message: string
  action: string
  resource?: string
  debug?: {
    reason: AuthDenyReason
    trace?: AuthTraceStep[]
  }
}

export const createHubAuthError = (input: {
  code: HubAuthErrorCode
  message: string
  action: string
  resource?: string
  debug?: HubAuthError['debug']
}): HubAuthError => ({
  code: input.code,
  message: input.message,
  action: input.action,
  resource: input.resource,
  debug: input.debug
})
