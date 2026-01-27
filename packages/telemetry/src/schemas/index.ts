export { CrashReportSchema, type CrashReport } from './crash'
export { UsageMetricSchema, type UsageMetric } from './usage'
export { SecurityEventSchema, type SecurityEvent } from './security'
export { PerformanceMetricSchema, type PerformanceMetric } from './performance'

import { CrashReportSchema } from './crash'
import { UsageMetricSchema } from './usage'
import { SecurityEventSchema } from './security'
import { PerformanceMetricSchema } from './performance'

/** All telemetry schemas */
export const TelemetrySchemas = [
  CrashReportSchema,
  UsageMetricSchema,
  SecurityEventSchema,
  PerformanceMetricSchema
] as const

/** Schema IRI constants */
export const TelemetrySchemaIRIs = {
  CrashReport: 'xnet://xnet.fyi/telemetry/CrashReport',
  UsageMetric: 'xnet://xnet.fyi/telemetry/UsageMetric',
  SecurityEvent: 'xnet://xnet.fyi/telemetry/SecurityEvent',
  PerformanceMetric: 'xnet://xnet.fyi/telemetry/PerformanceMetric'
} as const
