/**
 * @xnetjs/cloud/identity — WorkOS recovery anchor (0243/0322/0338).
 *
 * Adapts the existing `WorkOSAuthKitProvider` to the MIT-side
 * `RecoveryAnchorProvider` contract so WorkOS and ATProto are siblings behind
 * one interface, both writing the SAME escrow envelope. This is a thin
 * adapter — the WorkOS provider's behavior is unchanged; `beginCeremony`
 * reuses `getAuthorizationUrl` and `verifyCeremony` reuses
 * `authenticateWithCode`, then checks the authenticated user id matches the
 * subject the escrow was enrolled under.
 */

import type { WorkOSAuthKitProvider } from './workos'
import type {
  RecoveryAnchorProvider,
  RecoveryCeremonyStart,
  RecoveryCeremonyVerification
} from '@xnetjs/identity'

export class WorkOSRecoveryAnchor implements RecoveryAnchorProvider {
  readonly kind = 'workos'

  constructor(private readonly provider: WorkOSAuthKitProvider) {}

  async beginCeremony(input: {
    state: string
    redirectUri: string
  }): Promise<RecoveryCeremonyStart> {
    const url = this.provider.getAuthorizationUrl({
      state: input.state,
      redirectUri: input.redirectUri
    })
    return { url, state: input.state }
  }

  async verifyCeremony(input: {
    code: string
    expectedSubject: string
    boundXnetDid: string
  }): Promise<RecoveryCeremonyVerification> {
    try {
      const result = await this.provider.authenticateWithCode(input.code)
      if (result.user.id !== input.expectedSubject) {
        return {
          verified: false,
          subject: result.user.id,
          reason: 'Authenticated WorkOS user does not match the enrolled subject'
        }
      }
      // The billing↔data binding (TenantBinding) is what ties this WorkOS user
      // to `boundXnetDid`; that check stays in the cloud control plane and is
      // not duplicated here.
      return { verified: true, subject: result.user.id }
    } catch (err) {
      return {
        verified: false,
        subject: input.expectedSubject,
        reason: err instanceof Error ? err.message : 'WorkOS authentication failed'
      }
    }
  }
}
