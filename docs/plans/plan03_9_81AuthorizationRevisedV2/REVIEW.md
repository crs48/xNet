# Plan Review: plan03_9_81AuthorizationRevisedV2

> Architectural audit of the V2 authorization plan against the actual xNet codebase and the V1 review it was meant to address. Conducted 2026-02-11.

**Verdict:** V2 is a substantial improvement. The plan successfully addresses all 25 issues from the V1 review — key recovery, offline policy, delegation limits, public nodes, grant conflicts, and DevTools observability are all covered. The architecture is coherent and the developer API is clean. The review originally identified 6 new issues (1 critical, 3 medium, 2 low) and 2 carried-forward API mismatches. **All issues have been resolved** in the plan documents (see resolution notes below).

---

## Coverage of V1 Review Issues

All 25 original issues are addressed. Spot-checked against the actual codebase:

| V1 Issue                      | V2 Coverage                                                      | Verified |
| ----------------------------- | ---------------------------------------------------------------- | -------- |
| A1 (X25519 key resolution)    | Step 01 — birational conversion + hub registry                   | Yes      |
| A2 (Yjs trust window)         | Step 09 — revocation event wiring via store.subscribe()          | Yes      |
| A3 (Write auth client-side)   | README Trust Model section                                       | Yes      |
| A4 (Offline auth policy)      | Step 05 — OfflineAuthPolicy type with TTL/staleness/revalidation | Yes      |
| B1 (Key recovery)             | Step 10 — seed phrase derivation + hub backup                    | Yes      |
| B2 (Multi-device)             | Step 10 — deterministic derivation from seed                     | Yes      |
| B4 (Public nodes)             | Step 02 — PUBLIC_CONTENT_KEY + PUBLIC_RECIPIENT sentinel         | Yes      |
| B5 (Schema version migration) | Step 02 — handleAuthMigration()                                  | Yes      |
| B6 (Data migration)           | Step 08 — AuthMigrator utility                                   | Yes      |
| B7 (Grant conflicts)          | Step 05 — revokedAt > 0 dominates                                | Yes      |
| B8 (Delegation limits)        | Step 05 — maxProofDepth=4, cascade revocation                    | Yes      |
| B9 (Last admin protection)    | Step 05 — validateRevocation() guard                             | Yes      |
| B10 (Audit logging)           | Step 08 — AuthDecisionEvent via telemetry                        | Yes      |
| C1 (API mismatches)           | Partially fixed — see new issues below                           | Partial  |
| C2 (Existing code)            | README — Relationship to Existing Code table                     | Yes      |
| C3 (Sync integration)         | Step 05 — inherited-properties table                             | Yes      |
| D1 (Key resolution latency)   | Step 08 — separate computeRecipients() benchmark                 | Yes      |
| D2 (Recipient recompute)      | Step 04 — shouldRecomputeRecipients()                            | Yes      |
| D3 (Cache thundering herd)    | Step 08 — noted as low-risk                                      | Yes      |
| E1 (Silent vs loud rejection) | README Failure Modes table                                       | Yes      |
| E2 (Legacy schema warning)    | Step 02 — warnLegacySchema()                                     | Yes      |
| E3 (Error message clarity)    | Step 04 — PermissionError with role context                      | Yes      |
| E4 (Operational debugging)    | Step 07 — 5 DevTools sub-tabs                                    | Yes      |
| E5 (Grant expiration)         | Step 05 — GrantExpirationCleaner                                 | Yes      |
| E6 (Ownership transfer)       | Step 10 — documented as v1 limitation                            | Yes      |

---

## A. New Issues Introduced in V2

### A1. `store.query()` Does Not Exist on NodeStore (Critical) — RESOLVED

**Severity: P0 — Blocks grant system implementation**
**Resolution:** Introduced `GrantIndex` class in Step 03 with O(1) lookup by (resource, grantee), maintained via `store.subscribe()`. Replaced all 6 `store.query()` calls across Steps 02, 03, 05. Infrequent operations (cascade revocation, expiration cleanup) use `store.list()` + client-side filter.

The plan calls `this.store.query()` **6 times** across Steps 02, 03, and 05 to find active grants:

```typescript
// Step 03, line 284:
const grants = await this.store.query({
  schema: 'xnet://xnet.fyi/Grant',
  filter: { resource: input.nodeId, grantee: input.subject, revokedAt: 0 }
})
```

**Problem:** `NodeStore` does not have a `query()` method. Its API is: `create`, `update`, `delete`, `get`, `list`, `transaction`, `applyRemoteChange`, `subscribe`, `getDocumentContent`, `setDocumentContent`. Queries with filters live in the separate `@xnet/query` package.

**NodeStore.list()** exists but only supports listing by schema, not filtering by arbitrary properties. The `@xnet/query` engine supports rich filters (`eq`, `gt`, `contains`, etc.) but operates at a higher level and isn't designed to be called from within the data layer.

**Impact:** The entire `PolicyEvaluator.can()` pipeline depends on querying grants. Without a query mechanism, the evaluator can't find grants for a resource.

**Options:**

1. **Add a `queryBySchema()` method to NodeStore** — A lightweight filtered list: `store.queryBySchema(schemaIri, filter)`. Keeps it in the data layer without full query engine complexity.
2. **Inject a GrantIndex** — A specialized in-memory index for grants, maintained via `store.subscribe()`. Faster than querying but requires memory.
3. **Use NodeStore.list() + client-side filter** — `store.list({ schema: GrantSchema.iri })` then filter in JS. Simple but O(n) on all grants.

**Recommendation:** Option 2 (GrantIndex) for the PolicyEvaluator hot path, with option 1 as the general API. A `GrantIndex` maintained via subscribe events gives O(1) grant lookup by `(resource, grantee)`.

**Files affected:** Steps 02 (line 199), 03 (lines 284, 360), 05 (lines 370, 463, 515)

---

### A2. Dual X25519 Key Derivation Contradiction (Medium) — RESOLVED

**Severity: P1 — Cryptographic inconsistency**
**Resolution:** Step 10 now derives X25519 via `edwardsToMontgomeryPriv(signingKeyBytes)` instead of independent HKDF. Added key invariant test ensuring seed-derived X25519 matches Step 01's birational conversion.

The plan derives X25519 keys **two different ways**:

1. **Step 01** (key resolution): Ed25519 → X25519 via `edwardsToMontgomeryPub()` birational conversion
2. **Step 10** (multi-device): Independent HKDF derivation from seed — `hkdf(sha256, seed, 'xnet-salt', 'xnet-x25519-encryption', 32)`

These produce **different X25519 keys** for the same user. When Alice wraps a content key for Bob's DID:

- If she uses birational conversion (Step 01 path), she wraps for key A
- But Bob's device might hold HKDF-derived key B (Step 10 path)
- Bob can't unwrap with key B what was wrapped for key A

**The plan seems to intend** that the HKDF-derived Ed25519 key would then be birationally converted to X25519. But Step 10 explicitly derives X25519 independently:

```typescript
// Step 10, line 81:
const encryptionKeyBytes = hkdf(sha256, seed, 'xnet-salt', 'xnet-x25519-encryption', 32)
```

This is NOT the birational conversion of the Ed25519 key derived on line 77.

**Fix:** Remove the independent X25519 derivation in Step 10. Instead, derive Ed25519 from the seed, then use `edwardsToMontgomeryPub/Priv()` to get X25519. This ensures the DID's Ed25519 key and the encryption X25519 key are mathematically linked, which is the invariant Step 01's `PublicKeyResolver` depends on.

```typescript
// CORRECT approach:
const signingKeyBytes = hkdf(sha256, seed, 'xnet-salt', 'xnet-ed25519-signing', 32)
const encryptionKeyBytes = edwardsToMontgomeryPriv(signingKeyBytes) // NOT independent HKDF
```

**Files affected:** Step 10 (lines 77-82)

---

### A3. `relation()` Property API Mismatch (Medium) — RESOLVED

**Severity: P1 — Code won't compile as written**
**Resolution:** Changed `relation({ schema: ... })` to `relation({ target: ... as const })` in README.

The plan's schema examples use `relation({ schema: '...' })`:

```typescript
// README line 215:
project: relation({ schema: 'xnet://myapp/Project' }),
```

The actual API uses `target`, not `schema`:

```typescript
// Actual API (packages/data/src/schema/properties/relation.ts):
parent: relation({ target: 'xnet://xnet.fyi/Task' as const })
```

**Fix:** Replace `schema:` with `target:` in all relation() calls across the plan.

**Files affected:** README (line 215)

---

### A4. `schemaRegistry.get()` Is Async — Plan Treats It As Sync (Medium) — RESOLVED

**Severity: P1 — Subtle runtime bug**
**Resolution:** Added `await` to all `schemaRegistry.get()` calls in Step 03 (DefaultRoleResolver and DefaultPolicyEvaluator).

The plan's `DefaultRoleResolver` (Step 03) calls `this.schemaRegistry.get()` and uses the result directly:

```typescript
// Step 03, line 107:
const targetSchema = this.schemaRegistry.get(targetNode.schemaId)
if (!targetSchema?.authorization) return []
```

But `schemaRegistry.get()` returns `Promise<DefinedSchema | undefined>`. Without `await`, `targetSchema` would be a Promise (truthy), and `targetSchema?.authorization` would be `undefined`, silently skipping the relation traversal.

The plan correctly uses `await` in the `DefaultPolicyEvaluator` (Step 03, line 244), but forgets it in the `DefaultRoleResolver` (Step 03, lines 107 and 152).

**Fix:** Add `await` to all `schemaRegistry.get()` calls in Step 03.

**Files affected:** Step 03 (lines 107, 152)

---

### A5. Missing `unauthorized_update` Violation Type (Low) — RESOLVED

**Severity: P2 — Type extension needed**
**Resolution:** Added prerequisite note in Step 09 header documenting that `YjsViolationType` must be extended and penalty value (20) added to config.

Step 09 uses `'unauthorized_update'` as a peer scoring violation:

```typescript
// Step 09, line 305:
this.peerScorer.recordViolation(peerId, 'unauthorized_update')
```

The existing `YjsViolationType` union is:

```typescript
type YjsViolationType =
  | 'invalidSignature'
  | 'oversizedUpdate'
  | 'rateExceeded'
  | 'unsignedUpdate'
  | 'unattestedClientId'
```

`unauthorized_update` is not included. This is a simple type extension, not a design problem, but it should be noted as a prerequisite change.

**Fix:** Add `'unauthorized_update'` to `YjsViolationType` and add a penalty value to `DEFAULT_YJS_SCORING_CONFIG.penalties`.

**Files affected:** Step 09, `packages/sync/src/yjs-peer-scoring.ts`

---

### A6. PUBLIC_CONTENT_KEY (All Zeros) Has Subtle Crypto Implications (Low) — RESOLVED

**Severity: P3 — Design choice worth documenting**
**Resolution:** Added failure mode documentation to Step 02 covering the public→private transition crash scenario.

Step 02 defines `PUBLIC_CONTENT_KEY = new Uint8Array(32)` (all zeros) for public nodes. This means:

1. The encrypt/decrypt code path runs for every node, even public ones — a small but unnecessary performance cost
2. All-zeros as a key is a degenerate case for XChaCha20-Poly1305 (it works, but some crypto auditors flag it)
3. If a node transitions from public to private and the key rotation fails midway, the node is left "encrypted" with the all-zeros key — effectively still public

The plan already documents option (1) as intentional (preserves uniform code path). Consider adding a brief note about (3) as a failure mode in the public→private transition.

**Files affected:** Step 02 (line 111)

---

## B. Remaining API Mismatches (Carried Forward) — ALL RESOLVED

The V1 review flagged 6 API mismatches. V2 corrected 4 of 6, and the remaining issues were fixed in this revision:

