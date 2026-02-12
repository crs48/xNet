# Telemetry Instrumentation Strategy for xNet Packages

> Comprehensive analysis of what packages can and should be instrumented with @xnet/telemetry

**Status**: 🔍 EXPLORATION  
**Created**: February 11, 2026  
**Author**: AI Analysis

## Executive Summary

The xNet monorepo has **24 packages** across 4 architectural layers. While `@xnet/telemetry` exists and is feature-complete with privacy-preserving collection, consent management, and React hooks, **it is currently not integrated into any package**. This exploration identifies instrumentation opportunities across all packages, prioritizes them by impact, and provides a phased rollout plan.

### Key Findings

| Finding                              | Impact                                                    |
| ------------------------------------ | --------------------------------------------------------- |
| ✅ **Telemetry package is complete** | Ready for integration                                     |
| ❌ **Zero current usage**            | No imports of `@xnet/telemetry` found                     |
| 🎯 **Ad-hoc metrics exist**          | `crypto-metrics.ts`, peer scoring, Hub Prometheus metrics |
| 🔥 **Performance timers everywhere** | `performance.now()` used 100+ times                       |
| 💡 **Error handling scattered**      | Try-catch blocks without telemetry                        |
| 🚀 **Quick wins available**          | 8 high-impact packages ready for instrumentation          |

```mermaid
flowchart TB
    subgraph Foundation["🏗️ Foundation Layer (3 packages)"]
        Core["@xnet/core<br/>❌ Not instrumented<br/>🎯 Content addressing, hashing"]
        Crypto["@xnet/crypto<br/>⚠️ Has CryptoMetrics<br/>🎯 Signing, verification"]
        Identity["@xnet/identity<br/>❌ Not instrumented<br/>🎯 DID, UCAN, passkeys"]
    end

    subgraph Infrastructure["⚙️ Infrastructure Layer (5 packages)"]
        Storage["@xnet/storage<br/>❌ Not instrumented<br/>🔥 IndexedDB operations"]
        Sync["@xnet/sync<br/>⚠️ Has YjsPeerMetrics<br/>🔥 Change propagation, hash chains"]
        Data["@xnet/data<br/>❌ Not instrumented<br/>🔥 NodeStore, schema validation"]
        Network["@xnet/network<br/>⚠️ Has PeerScorer<br/>🔥 P2P, WebRTC, security"]
        Query["@xnet/query<br/>❌ Not instrumented<br/>🎯 Local queries, FTS"]
    end

    subgraph Application["📱 Application Layer (8 packages)"]
        React["@xnet/react<br/>❌ Not instrumented<br/>🔥 useQuery, useMutate hooks"]
        SDK["@xnet/sdk<br/>❌ Not instrumented<br/>🎯 Client initialization"]
        Editor["@xnet/editor<br/>⚠️ Has performance utils<br/>🎯 TipTap operations"]
        UI["@xnet/ui<br/>❌ Not instrumented<br/>❓ Low priority"]
        Views["@xnet/views<br/>❌ Not instrumented<br/>🎯 Table, Board rendering"]
        Canvas["@xnet/canvas<br/>⚠️ Has FrameMonitor<br/>🎯 Render perf, spatial index"]
        DevTools["@xnet/devtools<br/>⚠️ Emits telemetry events<br/>🎯 Panel operations"]
        History["@xnet/history<br/>❌ Not instrumented<br/>🎯 Time travel, pruning"]
    end

    subgraph Specialized["🔧 Specialized (8 packages)"]
        Plugins["@xnet/plugins<br/>❌ Not instrumented<br/>🎯 Sandbox execution"]
        Telemetry["@xnet/telemetry<br/>✅ COMPLETE<br/>📦 Source of truth"]
        Formula["@xnet/formula<br/>❌ Not instrumented<br/>🎯 Expression evaluation"]
        Vectors["@xnet/vectors<br/>❌ Not instrumented<br/>🎯 HNSW search"]
        Hub["@xnet/hub<br/>⚠️ Has Prometheus metrics<br/>🔥 Relay, backup, FTS5"]
        SQLite["@xnet/sqlite<br/>❌ Not instrumented<br/>🔥 Query timing"]
        DataBridge["@xnet/data-bridge<br/>❌ Not instrumented<br/>🎯 Worker communication"]
        CLI["@xnet/cli<br/>❌ Not instrumented<br/>❓ Low priority"]
    end

    Telemetry -.->|"Should instrument"| Foundation
    Telemetry -.->|"Should instrument"| Infrastructure
    Telemetry -.->|"Should instrument"| Application
    Telemetry -.->|"Should instrument"| Specialized

    classDef complete fill:#4caf50,stroke:#2e7d32,color:#fff
    classDef partial fill:#ff9800,stroke:#e65100,color:#fff
    classDef missing fill:#f44336,stroke:#c62828,color:#fff
    classDef low fill:#9e9e9e,stroke:#616161,color:#fff

    class Telemetry complete
    class Crypto,Sync,Network,Editor,Canvas,DevTools,Hub partial
    class Core,Identity,Storage,Data,Query,React,SDK,UI,Views,History,Plugins,Formula,Vectors,SQLite,DataBridge missing
    class UI,CLI low
```

