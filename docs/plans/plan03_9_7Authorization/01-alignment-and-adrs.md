# 01: Alignment and ADRs

> Lock architectural decisions, namespaces, and non-negotiable invariants before coding.

**Duration:** 2 days  
**Dependencies:** None  
**Packages:** `packages/data`, `packages/identity`, `packages/hub`, `packages/core`

## Why This Step Exists

Explorations 0077-0085 converge on the same direction, but implementation will drift if action naming, deny semantics, and delegation boundaries are not frozen first.

## Implementation

### 1. Create Authorization ADR Set

Create ADR documents under `docs/adr/` for:

- Unified evaluator model (schema + relation + UCAN).
- Deny-first precedence and deterministic evaluation order.
- Group-as-node convention (no `group()` primitive).
- Action namespace (`read`, `write`, `delete`, `share`, etc.) and hub mapping.
- Revocation consistency modes (`eventual`, `strict`).

### 2. Define Canonical Action Taxonomy

Create shared constants package section (initially in `packages/core`) that both store and hub import:

```ts
export const AUTH_ACTIONS = ['read', 'write', 'delete', 'share', 'restore', 'admin'] as const
export type AuthAction = (typeof AUTH_ACTIONS)[number]
```

Add a compatibility mapping for existing hub actions (`hub/connect`, `hub/relay`, etc.) so we can migrate incrementally.

Action taxonomy must include every mutating/runtime path before implementation starts:

| Surface    | API/Path                              | Canonical Action                |
| ---------- | ------------------------------------- | ------------------------------- |
| Store      | `create`                              | `write`                         |
| Store      | `update`                              | `write`                         |
| Store      | `delete`                              | `delete`                        |
| Store      | `restore`                             | `restore` (defaults to `write`) |
| Store      | `transaction`                         | per-op derived                  |
| Sync       | `applyRemoteChange`                   | per-change derived              |
| Delegation | `grant`, `revoke`, `listGrants`       | `share`, `share`, `read`        |
| Hub        | `hub/query`, `hub/relay`, `hub/admin` | `read`, `write`, `admin`        |

Require an owner for each mapping entry and a contract test that fails on drift.

### 3. Freeze Evaluation Contract

The contract must be explicit and testable:

1. Node-level explicit deny.
2. Schema role/membership allow.
3. UCAN delegation allow.
4. Public/default allow.
5. Deny.

### 4. Define Explainability Contract

Every denied check returns structured reason codes:

- `DENY_NODE_POLICY`
- `DENY_NO_ROLE_MATCH`
- `DENY_UCAN_INVALID`
- `DENY_UCAN_REVOKED`
- `DENY_DEPTH_EXCEEDED`

## Deliverables

- ADR documents merged and linked from `docs/explorations/0085_[_]_UNIFIED_AUTHORIZATION_API_V3.md`.
- Shared action constants and types scaffolded.
- Draft `AuthDecision` and `AuthDecisionReason` types in `packages/core` or `packages/data` contract module.

## Checklist

- [ ] ADRs written and approved.
- [ ] Action namespace frozen and conflict-free.
- [ ] Evaluation order codified in tests/spec.
- [ ] Explainability reason codes defined.
- [ ] Hub/store namespace bridge documented.

---

[Back to README](./README.md) | [Next: Schema Authorization Model ->](./02-schema-authorization-model.md)
