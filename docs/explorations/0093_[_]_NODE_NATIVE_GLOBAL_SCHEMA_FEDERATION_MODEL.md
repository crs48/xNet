# 0093 - Node-Native Global Schema Federation Model (Replacing REST-Centric Control Plane)

> **Status:** Exploration  
> **Tags:** schema, federation, node-store, event-log, ucan, authz, multi-hub, capability-security, local-first  
> **Created:** 2026-02-20  
> **Context:** Rewrite of `0091` with nodes (signed changes + replication) as the canonical primitive for schema/system metadata exchange, keeping REST only as optional projection/interop edge.

## Executive Take

xNet already has most of the primitives needed to stop treating schema federation as REST-first and move to a node-native control plane:

1. **Canonical truth should be system nodes, not route handlers.** Schema definitions, grants, sync policy, and presence should be represented as typed nodes in reserved namespaces.
2. **Transport should reuse existing signed change replication.** `node-change` / `node-sync-request` channels already enforce signed, hash-verified change flow.
3. **Authorization should stay capability-first.** Existing `hub/*` + resource patterns can scope access to system namespaces exactly like user data.
4. **REST should remain as projection and compatibility.** `/schemas` and similar endpoints become derived views over system-node state for external tooling.

If we do this, xNet gets one mental model for user data and control plane data: **everything is a node, validated by schema, replicated by policy, authorized by capability.**

---

## What This Rewrites From 0091

`0091` identified the right missing pieces (presence index, scoped authz, policy engine, discovery).  
This rewrite changes the implementation center of gravity:

- From: add more REST endpoints as primary control plane
- To: define system schemas + system namespaces, replicate as nodes, and expose REST as optional projections

```mermaid
flowchart LR
    A[0091 Direction\nREST endpoints + policy APIs] --> B[0093 Direction\nNode-native system graph]
    B --> C[Projection Layer\nREST/CLI/Graph adapters]
    B --> D[Native Layer\nNodeStore + signed changes + UCAN]
```

---

## Codebase Evidence (Current Reality)

The current code already supports most of this move:

- Universal node model with schema IRIs and globally unique IDs in `packages/data/src/schema/node.ts`.
- Node event sourcing + LWW merge + signed changes in `packages/data/src/store/store.ts`.
- Runtime schema registry with remote resolver support in `packages/data/src/schema/registry.ts`.
- Hub already stores/replays serialized node changes in `packages/hub/src/storage/interface.ts`.
- Signed node relay path already exists (`node-change`, hash verification, signature verification) in `packages/hub/src/services/node-relay.ts`.
- Capability checks already support resource wildcards/prefixes in `packages/hub/src/auth/capabilities.ts`.
- Hub server already processes query/index + node sync style WS messages in `packages/hub/src/server.ts`.
- Federation already has schema exposure filtering (`peer.schemas`, `expose.schemas`) in `packages/hub/src/services/federation.ts`.
- React provider is still single active signaling URL (`hubUrl ?? signalingServers?.[0]`) in `packages/react/src/context.ts:398`, so orchestration for multi-hub still needs first-class work.

Conclusion: this is not a greenfield concept. It is mostly a **composition + modeling** problem.

---

## Node-Native Control Plane Model

### Principle

All system metadata is expressed as nodes under reserved namespaces, then replicated via existing sync channels.

```mermaid
flowchart TB
    subgraph DataPlane[Data Plane]
      N1[User Nodes\npage/task/comment]
    end

    subgraph ControlPlane[Control Plane as Nodes]
      N2[SchemaDefinition nodes]
      N3[SchemaCompatibility nodes]
      N4[PresenceSummary nodes]
      N5[SyncPolicy nodes]
      N6[Grant nodes]
    end

    N1 --> E[Change Log]
    N2 --> E
    N3 --> E
    N4 --> E
    N5 --> E
    N6 --> E
    E --> R[Signed replication]
```

### Reserved system namespaces

- `xnet://did:key:<owner>/sys/schema/*`
- `xnet://did:key:<owner>/sys/presence/*`
- `xnet://did:key:<owner>/sys/policy/*`
- `xnet://did:key:<owner>/sys/authz/*`

These are conventions, not hardcoded authorities. They are validated by schema + capability policy.

---

## Proposed System Schemas

Define first-class schemas for control plane entities.