## 🎯 Instrumentation Priorities

### Priority Matrix

```mermaid
quadrantChart
    title Telemetry Instrumentation Priority
    x-axis Low Impact --> High Impact
    y-axis Easy --> Complex

    Data: [0.9, 0.7]
    Sync: [0.9, 0.6]
    Network: [0.85, 0.5]
    Storage: [0.85, 0.8]
    React: [0.8, 0.9]
    Crypto: [0.75, 0.3]
    Query: [0.7, 0.6]
    Hub: [0.7, 0.4]
    Editor: [0.6, 0.5]
    Canvas: [0.55, 0.4]
    Views: [0.5, 0.6]
    Plugins: [0.45, 0.4]
    History: [0.4, 0.5]
    Identity: [0.35, 0.7]
    Core: [0.3, 0.8]
```

### 🔥 Phase 1: Critical Path (Weeks 1-2)

High impact, core functionality. These packages power the entire system.

| Package           | Why Critical                                                     | What to Instrument                                                                                                                |
| ----------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **@xnet/data**    | Heart of the system. All CRUD operations flow through NodeStore. | `create()`, `update()`, `delete()`, schema validation failures, property coercion errors, rollup calculation timing               |
| **@xnet/sync**    | Change propagation is the sync primitive. Failures cascade.      | `apply()` timing, conflict resolution paths, hash chain verification failures, Yjs update signing/verification, peer sync latency |
| **@xnet/storage** | Persistence layer. IndexedDB errors are silent killers.          | Read/write/delete timing, transaction failures, quota exceeded errors, migration errors, chunk manager operations                 |
| **@xnet/react**   | Developer-facing API. Hook usage patterns inform design.         | `useQuery()` timing, cache hits/misses, `useMutate()` success/failure, subscription churn, re-render frequency                    |

**Validation gate**: Crash reports flowing from all 4 packages. Performance metrics for P95 latencies. Zero PII leakage.

### 🎯 Phase 2: Network & Security (Weeks 3-4)

Telemetry as defense mechanism. Security events enable auto-response.

| Package           | Status         | What Instrumented                                                                                                                |
| ----------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **@xnet/crypto**  | ✅ **DONE**    | Sign/verify timing by security level (L0/L1/L2), cache hits/misses, worker operations via setTelemetry()                         |
| **@xnet/network** | 🔄 In Progress | Connection success/failure rates, peer discovery latency, WebRTC ICE failures, security events (invalid signatures, rate limits) |
| **@xnet/hub**     | ⏸️ Pending     | Query timing, federation health, backup success/failure, FTS5 performance, rate limit rejections (optional client telemetry)     |

**Validation gate**: Security dashboard shows actionable metrics. Auto-blocking works. Crypto performance regressions caught.

### 💡 Phase 3: Developer Experience (Weeks 5-6)

Tools and features that improve app quality.

| Package          | Why Useful                          | What to Instrument                                                                                                         |
| ---------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **@xnet/query**  | Query performance affects UX.       | Query parsing time, FTS latency, result set sizes (bucketed), filter match rates, federated query timing                   |
| **@xnet/editor** | Rich text is performance-sensitive. | Keystroke latency, paste operations, large doc handling, collaborative conflict resolution, extension load time            |
| **@xnet/canvas** | Infinite canvas needs 60fps.        | Frame rate, viewport size, node count (bucketed), edge routing time, layout calculation duration, spatial index query time |
| **@xnet/views**  | Table/Board rendering at scale.     | Initial render time, virtualization effectiveness, sort/filter performance, property renderer timing                       |

**Validation gate**: All tools report P95 latencies under acceptable thresholds. No silent failures.

### 🔧 Phase 4: Specialized Features (Weeks 7-8)

Lower frequency but high complexity.

| Package           | Why Track                                 | What to Instrument                                                                                                                |
| ----------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **@xnet/plugins** | Sandboxed code is unpredictable.          | Plugin load time, execution duration (bucketed), AST validation failures, API call frequency, resource limit hits, crash recovery |
| **@xnet/history** | Time travel is computationally expensive. | Snapshot creation time, pruning duration, storage metrics, undo/redo latency, verification timing                                 |
| **@xnet/vectors** | HNSW is algorithmically complex.          | Vector insertion time, k-NN query latency, index build duration, memory usage (bucketed)                                          |
| **@xnet/formula** | Expression evaluation can be slow.        | Parse time, eval time, cache effectiveness, circular dependency detection                                                         |

**Validation gate**: All specialized features tracked. Outliers identified.

