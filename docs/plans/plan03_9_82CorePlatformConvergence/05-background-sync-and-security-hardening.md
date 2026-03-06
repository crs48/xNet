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

- [ ] Define a canonical sync lifecycle state machine.
- [ ] Make signed document replication the default production behavior.
- [ ] Gate unsigned compatibility behind an explicit temporary flag.
- [ ] Centralize reconnect, replay, and presence cleanup behavior.
- [ ] Persist enough sync state to make recovery deterministic and observable.
- [ ] Add automated tests for reconnect, replay, and signature enforcement.
- [ ] Validate multi-device behavior in Electron and web proving paths.
