# 15. Future Work: Advanced Capabilities

> Deferred enhancements that build on the local-first foundation

## Overview

This document catalogs advanced features that are **not in the current implementation scope** but are enabled by the infrastructure we're building. The current plan focuses on local-first telemetry and network security; these features represent the next evolution.

## 1. Web of Trust

### Concept

Social graph-based trust propagation. Instead of each node scoring peers independently, trust flows through vouching relationships.

```typescript
// Future API concept
interface WebOfTrust {
  // A vouches for B (signed attestation)
  vouch(peerDid: DID, trustLevel: number, context?: string): Promise<Vouch>

  // Compute transitive trust (A trusts B, B trusts C → A partially trusts C)
  computeTrust(peerDid: DID, maxDepth?: number): Promise<TrustScore>

  // Get vouching chain for transparency
  getVouchPath(peerDid: DID): Promise<VouchChain>
}

// Trust decays with distance
// Level 1 (direct vouch): 100% of vouch value
// Level 2 (friend of friend): 50% of vouch value
// Level 3+: 25% of vouch value (capped)
```

### Why Deferred

- Requires DID-based identity to be more mature
- Sybil resistance in open networks is an unsolved problem
- UX for vouching needs careful design
- Current peer scoring provides adequate protection

### Infrastructure Ready

- `@xnet/identity` provides DIDs for vouching
- `PeerScorer` can be extended with trust inputs
- Node-based storage can hold `Vouch` attestations
- UCAN tokens can encode trust delegations

### Research Pointers

