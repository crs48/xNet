# 06: UCAN Delegation and Revocation

> Implement store-level grant/revoke/list APIs using existing UCAN primitives and revocation records.

**Duration:** 5 days  
**Dependencies:** [05-nodestore-enforcement.md](./05-nodestore-enforcement.md)  
**Packages:** `packages/data`, `packages/identity`

## Current Baseline

- UCAN creation and verification exist in `packages/identity/src/ucan.ts`.
- Share revocation primitives and hash-based revocation store exist in `packages/identity/src/sharing/revocation.ts`.

## Implementation

### 1. Add Store Auth API

Expose:

- `store.auth.can(input)`
- `store.auth.grant(input)`
- `store.auth.revoke(input)`
- `store.auth.listGrants(input)`

### 2. Define Grant Record Model

Persist grant metadata as signed node changes so grants are auditable and syncable.

Fields:

- `grantId`
- `issuerDid`
- `audienceDid`
- `resource`
- `actions`
- `constraints`
- `exp`
- `proofs`

### 3. Integrate Attenuation Rules

During `grant`:

- verify grantor currently has requested authority.
- enforce no privilege escalation beyond grantor capabilities.
- enforce expiration upper bound relative to parent proof chain.

### 4. Integrate Revocation Checks

During `can`:

- check revocation set before accepting cached proof validation.
- invalidate affected cache lines by token hash and derivation chain.

### 5. Replay and Uniqueness

Track token identifiers (`jti`/hash) to prevent replay in invocation-style flows.

## Delegation Lifecycle

```mermaid
stateDiagram-v2
  [*] --> Issued
  Issued --> Active: verified + not expired
  Active --> Revoked: revocation record seen
  Active --> Expired: exp reached
  Revoked --> [*]
  Expired --> [*]
```

## Tests

- Grant issuance and verification tests.
- Attenuation failure tests (action/resource overreach).
- Revocation propagation tests across sync replicas.
- Replay detection tests with duplicate tokens.

## Checklist

- [ ] `store.auth` API shipped.
- [ ] Grant records persisted and syncable.
- [ ] Attenuation enforcement complete.
- [ ] Revocation-aware evaluator path complete.
- [ ] Replay protection tests passing.

---

[Back to README](./README.md) | [Previous: NodeStore Enforcement](./05-nodestore-enforcement.md) | [Next: Hub Capability Bridge ->](./07-hub-capability-bridge.md)