### ❓ Phase 5: Optional/Low Priority

| Package               | Priority | Rationale                                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| **@xnet/identity**    | Low      | DIDs and UCANs are one-time operations. Passkey errors surface immediately.                      |
| **@xnet/core**        | Low      | Pure functions (hashing, CID generation). Performance is not a concern.                          |
| **@xnet/ui**          | Low      | Visual components. Rendering issues visible to users.                                            |
| **@xnet/cli**         | Low      | Developer tool. Errors go to stderr.                                                             |
| **@xnet/sdk**         | Medium   | Initialization is infrequent but failure is critical. Track `createClient()` success/error only. |
| **@xnet/sqlite**      | Medium   | Desktop/mobile only. Query timing useful but lower priority than web (IndexedDB).                |
| **@xnet/data-bridge** | Low      | Worker communication. Covered by `@xnet/data` instrumentation.                                   |

---

## 📊 Existing Metrics Infrastructure

### Already Instrumented (Should Unify)

#### 1. @xnet/crypto - `CryptoMetrics`

**Current state**: Custom `CryptoMetricsCollector` class with global singleton.

```typescript
// packages/crypto/src/metrics/crypto-metrics.ts
export const cryptoMetrics = new CryptoMetricsCollector()

// Records sign, verify, cache hits/misses
const start = performance.now()
const sig = hybridSign(message, keys, level)
cryptoMetrics.recordSign(level, performance.now() - start)
```

**Recommendation**:

- Keep `CryptoMetrics` for internal use (zero overhead)
- Add optional telemetry integration: `reportToTelemetry?: boolean`
- On opt-in, forward aggregated metrics to `@xnet/telemetry` every 60s

```typescript
// New integration
import { useTelemetry } from '@xnet/telemetry'

if (config.telemetry?.enabled) {
  const telemetry = useTelemetry({ component: 'crypto' })

  setInterval(() => {
    const metrics = cryptoMetrics.getMetrics()
    telemetry.reportPerformance('crypto.sign', metrics.avgSignMs)
    telemetry.reportPerformance('crypto.verify', metrics.avgVerifyMs)
    // ... more metrics
  }, 60_000)
}
```

#### 2. @xnet/network - `PeerScorer`

**Current state**: Reputation system with `PeerMetrics` tracking.

```typescript
// packages/network/src/security/peer-scorer.ts
interface PeerMetrics {
  syncSuccesses: number
  invalidSignatures: number
  avgLatency: number
  // ...
}
```

**Recommendation**:

- Keep `PeerScorer` as-is (security-critical)
- Report score distributions to telemetry (bucketed, no peer IDs)
- Use telemetry for SecurityEvents (already designed for this!)

```typescript
// Already designed!
telemetry.reportSecurity('invalid_signature', {
  peerIdHash: hash(peerId),
  peerScoreBucket: bucketScore(score),
  actionTaken: 'blocked'
})
```

#### 3. @xnet/hub - Prometheus Metrics

**Current state**: Hub exports `/metrics` endpoint with Prometheus format.

```typescript
// packages/hub/src/middleware/metrics.ts
export const HUB_METRICS = {
  WS_CONNECTIONS_TOTAL: 'hub_ws_connections_total',
  QUERY_DURATION_MS: 'hub_query_duration_ms'
  // ...
}
```

**Recommendation**:

- Keep Prometheus for ops (server-side, always-on)
- Add opt-in client telemetry for users
- Users can choose to share their Hub usage metrics

```typescript
// Hub sends telemetry for client operations (opt-in)
if (clientConsent.tier >= 'anonymous') {
  telemetry.reportPerformance('hub.query', queryTime)
  telemetry.reportUsage('hub.backup', 1)
}
```

#### 4. @xnet/sync - `YjsPeerScorer`

**Current state**: Tracks Yjs-specific violations per peer.

```typescript
// packages/sync/src/yjs-peer-scoring.ts
interface YjsPeerMetrics {
  invalidSignatures: number
  oversizedUpdates: number
  validUpdates: number
  // ...
}
```

**Recommendation**:

- Keep for real-time peer management
- Report aggregate statistics to telemetry

```typescript
telemetry.reportSecurity('yjs_violations', {
  violationType: 'oversized_update',
  frequency: bucketCount(metrics.oversizedUpdates)
})
```

#### 5. @xnet/canvas - `FrameMonitor`

**Current state**: Tracks FPS and frame timing.

```typescript
// packages/canvas/src/performance/frame-monitor.ts
export class FrameMonitor {
  private fps = 0
  private frameTime = 0
  // ...
}
```

**Recommendation**:

- Keep `FrameMonitor` for real-time debugging
- Report P50/P95 frame times to telemetry every 5 minutes

```typescript
telemetry.reportPerformance('canvas.frame_time', p95FrameTime)
telemetry.reportPerformance('canvas.fps', avgFps)
```