| V1 Mismatch                                                       | V2 Status                             |
| ----------------------------------------------------------------- | ------------------------------------- |
| `adapter.saveChange()` → `appendChange()`                         | Fixed in Step 04                      |
| `adapter.saveYjsState()` → `setDocumentContent()`                 | Fixed in Step 09                      |
| `store.subscribe(nodeId, callback)` → `store.subscribe(callback)` | Fixed in Step 07                      |
| `useStore()` → `useNodeStore()`                                   | Fixed (uses `useNodeStoreInternal()`) |
| `store.get(schemaId)` → `schemaRegistry.get(iri)`                 | Fixed but missing `await` (see A4)    |
| `"7 devtools panels"` → 9+ panels                                 | Fixed (Step 07 says 15th panel)       |

**New mismatches introduced in V2 — ALL FIXED:**

| Mismatch                       | Actual API                             | Location         | Fix                           |
| ------------------------------ | -------------------------------------- | ---------------- | ----------------------------- |
| `store.query()`                | Does not exist (see A1)                | Steps 02, 03, 05 | Replaced with GrantIndex      |
| `relation({ schema: ... })`    | `relation({ target: ... })`            | README           | Fixed                         |
| `store.serializeNodeContent()` | Does not exist                         | Step 08          | Replaced with EncryptionLayer |
| `store.storeEnvelope()`        | Does not exist                         | Step 08          | Replaced with EncryptionLayer |
| `store.extractMetadata()`      | Does not exist                         | Step 08          | Replaced with EncryptionLayer |
| `store.signingKey`             | Private field, not publicly accessible | Step 08          | Replaced with EncryptionLayer |

---

## C. Concurrency & Race Condition Analysis

### C1. Recipients List Merge Conflict (Medium) — RESOLVED

**Severity: P1 — Data integrity concern**
**Resolution:** Documented in Step 05 with a `RecipientReconciler` periodic task that re-runs `computeRecipients()` for nodes with recent grant changes.

The plan stores recipients as a `DID[]` in the `EncryptedEnvelope`. When two devices independently grant access:

- Device A grants Bob → recipients: `[alice, bob]`
- Device B grants Carol → recipients: `[alice, carol]`

Since `recipients` is a single field, LWW applies. The device with the higher Lamport timestamp wins. **One grant's recipient is silently dropped.**

The plan's `computeRecipients()` would fix this on next evaluation (it recomputes from roles + grants), but there's a window where the envelope's recipients list doesn't match the actual grant state.

