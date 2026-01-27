/**
 * SecurityEvent schema - network security event reporting.
 *
 * Event names follow xnet.security.* naming convention.
 */

import { defineSchema, text, select, date } from '@xnet/data'

export const SecurityEventSchema = defineSchema({
  name: 'SecurityEvent',
  namespace: 'xnet://xnet.fyi/telemetry/',
  properties: {
    eventName: select({
      options: [
        { id: 'xnet.security.invalid_signature', name: 'Invalid Signature' },
        { id: 'xnet.security.rate_limit_exceeded', name: 'Rate Limit Exceeded' },
        { id: 'xnet.security.connection_flood', name: 'Connection Flood' },
        { id: 'xnet.security.stream_exhaustion', name: 'Stream Exhaustion' },
        { id: 'xnet.security.invalid_data', name: 'Invalid Data' },
        { id: 'xnet.security.peer_score_drop', name: 'Peer Score Drop' },
        { id: 'xnet.security.peer_blocked', name: 'Peer Blocked' },
        { id: 'xnet.security.peer_unblocked', name: 'Peer Unblocked' },
        { id: 'xnet.security.anomaly_detected', name: 'Anomaly Detected' }
      ] as const
    }),
    eventSeverity: select({
      options: [
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'critical', name: 'Critical' }
      ] as const
    }),
    peerIdHash: text(),
    peerScoreBucket: select({
      options: [
        { id: 'very_low', name: 'Very Low (<-50)' },
        { id: 'low', name: 'Low (-50 to -10)' },
        { id: 'neutral', name: 'Neutral (-10 to 20)' },
        { id: 'good', name: 'Good (20 to 50)' },
        { id: 'excellent', name: 'Excellent (>50)' }
      ] as const
    }),
    eventDetails: text(),
    actionTaken: select({
      options: [
        { id: 'none', name: 'None' },
        { id: 'logged', name: 'Logged' },
        { id: 'warned', name: 'Warned' },
        { id: 'throttled', name: 'Throttled' },
        { id: 'blocked', name: 'Blocked' },
        { id: 'reported', name: 'Reported' }
      ] as const
    }),
    occurredAt: date(),
    status: select({
      options: [
        { id: 'local', name: 'Local' },
        { id: 'pending', name: 'Pending' },
        { id: 'shared', name: 'Shared' }
      ] as const
    })
  }
})

export type SecurityEvent = {
  eventName?: string
  eventSeverity?: string
  peerIdHash?: string
  peerScoreBucket?: string
  eventDetails?: string
  actionTaken?: string
  occurredAt?: number
  status?: string
}