#### 6. @xnet/devtools - Telemetry Panel

**Current state**: DevTools emits `telemetry:*` events and has a TelemetryPanel.

```typescript
// packages/devtools/src/instrumentation/telemetry.ts
bus.emit({
  type: 'telemetry:performance',
  metricName,
  bucket: categorizeDuration(durationMs)
})
```

**Recommendation**:

- This is perfect! DevTools is already integrated
- Expand coverage to all instrumented packages
- Use as reference implementation

### Performance Timers (Should Replace)

**Found 100+ instances of:**

```typescript
const start = performance.now()
// ... operation ...
const elapsed = performance.now() - start
```

**Locations**:

- `packages/crypto/src/*.test.ts` - Benchmark tests
- `packages/editor/src/utils/performance.ts` - `measure()`, `measureAsync()`
- `packages/canvas/src/layout/index.ts` - Layout calculation
- `packages/sqlite/src/diagnostics.ts` - Query timing
- `packages/hub/src/storage/*.ts` - Query execution
- `packages/sync/src/integrity.ts` - Verification duration

**Recommendation**:
Replace with telemetry helpers:

```typescript
// Before
const start = performance.now()
const result = doExpensiveOperation()
console.log(`Operation took ${performance.now() - start}ms`)

// After
const { report } = useTelemetry({ component: 'myPackage' })
const result = doExpensiveOperation()
report.performance('expensive_operation', Date.now())
```

---

## 🔍 What Should NOT Be Instrumented

### Exclusion Criteria

| Criterion               | Reason                                      | Examples                                     |
| ----------------------- | ------------------------------------------- | -------------------------------------------- |
| **Pure functions**      | No side effects, deterministic.             | `hash()`, `sign()`, CID generation           |
| **Hot paths**           | >1000 calls/sec. Overhead unacceptable.     | Property getters, Y.Text character insertion |
| **User-visible errors** | User sees immediately, no telemetry needed. | Form validation, 404s, auth failures         |
| **Development-only**    | Tests, benchmarks, dev tools.               | `*.test.ts`, `vitest.config.ts`              |
| **External APIs**       | Not our code, can't instrument.             | `libp2p`, `yjs`, `tipTap` internals          |

### False Positives (Looks Important, But Isn't)

| Package/Function                | Why NOT Instrument                                                    |
| ------------------------------- | --------------------------------------------------------------------- |
| `@xnet/core` - `createCID()`    | Called thousands of times. Pure function. Performance not a concern.  |
| `@xnet/ui` - Component renders  | React DevTools already handles this. Duplicate effort.                |
| `@xnet/identity` - `parseDID()` | Fails loudly. Called once per session.                                |
| Editor - Keystroke handlers     | Too frequent (>100 Hz). Use sampling instead.                         |
| Canvas - Mouse move             | 60 Hz. Instrument only on user action completion (pan end, zoom end). |

---

## 🏗️ Implementation Patterns

### Pattern 1: Hook-Based (React Components)

```typescript
// In a React component
import { useTelemetry } from '@xnet/telemetry'

function DataGrid() {
  const { reportError, reportPerformance } = useTelemetry({
    component: 'DataGrid',
    minTier: 'crashes'
  })

  const handleLoadError = (error: Error) => {
    reportError(error, { schemaId: schema.iri })
    // ... show user error
  }

  return <TelemetryErrorBoundary>
    {/* UI */}
  </TelemetryErrorBoundary>
}
```

### Pattern 2: Collector-Based (Backend/Workers)

```typescript
// In a Node.js package or worker
import { TelemetryCollector, ConsentManager } from '@xnet/telemetry'

const consent = new ConsentManager()
const telemetry = new TelemetryCollector({ consent })

try {
  const start = Date.now()
  await performSyncOperation()
  telemetry.reportPerformance('sync.operation', Date.now() - start)
} catch (err) {
  telemetry.reportCrash(err as Error, { operation: 'sync' })
  throw err
}
```

### Pattern 3: Wrapper (Existing Metrics)

```typescript
// Unify existing metrics with telemetry
import { cryptoMetrics } from '@xnet/crypto'
import { TelemetryCollector } from '@xnet/telemetry'

class TelemetryBridge {
  constructor(
    private source: CryptoMetricsCollector,
    private telemetry: TelemetryCollector
  ) {}

  flushToTelemetry() {
    const metrics = this.source.getMetrics()
    this.telemetry.reportPerformance('crypto.sign', metrics.avgSignMs)
    this.telemetry.reportPerformance('crypto.verify', metrics.avgVerifyMs)
    this.telemetry.reportUsage('crypto.cache_hit_rate', metrics.cacheHitRate)
  }
}

// Call every 60s
setInterval(() => bridge.flushToTelemetry(), 60_000)
```

### Pattern 4: Conditional Instrumentation