```mermaid
classDiagram
    class SchemaDefinition {
      +id
      +schemaIri
      +version
      +definition
      +authorDid
      +signature
      +publishedAt
      +status
    }

    class SchemaCompatibility {
      +id
      +fromSchema
      +toSchema
      +mode
      +lossless
      +lensRef
    }

    class PresenceSummary {
      +id
      +subjectDid
      +schemaIri
      +namespace
      +nodeCountBucket
      +visibility
      +lastUpdatedAt
    }

    class SyncPolicy {
      +id
      +subjectDid
      +matchRules
      +destinations
      +effectiveFrom
      +revision
    }

    class Grant {
      +id
      +issuer
      +grantee
      +resource
      +actions
      +expiresAt
      +revokedAt
    }

    SchemaDefinition --> SchemaCompatibility : evolves
    SyncPolicy --> PresenceSummary : scopes by
    Grant --> SyncPolicy : gates writes
```

Note: `Grant` already maps to built-in schema patterns and grant indexing behavior in hub query service.

---

## Protocol Rewrite: From REST Calls to Node Changes

### Before (REST-primary)

- Publish schema: `POST /schemas`
- Resolve schema: `GET /schemas/resolve/*`
- Discover schemas: `GET /schemas`

### After (node-primary)

- Publish schema: append `SchemaDefinition` node change
- Resolve schema: query local/replicated `SchemaDefinition` nodes by IRI/version
- Discover schemas: query `PresenceSummary` + visible `SchemaDefinition` nodes

```mermaid
sequenceDiagram
    participant App
    participant Wallet as Identity+Consent
    participant Store as Local NodeStore
    participant Hub as Hub Relay
    participant Peer as Peer Hub

    App->>Wallet: request capability (schema/policy scope)
    Wallet-->>App: scoped UCAN
    App->>Store: create SchemaDefinition node
    Store->>Hub: node-change (signed)
    Hub->>Hub: verify hash + signature
    Hub->>Peer: federated node relay
    Peer->>Peer: apply + index system node
    App->>Store: query resolved schema graph
```

---

## Authorization in a Node-Native World

Use the same capability mechanism, but resource scopes reference system namespaces.

### Capability examples

- `can: hub/relay`, `with: xnet://did:key:alice/sys/schema/*`
- `can: hub/query`, `with: xnet://did:key:alice/sys/presence/*`
- `can: hub/relay`, `with: xnet://did:key:alice/work/*`

### Enforcement points

1. Local create/update/delete authorization in NodeStore hooks.
2. Hub relay authorization for `node-change` and sync request room/resource.
3. Federation exposure filters for system schema namespaces.

```mermaid
stateDiagram-v2
    [*] --> Requested
    Requested --> PolicyCheck
    PolicyCheck --> Allowed: capability + namespace + hub scope
    PolicyCheck --> Denied: missing scope
    Allowed --> RelayCheck
    RelayCheck --> Applied: signature/hash valid
    RelayCheck --> Rejected: invalid signature/hash
    Applied --> [*]
    Denied --> [*]
    Rejected --> [*]
```

---

## Multi-Hub Schema Federation Using Node Replication

Treat each hub as a selective replica target for both user nodes and system nodes.

```mermaid
flowchart LR
    L[(Local NodeStore)] --> H1[(Personal Hub)]
    L --> H2[(Work Hub)]
    L --> H3[(Community Hub)]

    S1[sys/schema/* -> H1,H2]
    S2[sys/policy/* -> local,H1]
    S3[work/* -> H2 only]
    S4[public schema metadata -> H3]

    S1 -.drives.-> L
    S2 -.drives.-> L
    S3 -.drives.-> L
    S4 -.drives.-> L
```

Key design decision: **system nodes can have different replication classes** than user content.

---

## Presence Index as Derived System Nodes

In 0091, presence index was a missing primitive. In this rewrite, it becomes a projection pipeline:

1. Observe NodeStore changes.
2. Incrementally aggregate by `schemaId`, namespace, policy visibility.
3. Emit/update `PresenceSummary` nodes (bucketed/noised as needed).
4. Replicate according to policy.

This keeps presence information inside the same signing, audit, and replication model.

```mermaid
flowchart TB
    C[Incoming node change] --> A[Aggregator]
    A --> B[PresenceSummary upsert]
    B --> P[Policy filter]
    P --> R1[local only]
    P --> R2[trusted apps]
    P --> R3[public metadata]
```

---

