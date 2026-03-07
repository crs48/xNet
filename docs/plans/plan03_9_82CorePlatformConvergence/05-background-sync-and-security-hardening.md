# 05: Background Sync and Security Hardening

> Make cross-device sync deterministic, observable, and signed by default.

**Duration:** 6-9 days  
**Dependencies:** [04-database-model-convergence.md](./04-database-model-convergence.md)  
**Primary packages:** `@xnetjs/react`, `@xnetjs/network`, `@xnetjs/data`, `apps/electron`

## Objective

Harden the background sync layer so that reconnects, offline recovery, presence cleanup, and signed replication behave predictably across devices and transport conditions.

## Scope and Dependencies

The platform already has strong primitives, but the default behavior still needs convergence:

- [`packages/data/src/store/store.ts`](../../../packages/data/src/store/store.ts) verifies and applies signed node changes.
- [`packages/network/src/protocols/sync.ts`](../../../packages/network/src/protocols/sync.ts) can verify signed Yjs envelopes, but still permits unsigned legacy behavior unless explicitly required.
- Background sync infrastructure already exists under [`packages/react/src/sync`](../../../packages/react/src/sync), yet it still needs release-grade lifecycle semantics and observability.

This step turns those primitives into a dependable device-sync contract.

## Landed in This Slice

- [`packages/sync/src/sync-runtime.ts`](../../../packages/sync/src/sync-runtime.ts) now defines the canonical lifecycle phases and shared `SyncLifecycleState` snapshots for reconnect/replay observability.
- [`packages/react/src/sync/sync-manager.ts`](../../../packages/react/src/sync/sync-manager.ts) now exposes lifecycle state alongside connection status, drives replay transitions from the offline queue, and clears remote awareness state on disconnect/error instead of leaving stale presence behind.
- [`apps/electron/src/renderer/lib/ipc-sync-manager.ts`](../../../apps/electron/src/renderer/lib/ipc-sync-manager.ts) now derives the same lifecycle phases in the renderer-facing API so Electron and web no longer diverge on basic sync-state semantics.
- deterministic coverage now exists for lifecycle derivation, reconnect/resubscribe behavior, offline queue replay, and sync-manager replay/presence cleanup in [`packages/sync/src/sync-runtime.test.ts`](../../../packages/sync/src/sync-runtime.test.ts), [`packages/react/src/sync/connection-manager.test.ts`](../../../packages/react/src/sync/connection-manager.test.ts), [`packages/react/src/sync/offline-queue.test.ts`](../../../packages/react/src/sync/offline-queue.test.ts), and [`packages/react/src/sync/sync-manager.test.ts`](../../../packages/react/src/sync/sync-manager.test.ts).
- [`packages/react/package.json`](../../../packages/react/package.json) now declares the explicit `@xnetjs/sync` dependency required by the shared lifecycle runtime.
- signed replication is now the default path across the web relay, Electron BSM bridge, and hub relay, with compatibility gated explicitly behind `compatibility.allowUnsignedReplication` in [`packages/sync/src/replication-policy.ts`](../../../packages/sync/src/replication-policy.ts), [`packages/react/src/sync/WebSocketSyncProvider.ts`](../../../packages/react/src/sync/WebSocketSyncProvider.ts), [`apps/electron/src/data-process/data-service.ts`](../../../apps/electron/src/data-process/data-service.ts), and [`packages/hub/src/services/relay.ts`](../../../packages/hub/src/services/relay.ts).
- persisted queue state plus runtime diagnostics now expose pending replay work and the last verification failure through [`packages/react/src/sync/offline-queue.ts`](../../../packages/react/src/sync/offline-queue.ts), [`packages/react/src/sync/sync-manager.ts`](../../../packages/react/src/sync/sync-manager.ts), and [`packages/devtools/src/panels/SyncMonitor/SyncMonitor.tsx`](../../../packages/devtools/src/panels/SyncMonitor/SyncMonitor.tsx).
- signature-enforcement coverage now extends through the web provider and hub relay in [`packages/react/src/sync/WebSocketSyncProvider.test.ts`](../../../packages/react/src/sync/WebSocketSyncProvider.test.ts) and [`packages/hub/test/relay.test.ts`](../../../packages/hub/test/relay.test.ts).

