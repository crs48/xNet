// Consent
export type { TelemetryTier, TelemetryConsent } from './consent'
export { DEFAULT_CONSENT, tierLevel, tierMeetsRequirement } from './consent'
export type { ConsentStorage, ConsentManagerOptions, ConsentManagerEvents } from './consent'
export { ConsentManager, MemoryConsentStorage, LocalStorageConsentStorage } from './consent'

// Schemas
export type { CrashReport, UsageMetric, SecurityEvent, PerformanceMetric } from './schemas'
export {
  CrashReportSchema,
  UsageMetricSchema,
  SecurityEventSchema,
  PerformanceMetricSchema,
  TelemetrySchemas,
  TelemetrySchemaIRIs
} from './schemas'

// Collection
export type {
  ScrubOptions,
  TelemetryCollectorOptions,
  ReportOptions,
  TelemetryRecord
} from './collection'
export { scrubTelemetryData, DEFAULT_SCRUB_OPTIONS } from './collection'
export type {
  CountBucket,
  LatencyBucket,
  SizeBucket,
  ScoreBucket,
  BucketType,
  TimestampPrecision
} from './collection'
export {
  bucketCount,
  bucketLatency,
  bucketSize,
  bucketScore,
  bucketValue,
  bucketTimestamp,
  bucketToApproximate
} from './collection'
export { scheduleWithJitter, randomDelay } from './collection'
export { TelemetryCollector } from './collection'

// Hooks
export {
  TelemetryProvider,
  type TelemetryProviderProps,
  type TelemetryContextValue,
  useConsent,
  type UseConsentReturn,
  useTelemetry,
  type UseTelemetryOptions,
  type UseTelemetryReturn,
  TelemetryErrorBoundary
} from './hooks'

// Sync
export type { TelemetrySyncConfig, SyncResult } from './sync'
export { TelemetrySyncProvider } from './sync'
export type { TelemetryBatch, TelemetryBatchRecord, AggregatorResponse } from './sync'
export { TELEMETRY_PROTOCOL } from './sync'