- [Advogato Trust Metric](http://www.advogato.org/trust-metric.html) - Network flow approach
- [EigenTrust](https://nlp.stanford.edu/pubs/eigentrust.pdf) - Distributed reputation
- [Stellar Consensus](https://www.stellar.org/papers/stellar-consensus-protocol) - Federated trust

## 2. AI-Assisted Attack Detection

### Concept

Machine learning models that classify network behavior and detect novel attacks beyond rule-based thresholds.

```typescript
// Future API concept
interface AttackClassifier {
  // Classify a sequence of events
  classify(events: SecurityEvent[]): Promise<Classification>

  // Anomaly detection on peer behavior
  detectAnomalies(peerHistory: PeerBehavior[]): Promise<AnomalyScore>

  // Explain why something was flagged (interpretability)
  explain(classification: Classification): Promise<Explanation>
}

interface Classification {
  attackType: 'sybil' | 'eclipse' | 'dos' | 'replay' | 'unknown' | 'benign'
  confidence: number // 0-1
  features: string[] // Which features triggered
}
```

### Why Deferred

- Requires labeled training data (we don't have attacks yet)
- Model complexity vs. battery/CPU impact
- False positives worse than missed attacks in early network
- Rule-based detection sufficient for launch

### Infrastructure Ready

- `SecurityEvent` schema captures training data
- `@xnet/telemetry` can export datasets for offline training
- Local-first means models can run on-device (no cloud dependency)
- Event bucketing provides feature extraction foundation

### Potential Approaches

| Approach                 | Pros                              | Cons                     |
| ------------------------ | --------------------------------- | ------------------------ |
| Local ML (TensorFlow.js) | Privacy, works offline            | Limited model size       |
| Federated learning       | Privacy + collective intelligence | Complex coordination     |
| Rule-based + ML hybrid   | Best of both                      | Engineering complexity   |
| Anomaly detection only   | No labels needed                  | High false positive rate |

### Research Pointers

- [Federated Learning](https://ai.googleblog.com/2017/04/federated-learning-collaborative.html) - Google's approach
- [USENIX ATC: Federated Analytics](https://www.usenix.org/conference/atc20/presentation/fereidooni) - Privacy-preserving aggregation
- [Isolation Forest](https://scikit-learn.org/stable/modules/outlier_detection.html) - Anomaly detection

## 3. Federated Threat Intelligence

### Concept

Privacy-preserving sharing of threat information across the network without revealing who reported what.

```typescript
// Future API concept
interface ThreatIntelligence {
  // Report a bad actor (anonymized)
  reportThreat(threat: ThreatReport): Promise<void>

  // Query if a peer has been reported (without revealing reporters)
  queryReputation(peerId: PeerId): Promise<ReputationSummary>

  // Subscribe to high-severity threats
  subscribe(severity: 'high' | 'critical'): AsyncIterable<ThreatAlert>
}

interface ThreatReport {
  peerIdHash: string // Hashed, not raw
  threatType: string
  evidence: string // Scrubbed event data
  timestamp: number // Bucketed to week
}
```

### Why Deferred

- Privacy vs. utility tradeoff is hard
- Potential for abuse (false reports)
- Requires trusted aggregation (or crypto magic)
- Network too small to benefit initially

### Infrastructure Ready

- `PeerScorer` produces the scores to share
- `SecurityEvent` schema has the data format
- P3A-style bucketing already anonymizes data
- UCAN can authorize aggregator access

### Privacy Techniques to Explore

| Technique            | Description                   | Tradeoff              |
| -------------------- | ----------------------------- | --------------------- |
| Bloom filters        | Probabilistic membership test | False positives       |
| Secure aggregation   | Sum without revealing inputs  | Coordination overhead |
| Differential privacy | Add noise to aggregates       | Accuracy loss         |
| Threshold signatures | N-of-M to reveal              | Requires coordination |

## 4. Aggregator Nodes

### Concept

Volunteer-run nodes that aggregate telemetry for the xNet project (not user data, just app telemetry).

```typescript
// Future aggregator API concept
interface TelemetryAggregator {
  // Accept anonymized telemetry
  ingest(batch: ScrubedTelemetry[]): Promise<void>

  // Query aggregates (not individual reports)
  query(metric: string, timeRange: TimeRange): Promise<AggregateResult>

  // Health check
  status(): Promise<AggregatorStatus>
}

// Aggregator selection
interface AggregatorRegistry {
  // Find aggregators (could be decentralized via DHT)
  discover(): Promise<Aggregator[]>

  // User selects which aggregator to trust
  select(aggregatorDid: DID): void
}
```

### Why Deferred

- Server infrastructure outside current scope
- Requires aggregator trust model
- Legal/compliance considerations
- Local-only telemetry sufficient for v1

### Infrastructure Ready

- `@xnet/telemetry` can batch and send
- Consent tiers already define what can be shared
- Scrubbing ensures aggregator never sees PII
- Node sync could be repurposed for telemetry sync

## 5. Developer Dashboards

### Concept

Web-based dashboards for app developers to understand their user base (with consent).

```
+------------------------------------------+
| xNet Developer Dashboard                  |
+------------------------------------------+
| Active Users (bucketed): 1K-10K          |
| Crash-free rate: 98.5%                   |
|                                          |
| Top Crashes (last 7 days):               |
| 1. RangeError in sync.ts (23 reports)    |
| 2. NetworkError in fetch.ts (12 reports) |
|                                          |
| Platform Distribution:                   |
| [████████░░] macOS 80%                   |
| [██░░░░░░░░] iOS 20%                     |
+------------------------------------------+
```

### Why Deferred

- Requires aggregator infrastructure
- Web dashboard outside current scope
- Privacy review needed for any aggregate display
- Focus is on local observability first

### Infrastructure Ready

- Telemetry schemas define what's collected
- Bucketing ensures no exact counts displayed
- Consent system ensures opt-in

## 6. Differential Privacy

### Concept

Mathematical privacy guarantees for aggregate queries by adding calibrated noise.

```typescript
// Future API concept
interface DifferentialPrivacy {
  // Add noise to a count query
  privateCount(
    trueCount: number,
    epsilon: number, // Privacy budget
    sensitivity: number
  ): number

  // Track privacy budget consumption
  budgetRemaining(): number
}

// Example: "How many users crashed?"
// True count: 47
// With ε=1: might return 45 or 52 (Laplace noise)
// Guarantees: removing any one user changes result by at most e^ε
```

### Why Deferred

- Only useful with aggregation (not local-first)
- Epsilon selection requires expertise
- P3A bucketing provides "good enough" privacy
- Complexity vs. benefit unclear at current scale

### Infrastructure Ready

- Bucketing is a form of local differential privacy
- Random timing already adds noise
- Could be added to aggregator layer later

### Research Pointers

- [Google RAPPOR](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/42852.pdf) - Randomized aggregatable privacy-preserving ordinal response
- [Apple Differential Privacy](https://www.apple.com/privacy/docs/Differential_Privacy_Overview.pdf) - Local differential privacy
- [OpenDP](https://opendp.org/) - Open-source differential privacy library

## 7. Self-Healing Network

### Concept

Automatic network topology optimization based on peer quality scores.

```typescript
// Future API concept
interface NetworkOptimizer {
  // Suggest better peers based on latency, reliability, trust
  suggestPeers(workspace: WorkspaceId): Promise<PeerSuggestion[]>

  // Automatically rotate connections to improve health
  optimizeConnections(): Promise<OptimizationResult>

  // Detect and route around partitions
  detectPartitions(): Promise<Partition[]>
}
```

### Why Deferred

- Requires mature peer scoring
- Network effects unclear at small scale
- Could introduce new attack vectors
- Simple connection management sufficient

### Infrastructure Ready

- `PeerScorer` provides quality signals
- Connection limits enable rotation
- libp2p has peer selection hooks

## Implementation Priority

When ready to expand, suggested priority:

| Priority | Feature                | Reason                                     |
| -------- | ---------------------- | ------------------------------------------ |
| 1        | Aggregator Nodes       | Enables crash monitoring for development   |
| 2        | Developer Dashboards   | Makes aggregator data useful               |
| 3        | Web of Trust           | Improves Sybil resistance as network grows |
| 4        | Federated Threat Intel | Collective defense at scale                |
| 5        | AI Detection           | Requires training data from 1-4            |
| 6        | Differential Privacy   | Academic rigor for aggregates              |
| 7        | Self-Healing           | Optimization, not critical path            |

## Design Constraints

Any future implementation should maintain:

1. **User sovereignty** - Users always control their data
2. **Local-first** - Features work offline, sync is additive
3. **Opt-in only** - No silent data collection ever
4. **Inspectable** - Users can see what's being shared
5. **Deletable** - Users can remove their contributions
6. **Decentralized** - No single point of failure or trust

## Migration Path

Current infrastructure to future features:

```
Current (This Plan)          Future Enhancement
────────────────────         ──────────────────
PeerScorer.score        →    WebOfTrust.computeTrust
SecurityEvent           →    AttackClassifier training data
TelemetryCollector      →    Aggregator.ingest source
ConsentManager          →    Aggregator selection UI
Scrubbing + Bucketing   →    Differential privacy primitives
fail2ban logging        →    Federated threat reports
```

## Open Questions

For future planning sessions:

1. **Aggregator trust**: How do users choose which aggregator to trust?
2. **Vouch incentives**: Why would users vouch for peers?
3. **Model updates**: How do ML models get updated without phoning home?
4. **Partition tolerance**: How does threat intel work across network partitions?
5. **Revocation**: How do users revoke consent for already-shared data?

---

[Previous: Security Dashboard](./14-security-dashboard.md) | [Back to Overview](./README.md)
