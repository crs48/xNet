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
export type { TelemetryBufferStore } from './collection'
export {
  MemoryTelemetryBuffer,
  IndexedDBTelemetryBuffer,
  isIndexedDBAvailable,
  createDefaultTelemetryBuffer
} from './collection'

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

// Tracing (exploration 0190)
export type { Span, SpanInput, SpanAttributes, Trace, TraceRootKind } from './tracing'
export { TraceCollector } from './tracing'
export type { TraceCollectorOptions, TraceHandle } from './tracing'
export { emitTraceAsBuckets } from './tracing'
export type { BucketReporter, TraceEgressOptions } from './tracing'
export { fnv1a, hashToUnit } from './tracing'
export { QUERY_STAGES, MUTATE_STAGES } from './tracing'
export type { QueryStage, MutateStage } from './tracing'

// Sync
export type { TelemetrySyncConfig, SyncResult } from './sync'
export { TelemetrySyncProvider } from './sync'
export type { TelemetryBatch, TelemetryBatchRecord, AggregatorResponse } from './sync'
export { TELEMETRY_PROTOCOL } from './sync'
export type { HttpTransportOptions, TelemetryTransport } from './sync'
export { createHttpTransport } from './sync'
export type { CrashPing, DebugReport, DiagnosticsClient, DiagnosticsClientOptions } from './sync'
export { createDiagnosticsClient } from './sync'

// Data dignity — "what we know about you" mirror (exploration 0234)
export type {
  DerivedDataKind,
  DerivedDataLocation,
  DerivedItem,
  DerivedDataSource,
  TelemetryMirrorPort
} from './dignity'
export {
  DERIVED_DATA_KINDS,
  describeWhatWeKnow,
  missingDerivedKinds,
  telemetryDerivedSource
} from './dignity'