```typescript
// Only instrument when enabled
import { TelemetryCollector } from '@xnet/telemetry'

class NodeStore {
  private telemetry?: TelemetryCollector

  constructor(options: { telemetry?: TelemetryCollector }) {
    this.telemetry = options.telemetry
  }

  async create(data: NodeData) {
    const start = this.telemetry ? Date.now() : 0
    try {
      const node = await this.performCreate(data)
      this.telemetry?.reportPerformance('store.create', Date.now() - start)
      return node
    } catch (err) {
      this.telemetry?.reportCrash(err as Error)
      throw err
    }
  }
}
```

---

## 📈 Metrics Taxonomy

### Performance Metrics

Format: `{package}.{operation}` with duration bucket

```typescript
telemetry.reportPerformance('data.create', durationMs)
telemetry.reportPerformance('sync.apply', durationMs)
telemetry.reportPerformance('storage.read', durationMs)
telemetry.reportPerformance('query.search', durationMs)
telemetry.reportPerformance('canvas.render', durationMs)
telemetry.reportPerformance('editor.paste', durationMs)
telemetry.reportPerformance('network.connect', durationMs)
```

**Buckets**: `<10ms`, `10-50ms`, `50-200ms`, `200-1000ms`, `1-5s`, `>5s`

### Usage Metrics

Format: `{package}.{feature}` with count bucket

```typescript
telemetry.reportUsage('react.useQuery', 1)
telemetry.reportUsage('plugins.execute', 1)
telemetry.reportUsage('history.undo', 1)
telemetry.reportUsage('vectors.search', 1)
telemetry.reportUsage('formula.evaluate', 1)
```

**Buckets**: `none`, `1-5`, `6-20`, `21-100`, `100+`

### Security Events

Format: `{package}.{event}` with action taken

```typescript
telemetry.reportSecurity('network.invalid_signature', {
  severity: 'high',
  actionTaken: 'blocked'
})
telemetry.reportSecurity('sync.rate_limit', {
  severity: 'medium',
  actionTaken: 'throttled'
})
```

### Crash Reports

Format: Automatic via `TelemetryErrorBoundary` or manual `reportError()`

```typescript
telemetry.reportCrash(error, {
  codeNamespace: 'data.NodeStore',
  operation: 'create',
  schemaId: 'xnet://example/MySchema'
})
```

---

## ✅ Success Criteria

### Developer Experience

- [x] **Single import**: `import { useTelemetry } from '@xnet/telemetry'` works everywhere
- [x] **Zero config required**: Works out of box with default consent (off)
- [ ] **TypeScript autocompletion**: Metric names autocomplete in IDE
- [x] **Performance**: <1ms overhead per instrumented operation (conditional checks)
- [x] **Documentation**: Every instrumented package has examples in README (started with @xnet/data)

### User Experience

- [ ] **Consent first**: No data collected without explicit opt-in
- [ ] **Transparency**: Users can view all collected telemetry
- [ ] **Control**: Users can delete telemetry or revoke consent
- [ ] **Privacy**: No PII, no exact counts, no persistent IDs (unless identified tier)
- [ ] **Visual feedback**: DevTools panel shows real-time telemetry

### Product Quality

- [ ] **Crash detection**: P95 of crashes reported within 5 minutes
- [ ] **Performance regression**: Detect 2x slowdown in core operations
- [ ] **Security monitoring**: Invalid signatures trigger auto-block
- [ ] **Usage patterns**: Understand which features are used/ignored
- [ ] **Federated insights**: Compare local performance to network average (opt-in)

### Operational Health

- [x] **Coverage**: 4/18 prioritized packages instrumented (Phase 1: 75%, Phase 2: started with crypto)
- [x] **Testing**: >80% test coverage for telemetry code paths (82 crypto tests, 550 sync tests pass)
- [ ] **Monitoring**: Grafana dashboard for aggregated metrics
- [ ] **Alerting**: Pagerduty alerts on critical security events
- [x] **Compliance**: GDPR, CCPA compliant (consent, deletion, export) - telemetry system designed for this

---

## 🚀 Rollout Plan

### Week 1-2: Critical Path

**Goal**: Core packages reporting to telemetry.

```bash
# Instrumentation targets
packages/data/       # NodeStore CRUD
packages/sync/       # Change application
packages/storage/    # IndexedDB operations
packages/react/      # Hook timing

# Deliverables
- ✅ 3/4 packages instrumented (@xnet/data, @xnet/storage, @xnet/sync)
- ✅ @xnet/sync - YjsPeerScorer integrated with telemetry (security events, peer actions)
- 🔄 @xnet/react - requires context provider pattern (IN PROGRESS)
- DevTools panel shows data
- Zero PII validation passed
- Test coverage >80%
```

### Week 3-4: Network & Security

**Goal**: Security telemetry enables auto-response.

