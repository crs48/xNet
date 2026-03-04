import type { AuthAction, AuthDecision, AuthDenyReason, DID } from '@xnetjs/core'

/**
 * Error thrown when a local mutation fails authorization checks.
 */
export class PermissionError extends Error {
  readonly code = 'PERMISSION_DENIED'
  readonly action: AuthAction
  readonly nodeId: string
  readonly subject: DID
  readonly reasons: AuthDenyReason[]
  readonly roles: string[]
  readonly decision: AuthDecision

  constructor(decision: AuthDecision) {
    const roleInfo =
      decision.roles.length > 0
        ? `You have roles [${decision.roles.join(', ')}]`
        : 'You have no roles'

    super(
      `Permission denied: ${roleInfo} but action '${decision.action}' is not permitted. ` +
        `Reasons: ${decision.reasons.join(', ')}`
    )

    this.name = 'PermissionError'
    this.action = decision.action
    this.nodeId = decision.resource
    this.subject = decision.subject
    this.reasons = decision.reasons
    this.roles = decision.roles
    this.decision = decision
  }
}
