# @xnetjs/telemetry

Privacy-preserving telemetry for xNet -- tiered consent, data scrubbing, bucketing, and optional P2P sync.

## Installation

```bash
pnpm add @xnetjs/telemetry
```

## Features

- **Tiered consent** -- Five levels: off, local, crashes, anonymous, identified
- **Consent manager** -- Persistent consent state with granular controls
- **Telemetry schemas** -- Typed event schemas for crash reports, usage metrics, security events, and performance metrics
- **Telemetry collector** -- Collects events with automatic data scrubbing and bucketing
- **Data scrubbing** -- Strips PII from telemetry payloads
- **Bucketing** -- Groups values into ranges for additional privacy
- **Timing utilities** -- Measure operation duration
- **React hooks** -- `useTelemetry`, `useConsent`, `TelemetryProvider`, `TelemetryErrorBoundary`
- **P2P sync** -- Optional anonymized telemetry sharing via sync provider

## Usage

### Consent Management

```typescript
import { ConsentManager } from '@xnetjs/telemetry'

const consent = new ConsentManager()

// Set consent tier
await consent.setTier('anonymous') // 'off' | 'local' | 'crashes' | 'anonymous' | 'identified'

// Read current preferences
consent.current.tier // 'anonymous'

// Update granular preferences
await consent.setConsent({
  reviewBeforeSend: true,
  autoScrub: true
})
```

### Telemetry Collection

```typescript
import { TelemetryCollector } from '@xnetjs/telemetry'

const collector = new TelemetryCollector({ consent })

// Report events
collector.reportUsage('page_view', 1)
collector.reportPerformance('render', 45, 'ui.dashboard')
collector.reportCrash(error)
collector.reportSecurityEvent('auth_failure', 'medium', { reason: 'expired_token' })
```

### React Integration

```tsx
import {
  TelemetryProvider,
  useConsent,
  useTelemetry,
  TelemetryErrorBoundary
} from '@xnetjs/telemetry'

function App() {
  return (
    <TelemetryProvider collector={collector}>
      <TelemetryErrorBoundary>
        <ConsentBanner />
        <YourApp />
      </TelemetryErrorBoundary>
    </TelemetryProvider>
  )
}

function ConsentBanner() {
  const { tier, setTier } = useConsent()
  return (
    <div>
      <p>Current: {tier}</p>
      <button onClick={() => setTier('anonymous')}>Allow anonymous</button>
    </div>
  )
}

function TrackedComponent() {
  const { reportUsage } = useTelemetry()
  return <button onClick={() => reportUsage('button_click', 1)}>Save</button>
}
```

## Architecture

```mermaid
flowchart TD
    subgraph Consent["Consent Layer"]
        Manager["ConsentManager<br/><small>Tiered consent state</small>"]
        Storage["ConsentStorage<br/><small>Persistent prefs</small>"]
    end

    subgraph Collection["Collection Layer"]
        Collector["TelemetryCollector"]
        Scrubber["DataScrubber<br/><small>PII removal</small>"]
        Bucketer["Bucketer<br/><small>Value grouping</small>"]
        Timer["Timing<br/><small>Duration measurement</small>"]
    end

    subgraph Schemas["Event Schemas"]
        Crash["CrashReport"]
        Usage["UsageMetric"]
        Security["SecurityEvent"]
        Perf["PerformanceMetric"]
    end

    subgraph ReactLayer["React Layer"]
        Provider["TelemetryProvider"]
        UseConsent["useConsent"]
        UseTelemetry["useTelemetry"]
        ErrorBoundary["TelemetryErrorBoundary"]
    end

    subgraph Sync["Sync Layer"]
        SyncProvider["TelemetrySyncProvider<br/><small>P2P anonymized sync</small>"]
        Protocol["TelemetryProtocol"]
    end

    Manager --> Collector --> Scrubber --> Bucketer
    Schemas --> Collector
    Timer --> Collector
    Consent --> Collection
    ReactLayer --> Collection
    Collection --> Sync
```

## Consent Levels

| Tier         | Data Collected                         | Identifiers |
| ------------ | -------------------------------------- | ----------- |
| `off`        | Nothing                                | None        |
| `local`      | Local-only diagnostics                 | None        |
| `crashes`    | Crash/error reports                    | None        |
| `anonymous`  | Aggregated usage + performance metrics | None        |
| `identified` | Full telemetry with attribution        | DID         |

## Modules

| Module                             | Description                         |
| ---------------------------------- | ----------------------------------- |
| `consent/manager.ts`               | Consent level management            |
| `consent/storage.ts`               | Persistent consent storage          |
| `schemas/crash.ts`                 | Crash report schema                 |
| `schemas/usage.ts`                 | Usage metric schema                 |
| `schemas/security.ts`              | Security event schema               |
| `schemas/performance.ts`           | Performance metric schema           |
| `collection/collector.ts`          | Event collection engine             |
| `collection/scrubbing.ts`          | PII data scrubbing                  |
| `collection/bucketing.ts`          | Value bucketing for k-anonymity     |
| `collection/timing.ts`             | Operation timing                    |
| `hooks/TelemetryContext.tsx`       | React context provider              |
| `hooks/useConsent.ts`              | Consent management hook             |
| `hooks/useTelemetry.ts`            | Telemetry tracking hook             |
| `hooks/TelemetryErrorBoundary.tsx` | Error boundary with crash reporting |
| `sync/provider.ts`                 | P2P telemetry sync                  |
| `sync/protocol.ts`                 | Sync protocol definition            |

## Dependencies

- `@xnetjs/core`, `@xnetjs/data`
- Optional peer dep: `react`

## Testing

```bash
pnpm --filter @xnetjs/telemetry test
```