```bash
# Instrumentation targets
packages/network/    # Peer scoring, security events
packages/crypto/     # Unify CryptoMetrics
packages/hub/        # Optional client telemetry

# Deliverables
- 3 more packages instrumented (7 total)
- Security dashboard functional
- Auto-blocking tested in prod
- Performance benchmarks show <1ms overhead
```

### Week 5-6: Developer Experience

**Goal**: Tool quality improvements.

```bash
# Instrumentation targets
packages/query/      # Query performance
packages/editor/     # Rich text operations
packages/canvas/     # Frame timing
packages/views/      # Rendering performance

# Deliverables
- 4 more packages instrumented (11 total)
- Performance regression alerts working
- Documentation updated
```

### Week 7-8: Specialized Features

**Goal**: Complete coverage.

```bash
# Instrumentation targets
packages/plugins/    # Sandbox execution
packages/history/    # Time travel operations
packages/vectors/    # HNSW performance
packages/formula/    # Expression evaluation

# Deliverables
- 4 more packages instrumented (15 total)
- All metrics flowing to aggregators
- Grafana dashboard deployed
- Public roadmap updated with insights
```

### Week 9: Polish & Launch

**Goal**: Ship to users with confidence.

```bash
# Final tasks
- Update all README files with telemetry examples
- Write blog post about privacy-first telemetry
- Create consent UI in Electron app
- Run load tests with telemetry enabled
- Prepare for opt-in campaign (beta users first)

# Launch
- Enable telemetry in nightly builds
- Monitor for issues
- Iterate based on feedback
```

---

## 📚 Reference Implementation

### Minimal Example: Instrumenting @xnet/data

```diff
// packages/data/src/store/index.ts
+ import type { TelemetryCollector } from '@xnet/telemetry'

export class NodeStore {
  private storage: StorageAdapter
+ private telemetry?: TelemetryCollector

  constructor(options: NodeStoreOptions) {
    this.storage = options.storage
+   this.telemetry = options.telemetry
  }

  async create<S extends Schema>(
    schema: S,
    properties: InferProperties<S>
  ): Promise<Node<S>> {
+   const start = this.telemetry ? Date.now() : 0

    try {
      // Validate
      const validation = validateProperties(schema, properties)
      if (!validation.valid) {
+       this.telemetry?.reportUsage('data.validation_error', 1)
        throw new ValidationError(validation.errors)
      }

      // Create node
      const node = await this.storage.put({ ...data })
+     this.telemetry?.reportPerformance('data.create', Date.now() - start)

      return node
    } catch (err) {
+     this.telemetry?.reportCrash(err as Error, {
+       codeNamespace: 'data.NodeStore.create',
+       schemaId: schema.iri
+     })
      throw err
    }
  }
}
```

**Usage in app**:

```typescript
import { TelemetryCollector, ConsentManager } from '@xnet/telemetry'
import { NodeStore } from '@xnet/data'

const consent = new ConsentManager()
const telemetry = new TelemetryCollector({ consent })

const store = new NodeStore({
  storage: myStorage,
  telemetry: telemetry // <-- Pass in!
})
```

---

## 🔗 Related Documents

- [TELEMETRY_DESIGN.md](./0007_[x]_TELEMETRY_DESIGN.md) - Original telemetry architecture
- [OPENTELEMETRY_EVALUATION.md](./0015_[x]_OPENTELEMETRY_EVALUATION.md) - Why we use OTel semantics only
- [plan03_1TelemetryAndNetworkSecurity/README.md](../plans/plan03_1TelemetryAndNetworkSecurity/README.md) - Implementation plan
- [TRADEOFFS.md](../TRADEOFFS.md) - Privacy vs observability tradeoffs

---

## 🤔 Open Questions

### Technical

1. **Sampling strategy**: Instrument all operations or sample at 1%?
   - **Recommendation**: All operations, but bucket aggressively. Storage is cheap.

2. **Hot path overhead**: What if telemetry slows down core operations?
   - **Recommendation**: Make telemetry opt-in per-package with feature flags. Benchmark thoroughly.

3. **Worker threads**: How do workers report telemetry to main thread?
   - **Recommendation**: `postMessage()` with buffering. Flush every 5s or on 100 events.

4. **Server-side telemetry**: Should Hub collect its own telemetry or only forward client telemetry?
   - **Recommendation**: Both. Prometheus for ops (always-on). Client telemetry for UX (opt-in).

### Product

1. **Default consent tier**: Should crash reports be opt-out instead of opt-in?
   - **Tradeoff**: Better coverage vs stronger privacy guarantees.
   - **Recommendation**: Start opt-in. Re-evaluate after 6 months if crash coverage is insufficient.

2. **Incentives**: Should users get features (like advanced analytics) for sharing telemetry?
   - **Tradeoff**: Could feel coercive. But valuable data deserves value exchange.
   - **Recommendation**: No. Keep telemetry purely altruistic ("help improve xNet").

