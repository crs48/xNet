/**
 * UsageMetric schema - P3A-style bucketed usage analytics.
 *
 * Values are always bucketed (never exact counts) to preserve privacy.
 */

import { defineSchema, text, select, date } from '@xnet/data'

export const UsageMetricSchema = defineSchema({
  name: 'UsageMetric',
  namespace: 'xnet://xnet.dev/telemetry/',
  properties: {
    metricName: text({ required: true }),
    metricBucket: select({
      options: [
        { id: 'none', name: 'None (0)' },
        { id: '1-5', name: '1-5' },
        { id: '6-20', name: '6-20' },
        { id: '21-100', name: '21-100' },
        { id: '100+', name: '100+' }
      ] as const
    }),
    period: select({
      options: [
        { id: 'daily', name: 'Daily' },
        { id: 'weekly', name: 'Weekly' },
        { id: 'monthly', name: 'Monthly' }
      ] as const
    }),
    serviceVersion: text(),
    osType: select({
      options: [
        { id: 'macos', name: 'macOS' },
        { id: 'windows', name: 'Windows' },
        { id: 'linux', name: 'Linux' },
        { id: 'ios', name: 'iOS' },
        { id: 'android', name: 'Android' },
        { id: 'web', name: 'Web' }
      ] as const
    }),
    measuredAt: date(),
    status: select({
      options: [
        { id: 'local', name: 'Local' },
        { id: 'pending', name: 'Pending' },
        { id: 'shared', name: 'Shared' }
      ] as const
    })
  }
})

export type UsageMetric = {
  metricName: string
  metricBucket?: string
  period?: string
  serviceVersion?: string
  osType?: string
  measuredAt?: number
  status?: string
}
