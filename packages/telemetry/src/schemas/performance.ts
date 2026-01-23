/**
 * PerformanceMetric schema - bucketed performance measurements.
 */

import { defineSchema, text, select, date } from '@xnet/data'

export const PerformanceMetricSchema = defineSchema({
  name: 'PerformanceMetric',
  namespace: 'xnet://xnet.dev/telemetry/',
  properties: {
    metricName: text({ required: true }),
    durationBucket: select({
      options: [
        { id: '<10ms', name: '<10ms' },
        { id: '10-50ms', name: '10-50ms' },
        { id: '50-200ms', name: '50-200ms' },
        { id: '200-1000ms', name: '200-1000ms' },
        { id: '>1000ms', name: '>1000ms' }
      ] as const
    }),
    codeNamespace: text(),
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

export type PerformanceMetric = {
  metricName: string
  durationBucket?: string
  codeNamespace?: string
  serviceVersion?: string
  osType?: string
  measuredAt?: number
  status?: string
}
