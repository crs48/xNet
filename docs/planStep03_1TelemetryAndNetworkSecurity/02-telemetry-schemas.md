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

## Schemas

### CrashReport Schema

For capturing application errors and crashes.

```typescript
// packages/telemetry/src/schemas/crash.ts

import { defineSchema, text, select, date, number } from '@xnet/data'

export const CrashReportSchema = defineSchema({
  name: 'CrashReport',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // Error information
    errorType: text({
      required: true,
      description: 'Error constructor name (e.g., RangeError, TypeError)'
    }),
    errorMessage: text({
      required: true,
      description: 'Error message (auto-scrubbed for PII)'
    }),
    stackTrace: text({
      description: 'Stack trace with file paths scrubbed'
    }),

    // Component context
    component: text({
      description: 'Component or module where error occurred'
    }),
    action: text({
      description: 'User action that triggered the error'
    }),

    // Environment
    appVersion: text({
      description: 'Application version (e.g., 1.2.3)'
    }),
    platform: select({
      options: ['macos', 'windows', 'linux', 'ios', 'android', 'web'] as const,
      description: 'Operating system / platform'
    }),

    // Timing (bucketed)
    occurredAt: date({
      description: 'When the error occurred (rounded to hour)'
    }),

    // Status
    status: select({
      options: ['local', 'pending', 'shared', 'dismissed'] as const,
      default: 'local',
      description: 'Sharing status of this report'
    }),

    // User notes (optional)
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

For anonymous usage statistics (P3A-style bucketed values).

```typescript
// packages/telemetry/src/schemas/usage.ts

import { defineSchema, text, select, date } from '@xnet/data'

export const UsageMetricSchema = defineSchema({
  name: 'UsageMetric',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // What's being measured
    metric: text({
      required: true,
      description: 'Metric name (e.g., pages_created, sync_events)'
    }),

    // Bucketed value (never exact counts)
    bucket: select({
      options: ['none', '1-5', '6-20', '21-100', '100+'] as const,
      required: true,
      description: 'Value bucket (exact values never stored)'
    }),

    // Time period
    period: select({
      options: ['daily', 'weekly', 'monthly'] as const,
      required: true,
      description: 'Measurement period'
    }),

    // Environment
    appVersion: text(),
    platform: select({
      options: ['macos', 'windows', 'linux', 'ios', 'android', 'web'] as const
    }),

    // When measured (bucketed)
    measuredAt: date({
      description: 'When metric was recorded (rounded to day)'
    }),

    // Status
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

For logging security-relevant events (used by network security layer).

```typescript
// packages/telemetry/src/schemas/security.ts

import { defineSchema, text, select, date, number } from '@xnet/data'

export const SecurityEventSchema = defineSchema({
  name: 'SecurityEvent',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // Event classification
    eventType: select({
      options: [
        'invalid_signature',
        'rate_limit_exceeded',
        'connection_flood',
        'stream_exhaustion',
        'invalid_data',
        'peer_score_drop',
        'peer_blocked',
        'peer_unblocked',
        'anomaly_detected'
      ] as const,
      required: true,
      description: 'Type of security event'
    }),

    severity: select({
      options: ['low', 'medium', 'high', 'critical'] as const,
      required: true,
      description: 'Event severity'
    }),

    // Peer info (anonymized)
    peerIdHash: text({
      description: 'SHA256 hash of peer ID (not the actual ID)'
    }),
    peerScoreBucket: select({
      options: ['very_low', 'low', 'neutral', 'good', 'excellent'] as const,
      description: 'Peer score at time of event'
    }),

    // Event details
    details: text({
      description: 'JSON details (scrubbed for PII)'
    }),

    // Response
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

    // Status
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

For tracking performance (optional, for debugging).

```typescript
// packages/telemetry/src/schemas/performance.ts

import { defineSchema, text, select, date } from '@xnet/data'

export const PerformanceMetricSchema = defineSchema({
  name: 'PerformanceMetric',
  namespace: 'xnet://xnet.dev/telemetry/',

  properties: {
    // What's being measured
    metric: text({
      required: true,
      description: 'Metric name (e.g., sync_latency, render_time)'
    }),

    // Bucketed value (milliseconds)
    bucket: select({
      options: ['<10ms', '10-50ms', '50-200ms', '200-1000ms', '>1000ms'] as const,
      required: true,
      description: 'Latency bucket'
    }),

    // Context
    context: text({
      description: 'Where measurement was taken (e.g., component name)'
    }),

    // Environment
    appVersion: text(),
    platform: select({
      options: ['macos', 'windows', 'linux', 'ios', 'android', 'web'] as const
    }),

    // Timing
    measuredAt: date(),

    // Status
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

All numeric values are bucketed to prevent unique fingerprinting:

```typescript
// Count buckets (for usage metrics)
type CountBucket = 'none' | '1-5' | '6-20' | '21-100' | '100+'

// Latency buckets (for performance)
type LatencyBucket = '<10ms' | '10-50ms' | '50-200ms' | '200-1000ms' | '>1000ms'

// Score buckets (for peer scores)
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
  TelemetrySchemaIRIs
} from '../src/schemas'

describe('CrashReportSchema', () => {
  it('should have correct IRI', () => {
    expect(CrashReportSchema.iri).toBe('xnet://xnet.dev/telemetry/CrashReport')
  })

  it('should require errorType and errorMessage', () => {
    const props = CrashReportSchema.properties
    expect(props.errorType.required).toBe(true)
    expect(props.errorMessage.required).toBe(true)
  })

  it('should validate platform options', () => {
    const platforms = CrashReportSchema.properties.platform.options
    expect(platforms).toContain('macos')
    expect(platforms).toContain('web')
  })
})

describe('UsageMetricSchema', () => {
  it('should have bucketed values only', () => {
    const buckets = UsageMetricSchema.properties.bucket.options
    expect(buckets).toEqual(['none', '1-5', '6-20', '21-100', '100+'])
  })

  it('should not have any numeric properties', () => {
    const props = UsageMetricSchema.properties
    const numericProps = Object.entries(props).filter(([_, p]) => p.type === 'number')
    expect(numericProps).toHaveLength(0)
  })
})

describe('SecurityEventSchema', () => {
  it('should anonymize peer IDs', () => {
    const props = SecurityEventSchema.properties
    expect(props.peerIdHash).toBeDefined()
    expect(props.peerIdHash.description).toContain('hash')
    // Should NOT have raw peerId field
    expect(props.peerId).toBeUndefined()
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