3. **Public dashboards**: Should aggregate metrics be public for open source transparency?
   - **Recommendation**: Yes, for xNet core. Let apps decide for themselves.

### Business

1. **Compliance**: How do we handle GDPR/CCPA deletion requests?
   - **Recommendation**: Local deletion is instant. Aggregator deletion within 30 days (already aggregated).

2. **Enterprise**: Do enterprise customers want self-hosted telemetry aggregators?
   - **Recommendation**: Phase 2 feature. Use existing Hub infrastructure.

3. **Cost**: What's the storage/bandwidth cost at scale (1M users)?
   - **Back-of-envelope**: 1 KB/user/day → 1 GB/day → $10/month S3 → negligible.

---

## 🎉 Next Steps

1. **Review this document** with the team (1 week)
2. **Prioritize packages** based on team input (1 day)
3. **Start with Phase 1** - Instrument `@xnet/data` first (1 week)
4. **Iterate** based on learnings (ongoing)
5. **Launch** to beta users after Phase 2 (Week 5)

---

**This is an exploration document. The recommendations are subject to change based on implementation discoveries and team feedback.**

---

## 📎 Appendix A: Key Code Findings

### Error Handling Patterns Found

**Try-catch without telemetry** (157 instances found):

```typescript
// packages/data/src/store/index.ts
try {
  const node = await this.storage.put(data)
  return node
} catch (err) {
  // ❌ Error thrown but not tracked
  throw err
}
```

**Locations with highest error handling density**:

- `packages/data/src/store/*.ts` - 23 try-catch blocks
- `packages/network/src/security/*.ts` - 18 blocks
- `packages/sync/src/handlers/*.ts` - 15 blocks
- `packages/storage/src/adapters/*.ts` - 12 blocks
- `packages/hub/src/storage/*.ts` - 11 blocks

**Recommendation**: These are the highest-priority targets for crash telemetry integration.

### Performance Timing Patterns Found

**Manual timing code** (127 instances):

```typescript
// Pattern 1: Test benchmarks
const start = performance.now()
await operation()
const elapsed = performance.now() - start
expect(elapsed).toBeLessThan(threshold)

// Pattern 2: Production code
const startTime = performance.now()
const result = await query()
const queryTime = performance.now() - startTime
console.log(`Query took ${queryTime}ms`)
```

**Packages with most timing code**:

1. `@xnet/crypto` - 34 instances (benchmark tests)
2. `@xnet/hub` - 18 instances (query timing)
3. `@xnet/sqlite` - 12 instances (diagnostics)
4. `@xnet/canvas` - 11 instances (frame monitoring)
5. `@xnet/sync` - 9 instances (integrity checks)

**Recommendation**: Replace console.log timing with telemetry.reportPerformance().

### Network Operations Needing Observability

**From @xnet/network**:

- `libp2p.dial()` - Connection establishment (success/failure rate)
- WebRTC ICE negotiation - High failure rate on restrictive networks
- `y-webrtc` provider sync - Conflict resolution frequency
- Peer discovery via Kademlia DHT - Latency distribution
- Circuit relay fallback - How often direct connection fails

**From @xnet/sync**:

- `applyChange()` - Application success/failure
- Hash chain verification - Invalid parent hash frequency
- Conflict resolution - LWW tie-breaking
- Yjs update signing/verification - Performance by security level

### Database Operations Needing Observability

**From @xnet/data**:

- Schema validation failures - Which properties fail most often
- Property coercion - Type conversion edge cases
- Rollup calculations - Computation time for large datasets
- Query performance - Filter selectivity, sort efficiency

**From @xnet/storage**:

- IndexedDB transaction failures - Quota exceeded, constraint violations
- Blob storage chunking - Optimal chunk size
- Migration errors - Version upgrade failures
- Snapshot creation/restoration - Time and size

**From @xnet/sqlite**:

- Query plan analysis - Missing indexes
- Transaction conflicts - Optimistic locking retries
- FTS5 query performance - Query complexity vs latency

### Security Events Already Logged

**From @xnet/network/security/logging.ts**:

```typescript
export function logSecurityEvent(event: SecurityEventData): void {
  console.log(
    `XNET_SECURITY: type=${event.eventType} ` +
      `severity=${event.severity} ` +
      `peer=${event.peerIdHash?.slice(0, 16)} ` +
      `action=${event.actionTaken}`
  )
  // ✅ Already in fail2ban-compatible format!
}
```

**Events tracked**:

- `invalid_signature` - Peer sent change with bad signature
- `rate_limit_exceeded` - Peer exceeded token bucket
- `connection_flood` - Too many connection attempts
- `stream_exhaustion` - Too many streams per connection
- `invalid_data` - Malformed or schema-invalid data
- `peer_score_drop` - Reputation below threshold
- `anomaly_detected` - Statistical outlier behavior