## REST Is Still Useful (But Not Canonical)

A complete REST removal is not practical. Instead:

- Keep `/schemas` and related routes as read/write projections for non-native clients.
- Internally convert REST writes into node mutations.
- Internally serve REST reads from system-node materialized indexes.

This is the same boundary pattern identified in `0089`: interop edge is a projection, not the canonical truth.

---

## Migration Strategy

### Stage 0 - Dual write/read (safe transition)

- Existing `/schemas` path remains active.
- Schema publish writes both route storage and system nodes.
- Resolver reads prefer node-backed index, falls back to legacy store.

### Stage 1 - Node-first writes

- Route handlers become translation layer into NodeStore mutations.
- Federation of schema metadata uses node replication path.

### Stage 2 - Projection-only REST

- REST is read projection and compatibility shim.
- Internal workflows and SDK use node-native APIs directly.

```mermaid
journey
    title Migration Journey
    section Platform
      Dual-write period: 3
      Node-first internals: 4
      Projection-only REST: 5
    section Developers
      Existing endpoints still work: 5
      New SDK adopts node-native path: 4
      Full capability-scoped model: 5
```

---

## Risk Analysis

### Key risks

- **Schema poisoning:** malicious peers publish deceptive schema nodes.
- **Metadata leakage:** presence nodes expose sensitive activity signatures.
- **Policy drift:** multi-hub rules accidentally over-replicate system metadata.
- **Replay/duplication:** repeated system-node changes create inconsistent indexes.

### Mitigations

- Require signed `SchemaDefinition` and authority verification.
- Visibility levels + bucketed counts for presence nodes.
- Dry-run policy simulator before apply.
- CID/hash deduplication and monotonic lamport checks on replay.

---

## External Pattern Crosswalk (What To Borrow)

Web and standards review points to several useful patterns:

- **ActivityPub / ActivityStreams:** object-centric federation, globally unique identifiers, collection paging, and extension model via JSON-LD contexts.
- **DID Core:** DID/DID URL model for stable principal/resource addressing and verification methods.
- **UCAN specification:** attenuation, delegation chains, replay-prevention requirements, and capability-oriented auth in local-first systems.
- **Solid WAC:** resource-centric authorization inheritance and effective ACL evaluation concepts.
- **IPLD ecosystem:** node/link-first data modeling, content addressing, and schema-driven graph interoperability.
- **Matrix architecture:** event graph synchronization with eventual consistency and room-scoped federated replication.

What is unique for xNet: combine these patterns around **one universal node/change substrate** for both app data and control metadata.

---

## Recommended Architecture (Practical)

```mermaid
flowchart TB
    subgraph Device
      NS[NodeStore]
      SYS[System Schema Pack\nSchemaDefinition/Policy/Presence]
      IDX[Materialized Indexes]
      PE[Policy Engine]
      CM[Consent Manager]
    end

    subgraph Network
      RELAY[Signed node relay]
      FED[Federation filter]
    end

    subgraph Edge
      REST[REST projection]
      SDK[Node-native SDK]
    end

    NS --> SYS --> IDX
    CM --> PE --> NS
    NS --> RELAY --> FED
    IDX --> REST
    NS --> SDK
```

---

## Implementation Checklist

### Phase 1 - System Schemas and Namespaces

- [ ] Define schemas: `SchemaDefinition`, `SchemaCompatibility`, `PresenceSummary`, `SyncPolicy`.
- [ ] Reserve and document `sys/*` namespace conventions.
- [ ] Add validation + signature requirements for schema-definition nodes.
- [ ] Add schema authority verification rules (did/domain authority constraints).

### Phase 2 - Node-Native Schema Registry

- [ ] Build materialized schema index from system nodes.
- [ ] Wire `SchemaRegistry` remote resolver to node-backed index queries first.
- [ ] Keep legacy route storage fallback during migration.
- [ ] Add conflict handling policy for concurrent schema publications.

### Phase 3 - Presence + Policy as Nodes

- [ ] Implement local presence aggregation pipeline from NodeStore changes.
- [ ] Emit/update `PresenceSummary` nodes with privacy buckets.
- [ ] Model sync policy as `SyncPolicy` nodes with versioned revisions.
- [ ] Implement policy simulation report before activation.

### Phase 4 - AuthZ Tightening

