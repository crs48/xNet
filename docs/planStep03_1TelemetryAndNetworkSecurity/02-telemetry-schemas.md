# 02: Telemetry Schemas

> Schema definitions for crash reports, usage metrics, and security events

**Duration:** 1-2 days  
**Dependencies:** [01-telemetry-package.md](./01-telemetry-package.md)

## Overview

Telemetry data is stored as Nodes using xNet's schema system. This means telemetry is:

- **Type-safe** - Full TypeScript inference
- **Inspectable** - Users can view the schema to see exactly what's collected
- **Queryable** - Standard Node queries work on telemetry
- **Syncable** - Can use existing sync infrastructure when sharing

### OpenTelemetry Semantic Convention Alignment

Field names are aligned with [OTel semantic conventions](https://opentelemetry.io/docs/specs/semconv/) where applicable, using camelCase versions of the dot-separated OTel attribute names. This provides:

- Naming consistency with the broader observability ecosystem
- Easier future bridging to OTel backends if needed
- Familiar patterns for developers

| OTel Attribute         | Schema Field                                   | Used In       |
| ---------------------- | ---------------------------------------------- | ------------- |
| `exception.type`       | `exceptionType`                                | CrashReport   |
| `exception.message`    | `exceptionMessage`                             | CrashReport   |
| `exception.stacktrace` | `exceptionStacktrace`                          | CrashReport   |
| `code.namespace`       | `codeNamespace`                                | CrashReport   |
| `service.version`      | `serviceVersion`                               | All schemas   |
| `os.type`              | `osType`                                       | All schemas   |
| `event.name`           | `eventName`                                    | SecurityEvent |
| N/A (xNet-specific)    | `consentTier`, `privacyBucketed`, `peerIdHash` | Various       |

## Schemas

### CrashReport Schema

For capturing application errors and crashes. Field names align with OTel's [exception semantic conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/exception/).

```typescript
// packages/telemetry/src/schemas/crash.ts

import { defineSchema, text, select, date, number } from '@xnet/data'

export const CrashReportSchema = defineSchema({
  name: 'CrashReport',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // Exception info (OTel: exception.*)
    exceptionType: text({
      required: true,
      description: 'Error constructor name (e.g., RangeError, TypeError)'
      // OTel: exception.type
    }),
    exceptionMessage: text({
      required: true,
      description: 'Error message (auto-scrubbed for PII)'
      // OTel: exception.message
    }),
    exceptionStacktrace: text({
      description: 'Stack trace with file paths scrubbed'
      // OTel: exception.stacktrace
    }),

    // Code context (OTel: code.*)
    codeNamespace: text({
      description: 'Component or module where error occurred'
      // OTel: code.namespace
    }),
    codeFunction: text({
      description: 'Function name where error occurred'
      // OTel: code.function
    }),

    // User action (xNet-specific, no OTel equivalent)
    userAction: text({
      description: 'User action that triggered the error'
    }),

    // Environment (OTel: service.*, os.*)
    serviceVersion: text({
      description: 'Application version (e.g., 1.2.3)'
      // OTel: service.version
    }),
    osType: select({
      options: ['macos', 'windows', 'linux', 'ios', 'android', 'web'] as const,
      description: 'Operating system / platform'
      // OTel: os.type
    }),

    // Timing (bucketed)
    occurredAt: date({
      description: 'When the error occurred (rounded to hour)'
    }),

    // Status (xNet-specific)
    status: select({
      options: ['local', 'pending', 'shared', 'dismissed'] as const,
      default: 'local',
      description: 'Sharing status of this report'
    }),

    // User notes (optional, xNet-specific)
    userNotes: text({
      description: 'Optional notes from user about what they were doing'
    })
  },

  // Crash reports don't have rich content
  hasContent: false,

  icon: 'bug'
})

export type CrashReport = InferNode<typeof CrashReportSchema>
```

### UsageMetric Schema

For anonymous usage statistics (P3A-style bucketed values). Uses OTel [metrics naming conventions](https://opentelemetry.io/docs/specs/semconv/general/metrics/) for the metric name format.

```typescript
// packages/telemetry/src/schemas/usage.ts

import { defineSchema, text, select, date } from '@xnet/data'

export const UsageMetricSchema = defineSchema({
  name: 'UsageMetric',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // What's being measured (OTel metric naming: dot-separated, lowercase)
    metricName: text({
      required: true,
      description: 'Metric name using OTel convention (e.g., xnet.pages.created, xnet.sync.events)'
      // Follows OTel metric naming: <namespace>.<noun>.<verb/adjective>
    }),

    // Bucketed value (never exact counts — xNet privacy-specific)
    metricBucket: select({
      options: ['none', '1-5', '6-20', '21-100', '100+'] as const,
      required: true,
      description: 'Value bucket (exact values never stored)'
    }),

    // Time period (xNet-specific)
    period: select({
      options: ['daily', 'weekly', 'monthly'] as const,
      required: true,
      description: 'Measurement period'
    }),

    // Environment (OTel: service.version, os.type)
    serviceVersion: text({
      description: 'Application version'
      // OTel: service.version
    }),
    osType: select({
      options: ['macos', 'windows', 'linux', 'ios', 'android', 'web'] as const,
      description: 'Operating system / platform'
      // OTel: os.type
    }),

    // When measured (bucketed)
    measuredAt: date({
      description: 'When metric was recorded (rounded to day)'
    }),

    // Status (xNet-specific)
    status: select({
      options: ['local', 'pending', 'shared'] as const,
      default: 'local'
    })
  },

  hasContent: false,
  icon: 'chart'
})

export type UsageMetric = InferNode<typeof UsageMetricSchema>
```

### SecurityEvent Schema

For logging security-relevant events (used by network security layer). Uses OTel [event conventions](https://opentelemetry.io/docs/specs/semconv/general/events/) and [security rule attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/security-rule/) where applicable.

```typescript
// packages/telemetry/src/schemas/security.ts

import { defineSchema, text, select, date, number } from '@xnet/data'

export const SecurityEventSchema = defineSchema({
  name: 'SecurityEvent',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // Event classification (OTel: event.name pattern)
    eventName: select({
      options: [
        'xnet.security.invalid_signature',
        'xnet.security.rate_limit_exceeded',
        'xnet.security.connection_flood',
        'xnet.security.stream_exhaustion',
        'xnet.security.invalid_data',
        'xnet.security.peer_score_drop',
        'xnet.security.peer_blocked',
        'xnet.security.peer_unblocked',
        'xnet.security.anomaly_detected'
      ] as const,
      required: true,
      description:
        'Type of security event (OTel event.name convention: <namespace>.<category>.<event>)'
      // OTel: event.name
    }),

    eventSeverity: select({
      options: ['low', 'medium', 'high', 'critical'] as const,
      required: true,
      description: 'Event severity level'
      // Loosely aligns with OTel log severity levels
    }),

    // Peer info (anonymized — xNet-specific, no OTel equivalent)
    peerIdHash: text({
      description: 'SHA256 hash of peer ID (not the actual ID)'
    }),
    peerScoreBucket: select({
      options: ['very_low', 'low', 'neutral', 'good', 'excellent'] as const,
      description: 'Peer score at time of event (bucketed)'
    }),

    // Event details
    eventDetails: text({
      description: 'JSON details (scrubbed for PII)'
    }),

    // Response (xNet-specific)
    actionTaken: select({
      options: ['none', 'logged', 'warned', 'throttled', 'blocked', 'reported'] as const,
      required: true,
      description: 'Automated response taken'
    }),

    // Timing
    occurredAt: date({
      required: true,
      description: 'When event occurred (rounded to minute for security events)'
    }),

    // Status (xNet-specific)
    status: select({
      options: ['local', 'pending', 'shared'] as const,
      default: 'local'
    })
  },

  hasContent: false,
  icon: 'shield'
})

export type SecurityEvent = InferNode<typeof SecurityEventSchema>
```

### PerformanceMetric Schema

For tracking performance (optional, for debugging). Uses OTel [metrics naming](https://opentelemetry.io/docs/specs/semconv/general/metrics/) and [code attributes](https://opentelemetry.io/docs/specs/semconv/registry/attributes/code/).

```typescript
// packages/telemetry/src/schemas/performance.ts

import { defineSchema, text, select, date } from '@xnet/data'

export const PerformanceMetricSchema = defineSchema({
  name: 'PerformanceMetric',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // What's being measured (OTel metric naming convention)
    metricName: text({
      required: true,
      description:
        'Metric name using OTel convention (e.g., xnet.sync.duration, xnet.render.duration)'
      // Follows OTel: <namespace>.<noun>.<unit_or_adjective>
    }),

    // Bucketed value in milliseconds (xNet privacy-specific)
    durationBucket: select({
      options: ['<10ms', '10-50ms', '50-200ms', '200-1000ms', '>1000ms'] as const,
      required: true,
      description: 'Duration bucket (exact values never stored)'
    }),

    // Code context (OTel: code.namespace)
    codeNamespace: text({
      description: 'Where measurement was taken (e.g., component name)'
      // OTel: code.namespace
    }),

    // Environment (OTel: service.version, os.type)
    serviceVersion: text({
      description: 'Application version'
      // OTel: service.version
    }),
    osType: select({
      options: ['macos', 'windows', 'linux', 'ios', 'android', 'web'] as const,
      description: 'Operating system / platform'
      // OTel: os.type
    }),

    // Timing
    measuredAt: date(),

    // Status (xNet-specific)
    status: select({
      options: ['local', 'pending', 'shared'] as const,
      default: 'local'
    })
  },

  hasContent: false,
  icon: 'timer'
})

export type PerformanceMetric = InferNode<typeof PerformanceMetricSchema>
```

## Schema Index

```typescript
// packages/telemetry/src/schemas/index.ts

export { CrashReportSchema, type CrashReport } from './crash'
export { UsageMetricSchema, type UsageMetric } from './usage'
export { SecurityEventSchema, type SecurityEvent } from './security'
export { PerformanceMetricSchema, type PerformanceMetric } from './performance'

// All telemetry schemas for registration
export const TelemetrySchemas = [
  CrashReportSchema,
  UsageMetricSchema,
  SecurityEventSchema,
  PerformanceMetricSchema
] as const

// Schema IRIs for reference
export const TelemetrySchemaIRIs = {
  CrashReport: 'xnet://xnet.dev/telemetry/CrashReport',
  UsageMetric: 'xnet://xnet.dev/telemetry/UsageMetric',
  SecurityEvent: 'xnet://xnet.dev/telemetry/SecurityEvent',
  PerformanceMetric: 'xnet://xnet.dev/telemetry/PerformanceMetric'
} as const
```

## Privacy Design

### What's NOT Collected

These fields are explicitly **never** included in telemetry:

| Field                  | Reason                               |
| ---------------------- | ------------------------------------ |
| User ID / DID          | No persistent identifier             |
| Device ID              | No device tracking                   |
| Session ID             | No session correlation               |
| IP Address             | Stripped at collection               |
| File paths (raw)       | Auto-scrubbed to `/Users/[USER]/...` |
| Email addresses        | Auto-scrubbed to `[EMAIL]`           |
| Workspace/document IDs | No content correlation               |
| User content           | Never captured                       |

### Bucketing Strategy

All numeric values are bucketed to prevent unique fingerprinting. This is xNet-specific — OTel reports exact values, but our privacy-first design requires ranges:

```typescript
// Count buckets (for usage metrics — metricBucket field)
type CountBucket = 'none' | '1-5' | '6-20' | '21-100' | '100+'

// Duration buckets (for performance — durationBucket field)
type DurationBucket = '<10ms' | '10-50ms' | '50-200ms' | '200-1000ms' | '>1000ms'

// Score buckets (for peer scores — peerScoreBucket field)
type ScoreBucket = 'very_low' | 'low' | 'neutral' | 'good' | 'excellent'
```

### Timestamp Rounding

| Schema            | Rounding |
| ----------------- | -------- |
| CrashReport       | Hour     |
| UsageMetric       | Day      |
| SecurityEvent     | Minute   |
| PerformanceMetric | Hour     |

## Tests

```typescript
// packages/telemetry/test/schemas.test.ts

import { describe, it, expect } from 'vitest'
import {
  CrashReportSchema,
  UsageMetricSchema,
  SecurityEventSchema,
  PerformanceMetricSchema,
  TelemetrySchemaIRIs
} from '../src/schemas'

describe('CrashReportSchema', () => {
  it('should have correct IRI', () => {
    expect(CrashReportSchema.iri).toBe('xnet://xnet.dev/telemetry/CrashReport')
  })

  it('should require exceptionType and exceptionMessage (OTel-aligned)', () => {
    const props = CrashReportSchema.properties
    expect(props.exceptionType.required).toBe(true)
    expect(props.exceptionMessage.required).toBe(true)
  })

  it('should use OTel-aligned field names', () => {
    const props = CrashReportSchema.properties
    // OTel: exception.* → exceptionType, exceptionMessage, exceptionStacktrace
    expect(props.exceptionType).toBeDefined()
    expect(props.exceptionMessage).toBeDefined()
    expect(props.exceptionStacktrace).toBeDefined()
    // OTel: code.* → codeNamespace, codeFunction
    expect(props.codeNamespace).toBeDefined()
    expect(props.codeFunction).toBeDefined()
    // OTel: service.version → serviceVersion
    expect(props.serviceVersion).toBeDefined()
    // OTel: os.type → osType
    expect(props.osType).toBeDefined()
  })

  it('should validate osType options', () => {
    const platforms = CrashReportSchema.properties.osType.options
    expect(platforms).toContain('macos')
    expect(platforms).toContain('web')
  })
})

describe('UsageMetricSchema', () => {
  it('should use OTel metric naming convention', () => {
    const props = UsageMetricSchema.properties
    expect(props.metricName).toBeDefined()
    expect(props.metricName.description).toContain('OTel convention')
  })

  it('should have bucketed values only', () => {
    const buckets = UsageMetricSchema.properties.metricBucket.options
    expect(buckets).toEqual(['none', '1-5', '6-20', '21-100', '100+'])
  })

  it('should not have any numeric properties', () => {
    const props = UsageMetricSchema.properties
    const numericProps = Object.entries(props).filter(([_, p]) => p.type === 'number')
    expect(numericProps).toHaveLength(0)
  })
})

describe('SecurityEventSchema', () => {
  it('should use OTel event.name convention for event names', () => {
    const props = SecurityEventSchema.properties
    expect(props.eventName).toBeDefined()
    // All event names should follow <namespace>.<category>.<event> pattern
    const options = props.eventName.options
    for (const opt of options) {
      expect(opt).toMatch(/^xnet\.security\..+/)
    }
  })

  it('should anonymize peer IDs', () => {
    const props = SecurityEventSchema.properties
    expect(props.peerIdHash).toBeDefined()
    expect(props.peerIdHash.description).toContain('hash')
    // Should NOT have raw peerId field
    expect((props as any).peerId).toBeUndefined()
  })
})

describe('PerformanceMetricSchema', () => {
  it('should use OTel metric naming and code.namespace', () => {
    const props = PerformanceMetricSchema.properties
    expect(props.metricName).toBeDefined()
    expect(props.codeNamespace).toBeDefined()
  })

  it('should have duration buckets', () => {
    const buckets = PerformanceMetricSchema.properties.durationBucket.options
    expect(buckets).toContain('<10ms')
    expect(buckets).toContain('>1000ms')
  })
})

describe('TelemetrySchemaIRIs', () => {
  it('should have all schema IRIs', () => {
    expect(TelemetrySchemaIRIs.CrashReport).toBe('xnet://xnet.dev/telemetry/CrashReport')
    expect(TelemetrySchemaIRIs.UsageMetric).toBe('xnet://xnet.dev/telemetry/UsageMetric')
    expect(TelemetrySchemaIRIs.SecurityEvent).toBe('xnet://xnet.dev/telemetry/SecurityEvent')
    expect(TelemetrySchemaIRIs.PerformanceMetric).toBe(
      'xnet://xnet.dev/telemetry/PerformanceMetric'
    )
  })
})
```

## Checklist

- [ ] Create CrashReportSchema with all properties
- [ ] Create UsageMetricSchema with bucketed values only
- [ ] Create SecurityEventSchema with anonymized peer info
- [ ] Create PerformanceMetricSchema with latency buckets
- [ ] Create schema index with exports
- [ ] Verify no PII fields in any schema
- [ ] Verify all values are bucketed (no exact counts)
- [ ] Write schema tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Package Structure](./01-telemetry-package.md) | [Next: Consent Manager](./03-consent-manager.md)