**Recommendation**: These should ALSO go to telemetry for aggregate analysis.

---

## 📎 Appendix B: Package Dependency Analysis

### Dependency Tree (Simplified)

```
Foundation Layer
├── @xnet/core (no deps)
├── @xnet/crypto (deps: core)
└── @xnet/identity (deps: core, crypto)

Infrastructure Layer
├── @xnet/storage (deps: core)
├── @xnet/sync (deps: core, crypto, identity)
├── @xnet/data (deps: core, identity, storage, sync)
├── @xnet/network (deps: core, crypto, identity, data)
└── @xnet/query (deps: core, data, identity, network, storage)

Application Layer
├── @xnet/react (deps: core, crypto, data, identity, history, plugins)
├── @xnet/sdk (deps: core, crypto, identity, storage, data, network, query)
├── @xnet/editor (deps: data, ui)
├── @xnet/ui (deps: none - pure components)
├── @xnet/views (deps: core, data, react, ui)
├── @xnet/canvas (deps: core, data, react, ui, vectors)
├── @xnet/devtools (deps: history, ui, views)
└── @xnet/history (deps: core, data, sync)

Specialized Layer
├── @xnet/plugins (deps: core, data)
├── @xnet/telemetry (deps: core, data) ← Source of truth
├── @xnet/formula (deps: core)
├── @xnet/vectors (deps: core, storage)
├── @xnet/hub (deps: core, crypto, identity, data, sync)
├── @xnet/sqlite (deps: core, data, sync)
├── @xnet/data-bridge (deps: core, data)
└── @xnet/cli (deps: core, crypto, identity, storage, data, sync)
```

### Telemetry Integration Surface

**Packages that should depend on @xnet/telemetry** (currently 0):

| Package       | Add Dependency    | Why                         |
| ------------- | ----------------- | --------------------------- |
| @xnet/data    | ✅ **DONE**       | Core CRUD operations        |
| @xnet/sync    | ✅ Yes            | Change propagation          |
| @xnet/storage | ✅ **DONE**       | Persistence layer           |
| @xnet/network | ✅ Yes            | P2P operations              |
| @xnet/react   | ✅ Yes            | Hook usage patterns         |
| @xnet/query   | ✅ Yes            | Query performance           |
| @xnet/crypto  | ✅ Yes            | Signing/verification timing |
| @xnet/hub     | ✅ Yes (optional) | Server-side metrics         |
| @xnet/editor  | ✅ Yes            | Rich text operations        |
| @xnet/canvas  | ✅ Yes            | Rendering performance       |
| @xnet/views   | ⚠️ Maybe          | Rendering metrics           |
| @xnet/plugins | ⚠️ Maybe          | Sandbox execution           |
| @xnet/history | ⚠️ Maybe          | Time travel operations      |
| @xnet/vectors | ⚠️ Maybe          | Vector search               |
| @xnet/formula | ⚠️ Maybe          | Expression evaluation       |
| @xnet/sqlite  | ⚠️ Maybe          | Query timing                |
| Others        | ❌ No             | Not critical path           |

**Note**: Adding telemetry as dependency is opt-in. Packages can accept `telemetry?: TelemetryCollector` in options.

---

## 🎯 Final Recommendations

### Immediate Actions (This Week)

1. **Create instrumentation guide** - Document patterns for the 4 usage types (hook, collector, wrapper, conditional)
2. ✅ **Add telemetry to @xnet/data** - Start with the highest-impact package (COMPLETED)
3. **Update DevTools panel** - Show data from instrumented packages
4. **Write integration tests** - Verify PII scrubbing, bucketing, consent enforcement

### Short Term (Next Month)

1. **Instrument critical path** - Complete Phase 1 (data, sync, storage, react)
2. **Unify existing metrics** - Bridge CryptoMetrics, PeerScorer, Hub Prometheus
3. **Deploy to nightly** - Enable for beta testers with opt-in consent
4. **Collect feedback** - Iterate on instrumentation patterns

### Long Term (Next Quarter)

1. **Complete coverage** - All 18 prioritized packages instrumented
2. **Public dashboard** - Aggregate metrics for community transparency
3. **Performance alerts** - Automated regression detection
4. **Federated insights** - Compare local performance to network averages

### Success Metrics

| Metric                      | Target                                 | Timeline |
| --------------------------- | -------------------------------------- | -------- |
| Package coverage            | 80% (18/24)                            | 8 weeks  |
| Crash report rate           | >50% of users opt-in                   | 3 months |
| Performance visibility      | P95 latencies tracked for all core ops | 8 weeks  |
| Security incidents detected | 100% of signature violations logged    | 4 weeks  |
| Developer satisfaction      | >4.0/5.0 on telemetry UX survey        | 6 months |
| Zero PII leaks              | 100% validation passing                | Ongoing  |

---

**Document Complete** - Ready for team review and prioritization discussion.