- [ ] Extend capability patterns for `sys/*` resources with prefix matching.
- [ ] Enforce scoped checks at local mutation, hub relay, and federation egress.
- [ ] Add explicit denial reasons (`missing_scope`, `policy_block`, `hub_not_allowed`).
- [ ] Add token replay cache checks and revocation propagation hooks.

### Phase 5 - Multi-Hub Orchestration

- [ ] Add first-class multi-hub sync orchestration in React/provider layer.
- [ ] Add per-hub destination planner for system and user namespaces.
- [ ] Add health-aware failover policy for non-critical replicas.
- [ ] Add reconciliation job to repair missed system-node replication.

### Phase 6 - REST Projection Boundary

- [ ] Convert `/schemas` write path into node mutation adapter.
- [ ] Serve `/schemas` reads from node-backed index.
- [ ] Add deprecation timeline for legacy internal schema store usage.
- [ ] Publish compatibility guarantees for external integrators.

---

## Validation Checklist

### Functional correctness

- [ ] Publishing a schema as node mutation makes it discoverable locally and remotely.
- [ ] Resolver returns correct version resolution from node-backed index.
- [ ] Presence summaries update incrementally under create/update/delete churn.
- [ ] Multi-hub policy routes system nodes to intended destinations only.

### Security and authorization

- [ ] Invalid schema signatures are rejected before indexing.
- [ ] Unauthorized `sys/*` mutations are denied at all enforcement points.
- [ ] Replay of previously seen system-node changes is rejected.
- [ ] Revoked grants remove effective write/query capability within one refresh window.

### Privacy and leakage control

- [ ] Presence summaries obey visibility class (`private`, `trusted-app`, `public-metadata`).
- [ ] Bucket/noise behavior prevents exact count leakage where configured.
- [ ] Federation exposure filters do not leak non-exposed system schemas.
- [ ] Audit log captures all exposure and denial decisions.

### Resilience

- [ ] Offline-first mutation path works for system nodes and replays cleanly on reconnect.
- [ ] Partitioned hubs converge on same schema-definition set after healing.
- [ ] Duplicate or out-of-order changes converge to deterministic state.
- [ ] Index rebuild from raw change log reproduces identical schema registry state.

### DX and UX

- [ ] SDK flow for access request + schema discovery is implementable quickly.
- [ ] Error surfaces distinguish auth denied vs schema unavailable vs policy blocked.
- [ ] Consent UX clearly shows data type, scope, destination, and duration.
- [ ] Developers can reason about one primitive: nodes for both data and control.

---

## Open Questions

1. Should schema authority be DID-only, domain-only, or mixed with signed linkage proofs?
2. Should `PresenceSummary` be exact locally but always bucketed remotely?
3. Do we need separate retention policies for control-plane nodes vs user-content nodes?
4. Should schema compatibility/lens metadata be bundled with schema nodes or separate nodes?
5. What is the minimum viable federation contract for third-party hubs that only support projections?

---

## Recommendations and Next Actions

1. **Start with node-backed schema registry index** (highest leverage, low migration risk).
2. **Add system schemas for presence + sync policy next** so control-plane data uses the same substrate.
3. **Ship dual-path adapter for `/schemas`** to preserve compatibility while validating node-native design.
4. **Prioritize multi-hub orchestration in React/provider** to unlock practical policy-driven placement.
5. **Publish a short "one primitive" architecture note** for internal alignment: nodes are canonical; REST is projection.

---

## References

### Internal

- `docs/explorations/0091_[_]_GLOBAL_SCHEMA_FEDERATION_MODEL.md`
- `docs/explorations/0089_[_]_REST_GRAPHQL_INTEROPERABILITY_BOUNDARY.md`
- `packages/data/src/schema/node.ts`
- `packages/data/src/schema/registry.ts`
- `packages/data/src/store/store.ts`
- `packages/hub/src/server.ts`
- `packages/hub/src/services/node-relay.ts`
- `packages/hub/src/auth/capabilities.ts`
- `packages/hub/src/services/federation.ts`
- `packages/hub/src/services/query.ts`
- `packages/hub/src/routes/schemas.ts`
- `packages/react/src/context.ts`
- `docs/VISION.md`

### External

- https://www.w3.org/TR/activitystreams-core/
- https://www.w3.org/TR/activitypub/
- https://www.w3.org/TR/did-core/
- https://ucan.xyz/specification/
- https://solidproject.org/TR/wac
- https://ipld.io/docs/
- https://spec.matrix.org/latest/
