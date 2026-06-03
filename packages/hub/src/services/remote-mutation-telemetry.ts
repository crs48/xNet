/**
 * @xnetjs/hub - Abuse telemetry helpers for remote mutation denials.
 */

import type { AbuseTelemetryReporter } from '@xnetjs/abuse'
import { decideRemoteMutation, reportRemoteMutationRejection } from '@xnetjs/abuse'

export type RemoteMutationTelemetryOptions = {
  telemetry?: AbuseTelemetryReporter
  telemetryPeerHashSalt?: string
}

const createUnauthorizedRemoteWriteFacts = (actorDid: string) =>
  ({
    crypto: { authorized: false },
    actor: { did: actorDid }
  }) as const

/**
 * Report a rejected remote write without leaking the raw actor DID.
 */
export const reportUnauthorizedRemoteWrite = (
  options: RemoteMutationTelemetryOptions,
  actorDid: string
): boolean => {
  const facts = createUnauthorizedRemoteWriteFacts(actorDid)

  return reportRemoteMutationRejection(options.telemetry, {
    facts: {
      ...facts,
      surface: 'remoteMutation'
    },
    decision: decideRemoteMutation(facts),
    peerHashSalt: options.telemetryPeerHashSalt
  })
}