This step is now complete. The remaining release-discipline work moved into Step 08 and is recorded in [`docs/reference/core-platform-convergence-release-gates.md`](../../reference/core-platform-convergence-release-gates.md).

## Relevant Codebase Touchpoints

- [`packages/react/src/sync`](../../../packages/react/src/sync)
- [`packages/react/src/context.ts`](../../../packages/react/src/context.ts)
- [`packages/network/src/protocols/sync.ts`](../../../packages/network/src/protocols/sync.ts)
- [`packages/data/src/store/store.ts`](../../../packages/data/src/store/store.ts)
- [`packages/sync`](../../../packages/sync)
- [`apps/electron/src/renderer/lib/ipc-sync-manager.ts`](../../../apps/electron/src/renderer/lib/ipc-sync-manager.ts)

## Proposed Design

### Sync state machine

Define one canonical background-sync lifecycle:

- `idle`
- `starting`
- `local-ready`
- `connecting`
- `healthy`
- `degraded`
- `replaying`
- `stopped`

Expose that state through runtime diagnostics and devtools instead of scattering loosely-related booleans across hooks and internals.

### Signed-by-default policy

Make production paths reject unsigned document replication by default.

If compatibility mode is required, it must be:

- explicit,
- temporary,
- and recorded in diagnostics.

### Durable replay

Pending sync work should survive:

- app backgrounding,
- temporary connection loss,
- and process restarts where feasible.

That includes:

- outbound structured changes,
- pending Yjs update flushes,
- and awareness/session cleanup after disconnect.

## State Diagram

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> starting
  starting --> local-ready
  local-ready --> connecting
  connecting --> healthy
  healthy --> degraded
  degraded --> replaying
  replaying --> healthy
  healthy --> stopped
  degraded --> stopped
```

## Concrete Implementation Notes

### 1. Remove implicit legacy behavior

`requireSignedEnvelopes` should become the default for production-grade paths.

Compatibility mode should use a clearly named flag such as:

```typescript
compatibility: {
  allowUnsignedReplication: true
}
```

That is much clearer than silently inheriting permissive behavior from omitted config.

### 2. Centralize reconnect and backoff

One sync lifecycle controller should own:

- reconnect backoff,
- replay scheduling,
- presence expiration,
- and health status derivation.

That controller should be shared by web and Electron, even if the transport implementations differ.

### 3. Track pending work explicitly

Introduce durable counters or queues for:

- pending node mutations,
- pending document flushes,
- last successful sync checkpoint,
- last verification failure.

Those values are also the right substrate for sync-focused devtools.

### 4. Keep encryption/authz aligned with runtime hardening

This plan does not re-open the full authorization redesign from `plan03_9_81AuthorizationRevisedV2`, but it should leave the runtime ready for:

- stronger device-key handling,
- encrypted replication guarantees,
- and future recipient-aware sync routing.

## Testing and Validation Approach

- Add sync-manager lifecycle tests for reconnect, replay, and stop semantics.
- Add signed-envelope tests that prove production config rejects unsigned updates.
- Add multi-device offline and reconnect tests for structured data and Yjs docs.
- Add stale-presence cleanup tests.
- Add Electron-specific manual validation using two app instances when the runtime path is ready.

## Risks, Edge Cases, and Migration Concerns

- Tightening signature requirements can expose latent compatibility assumptions in tests or older clients.
- Sync lifecycle bugs are often timing-sensitive; this step needs deterministic harnesses, not only manual verification.
- Durable replay can become a source of duplicate work unless idempotency and checkpoint semantics stay clear.

## Step Checklist

- [x] Define a canonical sync lifecycle state machine.
- [x] Make signed document replication the default production behavior.
- [x] Gate unsigned compatibility behind an explicit temporary flag.
- [x] Centralize reconnect, replay, and presence cleanup behavior.
- [x] Persist enough sync state to make recovery deterministic and observable.
- [x] Add automated tests for reconnect, replay, and signature enforcement.
- [x] Validate multi-device behavior in Electron and web proving paths.
