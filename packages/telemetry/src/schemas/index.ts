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
  CrashReport: 'xnet://xnet.dev/telemetry/CrashReport',
  UsageMetric: 'xnet://xnet.dev/telemetry/UsageMetric',
  SecurityEvent: 'xnet://xnet.dev/telemetry/SecurityEvent',
  PerformanceMetric: 'xnet://xnet.dev/telemetry/PerformanceMetric'
} as const