**Impact:** During the inconsistency window, the hub could filter out nodes the user should see (because their DID isn't in the winning recipients list yet).

**Mitigation options:**

1. Store recipients as individual properties (one per DID) so LWW applies per-recipient, not per-list
2. Treat recipients as a CRDT set (add-wins) rather than a scalar field
3. Accept the inconsistency window and rely on periodic `computeRecipients()` reconciliation

**Recommendation:** Option 3 is simplest and aligns with the plan's eventual consistency philosophy. Add a periodic reconciliation task (similar to `GrantExpirationCleaner`) that re-runs `computeRecipients()` for nodes with recent grant changes. Document the inconsistency window.

---

### C2. Revocation During Active Yjs Session (Handled)

The V1 review flagged a trust window for Yjs revocation. V2 addresses this well:

1. `store.subscribe()` → `authGate.invalidatePeer()` wiring (Step 09, line 171)
2. Immediate peer kick + key rotation on revocation (Step 09, line 201)
3. Re-encryption of Y.Doc state with new key (Step 09, line 210)

The window is now reduced to a single update cycle (the time between the revocation event arriving and the invalidation taking effect), which is acceptable.

---

## D. Architecture Strengths

1. **Encryption-first model is sound.** Read authorization is cryptographically enforced. The trust model section honestly documents the write-side limitation.

2. **Grants-as-nodes is elegant.** Reusing NodeStore's CRDT infrastructure for grants eliminates an entire class of sync/conflict problems. The explicit inherited-properties table in Step 05 makes this transparent.

3. **Key recovery (Step 10) fills the biggest V1 gap.** Seed-phrase derivation with deterministic keys is the right approach. The recovery flow diagram is clear.

4. **Offline policy is well-specified.** The `OfflineAuthPolicy` type with cache TTL, max staleness, and revalidation strategy is exactly what was missing in V1.

5. **Developer API is clean.** The `store.auth.can/grant/revoke/explain` surface, `useCan`/`useGrants` hooks, and permission presets make adoption straightforward.

6. **DevTools observability is comprehensive.** Five sub-tabs covering playground, grants, timeline, delegation tree, and revocation propagation go beyond what was requested.

---

## E. Risk Assessment

| Risk                                         | Severity | Likelihood | Notes                                             |
| -------------------------------------------- | -------- | ---------- | ------------------------------------------------- |
| `store.query()` doesn't exist                | P0       | Certain    | Must be resolved before implementation            |
| X25519 dual derivation                       | P1       | Certain    | Will cause decrypt failures on multi-device       |
| Recipients list merge conflict               | P1       | Likely     | Happens whenever two devices grant simultaneously |
| `schemaRegistry.get()` missing await         | P1       | Certain    | Relation traversal will silently fail             |
| Large Y.Doc re-encryption cost               | P2       | Possible   | Only on revocation of active collaborator         |
| AuthMigrator references non-existent methods | P2       | Certain    | Won't compile as written                          |

---

## F. Improvement Suggestions (Priority-Ordered)

| Priority | Issue                                        | Action                                                                                              | Steps Affected |
| -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------- |
| P0       | `store.query()` doesn't exist                | Add GrantIndex or queryBySchema() to NodeStore                                                      | 02, 03, 05     |
| P1       | Dual X25519 derivation                       | Remove independent HKDF X25519 derivation in Step 10; derive from Ed25519 via birational conversion | 10             |
| P1       | `relation({ schema })` → `target`            | Fix API name in examples                                                                            | README         |
| P1       | Missing `await` on schemaRegistry.get()      | Add `await` in DefaultRoleResolver                                                                  | 03             |
| P1       | Recipients list merge conflict               | Document inconsistency window; add periodic reconciliation                                          | 05, 08         |
| P2       | AuthMigrator non-existent methods            | Replace `serializeNodeContent`, `storeEnvelope`, `extractMetadata` with actual APIs                 | 08             |
| P2       | Missing `unauthorized_update` violation type | Extend YjsViolationType                                                                             | 09             |
| P3       | PUBLIC_CONTENT_KEY failure mode              | Document public→private transition failure case                                                     | 02             |

---

## G. Comparison to V1

| Dimension                  | V1 Plan                                               | V2 Plan                              |
| -------------------------- | ----------------------------------------------------- | ------------------------------------ |
| Critical gaps              | 3 (key resolution, recovery, offline policy)          | 1 (store.query)                      |
| API mismatches             | 6                                                     | 7 (4 old fixed, 5 new introduced)    |
| Completeness               | Missing key recovery, multi-device, delegation limits | All addressed + new Step 10          |
| Developer API clarity      | Good                                                  | Excellent (presets, hooks, devtools) |
| Trust model documentation  | Implicit                                              | Explicit (README section)            |
| Failure mode documentation | Missing                                               | Comprehensive (README table)         |
| Total steps                | 9                                                     | 10                                   |
| Estimated time             | ~41 days                                              | ~46 days                             |

---

## H. Overall Assessment

**The plan is ready for implementation.** All review issues (A1-A6, B, C1) have been resolved in the plan documents.

Key fixes applied:

- **A1 (P0):** Introduced `GrantIndex` with O(1) lookup, replacing all 6 `store.query()` calls
- **A2 (P1):** X25519 now derived via birational conversion from Ed25519 (not independent HKDF)
- **A3 (P1):** `relation({ schema })` corrected to `relation({ target })`
- **A4 (P1):** Added `await` to all async `schemaRegistry.get()` calls
- **C1 (P1):** Documented recipients merge conflict + `RecipientReconciler` periodic task
- **B (P2):** AuthMigrator rewritten with `EncryptionLayer` interface instead of non-existent NodeStore methods
- **A5 (P2):** Documented `YjsViolationType` extension as prerequisite
- **A6 (P3):** Documented PUBLIC_CONTENT_KEY failure mode in public→private transition

The architecture is sound, the developer API is well-designed, and the security tradeoffs are honestly documented. The addition of Step 10 (key recovery) addresses what was genuinely the biggest real-world risk.

**Recommended next step:** Begin Phase 1 implementation (Steps 01-02).

---

[Back to README](./README.md)
