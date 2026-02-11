# Plan Review: plan03_9_8AuthorizationRevised

> Architectural audit of the authorization plan against the actual xNet codebase. Conducted 2026-02-10.

**Verdict:** The plan is strong — the encryption-first model, grants-as-nodes architecture, room-gated Yjs design, and typed builder DX are well-considered. The grants-as-nodes approach elegantly solves sync and conflict resolution by reusing NodeStore's proven CRDT infrastructure. Three critical gaps (key discovery, key recovery, offline authorization policy) must be addressed before implementation. Six API mismatches need correction. Several medium-priority concerns around delegation chains, multi-device, public nodes, and explicit documentation of inherited sync properties need sections added.

---

## Key Architecture Decision: Grants-as-Nodes

**This review references the plan's proposed architecture, not the existing codebase.**

The plan proposes a fundamentally different model from the current UCAN-based implementation:

| Current Implementation (`@xnet/identity/sharing`)       | Plan (Step 05)                                       |
| ------------------------------------------------------- | ---------------------------------------------------- |
| Grants are UCAN tokens (immutable, signed JWTs)         | Grants are **nodes** (GrantSchema)                   |
| Revocations stored in `RevocationStore` (in-memory Map) | Revocations are **node updates** (`revokedAt` field) |
| UCAN is primary mechanism                               | UCAN is **optional** (for delegation chains)         |
| Separate sync mechanism needed                          | **Inherits NodeStore sync** (CRDT, Lamport clocks)   |

**What grants-as-nodes automatically provides:**

- ✅ Sync across devices (CRDT infrastructure)
- ✅ Conflict resolution (Lamport LWW per field)
- ✅ Offline support (queued mutations)
- ✅ Tamper-evident audit trail (hash chain)
- ✅ Signature verification (Ed25519)

**What still needs design:**

- ❌ Offline authorization policy (cache TTL, re-validation)
- ❌ Key discovery and recovery
- ❌ Delegation chain limits
- ❌ Grant-specific observability

This review focuses on gaps in the **plan**, not gaps compared to existing code.

---

## A. Architectural Issues

### 🔴 A1. X25519 Key Resolution Is Under-Designed (Blocker)

The plan's `PublicKeyResolver.resolve(did)` assumes you can obtain an X25519 public key from a DID. But `did:key:z6Mk...` encodes an **Ed25519** public key, not X25519. In the actual codebase, X25519 keys are **stored separately** in `HybridKeyBundle`, not derivable from the DID alone.

This means `wrapKeyForRecipient()` literally cannot work without a key discovery mechanism.

**Options:**

1. **Ed25519→X25519 birational conversion** — `@noble/curves` supports this via `edwardsToMontgomeryPub()`. Fast, deterministic, no network calls. But it's a cryptographic subtlety that should be documented and tested.
2. **Hub key registry** — Peers publish their X25519 public keys to the hub alongside their DID. Requires network, introduces availability dependency.
3. **DID Document service** — Full W3C DID resolution. Most standards-compliant but heaviest to implement.

**Recommendation:** Option 1 (birational conversion) for the common case, with option 2 as fallback for post-quantum ML-KEM keys that can't be derived.

**Steps affected:** 01, 04, 05, 09

---

### 🟡 A2. Yjs Room-Gated Trust Window (Medium)

Step 09's room-gated model is sound, but has a subtle gap: the 30-second cache TTL on `YjsAuthGate` means up to 30 seconds of updates could flow to a just-revoked peer before the cache expires.

Step 09 defines `invalidatePeer()` and `invalidateAll()` on `YjsAuthGate`, but doesn't explicitly wire the revocation event to call these. The `revokeYjsAccess()` function does call `room.authGate.invalidatePeer(revokedDID)`, but this only works if the revoker is in the same room. If revocation happens on a different device or via the hub, the room needs an event-driven invalidation path.

**Fix:** Wire `store.subscribe()` to listen for Grant node changes (revokedAt > 0) and trigger `authGate.invalidatePeer()` for the revoked DID across all active rooms.

---

### 🟢 A3. Write Authorization Is Client-Side Only (Known Tradeoff)

The "encryption IS authorization" model works well for **read** access (can't decrypt → can't read). But **write** authorization is enforced only by the client's `PolicyEvaluator`. A malicious client could:

1. Skip the `can()` check
2. Sign a valid `Change<T>` with their own Ed25519 key
3. Broadcast it — the hub and peers accept it because the signature is valid

The hub's "dumb filter" design intentionally avoids complex policy evaluation. Peers do run `applyRemoteChange` auth gates, but a malicious peer could bypass those too.

**This is acceptable** for the stated design philosophy (trust minimization, eventual consistency). But it should be **explicitly documented** as a known tradeoff, not left implicit. Consider adding a brief "Trust Model" section to the README.

---

### 🔴 A4. Offline Authorization Policy Under-Specified (Critical)

The plan's Step 05 mentions **revocation consistency modes** (`eventual` vs `strict`) but doesn't fully specify offline behavior:

**What the plan includes:**

- ✅ Grants are nodes → auto-sync via CRDT
- ✅ Revocation is node update (`revokedAt` field) → uses NodeStore's LWW
- ✅ `RevocationConsistency` type with `eventual` (default) and `strict` modes

**What's missing:**

**1. Cache TTL not specified** — `eventual` mode uses "last-known revocation state" but for how long?

- Is cached `can()` decision valid for 1 minute? 5 minutes? 1 hour?
- After what staleness threshold should we warn the user?
- When should we block operations until we can re-validate?

**2. Offline grant operations** — Step 05 shows `store.auth.grant()` and `revoke()` but doesn't address:

- Can user create grants while offline? (Probably yes, they're just node creates)
- Can user revoke while offline? (Probably yes, it's a node update)
- What if offline grant conflicts with online revocation? (Relies on NodeStore LWW, but should be explicit)

**3. Re-validation strategy** — When coming back online:

- Are all cached decisions re-validated? (Performance impact)
- Only re-validate on next `can()` call? (Lazy, but longer trust window)
- Emit events for decisions that would change? (Good UX, but needs explicit design)

**Recommendation:** Add to Step 05:

```typescript
export interface OfflineAuthPolicy {
  /** Cache TTL for can() decisions in eventual mode */
  decisionCacheTTL: number // default: 300_000 (5 min)

  /** Max staleness before blocking operations */
  maxStaleness: number // default: 3600_000 (1 hour)

  /** Re-validation strategy on reconnect */
  revalidation: 'eager' | 'lazy' | 'hybrid'
  // eager: re-validate all cached decisions immediately
  // lazy: re-validate on next can() call per resource
  // hybrid: background re-validate, emit events for changes

  /** Allow grant operations while offline? */
  allowOfflineGrants: boolean // default: true
}
```

**Steps affected:** 05 (grants), 08 (testing offline scenarios)

---

## B. Missing Concerns

### 🔴 B1. No Key Backup / Recovery Story (Critical)

If a user loses their device (and therefore their private keys), they lose access to **everything** — all encrypted nodes, all Y.Doc content, all grants. The plan has zero discussion of:

- **Seed phrase derivation** — Derive all keys deterministically from a BIP-39 mnemonic
- **Social recovery** — Shamir's Secret Sharing to split a recovery key among trusted contacts
- **Hub-escrowed key fragments** — Store an encrypted backup of the key material on the hub
- **Multi-device key sync** — Automatically replicate keys across a user's devices
- **Identity reset** — What happens when a user creates a new DID? Can they regain access to old data?

**This is the single most likely source of real-world data loss.** The encryption-first model means there's no admin backdoor — if keys are gone, data is gone.

**Recommendation:** Add a new step file (e.g., `10-key-recovery-and-backup.md`) or a dedicated section in Step 01 covering at minimum:

1. Deterministic key derivation from a seed phrase
2. Encrypted key backup to hub
3. Multi-device key distribution protocol

---

### 🟡 B2. Multi-Device Is Unaddressed (Medium)

A user with 2 devices has 2 different `HybridKeyBundle` instances (different X25519 keys). When someone grants access to `did:key:z6Mk...`, which device's X25519 key gets the wrapped content key?

The plan's `recipients: DID[]` model maps one DID to one wrapped key. But if the user has multiple encryption keys (one per device), the content key needs to be wrapped for **each device separately**.

**Options:**

1. **Single DID, multiple device keys** — Wrap content key N times (once per device). Requires a device registry per DID.
2. **Device-specific DIDs** — Each device has its own DID. Grants target devices, not users. Awkward UX.
3. **Deterministic key derivation** — All devices derive the same X25519 key from the seed phrase. Simplest but requires seed sync.

**Recommendation:** Option 3 (deterministic derivation from seed) if key backup (B1) is implemented. Otherwise option 1 with a hub device registry.

---

### 🟡 B4. Public Nodes Are Under-Specified (Medium)

Step 02 mentions `PUBLIC` access mode and says "special handling: don't encrypt, or use a well-known key." But this isn't fleshed out. Questions unanswered:

- Do public nodes skip encryption entirely? (Then they can't transition to private later without re-encrypting.)
- Do they use a well-known null content key? (Then "encryption IS authorization" breaks — anyone can decrypt.)
- How does the hub know a node is public? (No `recipients` check? A special `PUBLIC` recipient?)
- Can a node transition from public to private? What happens to existing content?

**Recommendation:** Add a concrete subsection to Step 01 or Step 04 specifying:

1. Public nodes use a well-known content key (e.g., all zeros)
2. Hub recognizes `recipients: ["PUBLIC"]` as a special marker
3. Public→private transition triggers re-encryption with a real content key + recipients computation

---

### 🟡 B5. Schema Migration When Auth Rules Change (Medium)

What happens when a schema's `authorization` block is updated in a new version?

Example: `TaskSchema@1.0.0` allows editors to delete, but `TaskSchema@2.0.0` revokes that. Existing nodes using v1.0.0 have editors who believe they can delete. When the node migrates to v2.0.0:

- Do existing grants get re-evaluated?
- Does the recipients list change?
- Does the content key need rotation?

The plan's `getAuthMode()` handles `legacy` → `enforce`, but doesn't cover **versioned authorization changes** within the same schema lineage.

**Recommendation:** Add to Step 02: When a schema's authorization block changes across versions, the lens migration system should trigger `computeRecipients()` re-evaluation and content key rotation if the recipients set changes.

---

### 🟡 B6. Data Migration for Existing Unencrypted Nodes (Medium)

If a developer adds an `authorization` block to an existing schema that previously had none, all existing nodes of that schema are unencrypted. The migration path needs to:

1. Compute recipients for each existing node
2. Generate a content key per node
3. Encrypt the node content
4. Store the encrypted envelope
5. Do this for potentially thousands of nodes

Step 08's staged rollout (shadow → soft → full) partially addresses this but doesn't discuss the actual data migration mechanics.

**Recommendation:** Add a "Migration from Unencrypted to Encrypted" section to Step 08 with a batch migration utility.

---

### 🟡 B7. Grant Conflict Semantics Should Be Explicit (Medium)

The plan states "Grants are regular nodes" (Step 05), which means they **do** use NodeStore's Lamport-based LWW conflict resolution. But the plan doesn't explicitly define **grant-specific conflict semantics**.

**What the plan includes:**

- ✅ Grants are nodes → use NodeStore conflict resolution (Lamport LWW per field)
- ✅ Revocation is node update → `revokedAt` field uses LWW like other properties

**What should be made explicit:**

**1. Field-level LWW for grants** — NodeStore applies LWW per property. For Grant nodes:

- `revokedAt: number` — Last-write-wins by Lamport timestamp
- `expiresAt: number` — Last-write-wins by Lamport timestamp
- `actions: string` — Last-write-wins by Lamport timestamp

This means: Device A revokes (sets `revokedAt: 123, lamport: 100`). Device B extends expiry (sets `expiresAt: 456, lamport: 105`). Both changes apply independently. Is this desired?

**2. Cross-field conflict scenarios:**

- Device A updates `expiresAt` (lamport: 100)
- Device B updates `revokedAt` (lamport: 105)
- Both changes apply — grant is revoked but has new expiry date (contradictory state)

**Should revokedAt > 0 "lock" the grant** (reject further edits)? Or is field-level LWW acceptable?

**3. Deny-wins vs field-wins** — Should revocation (security) take precedence over any grant extension (availability)? Or trust LWW ordering?

**Recommendation:** Add to Step 05:

```typescript
/**
 * Grant Conflict Resolution Semantics
 *
 * Grants use NodeStore's field-level LWW (Last-Write-Wins by Lamport timestamp).
 *
 * RATIONALE: Security via key rotation, not state locking.
 * - Revocation doesn't prevent conflicting updates to grant fields
 * - Key rotation ensures revoked user loses access regardless
 * - Field-level LWW keeps grant state eventually consistent
 *
 * EDGE CASE: Revoked grant with extended expiry
 * - revokedAt > 0 dominates (grant is revoked)
 * - Evaluator checks revokedAt first, ignores expiresAt if revoked
 *
 * DECISION: Trust LWW + key rotation, not state locking
 */
```

This clarifies that the plan **intentionally relies on key rotation for security**, not state consistency.

**Steps affected:** 05 (grants), 08 (conflict testing)

---

### 🟡 B8. Delegation Chain Limits & Cascade Revocation (Medium)

The plan mentions UCAN delegation but **doesn't address depth limits or revocation cascading**.

**Problems:**

1. **No max proof chain depth**: UCAN `proofs` array in `@xnet/identity/ucan.ts` can be arbitrarily deep (100+ hops). No limit enforced.
2. **No cascade revocation**: Revoking a parent UCAN doesn't invalidate child delegations. Alice grants Bob, Bob delegates to Carol, Alice revokes Bob — Carol still has valid token.
3. **Self-delegation allowed**: No check preventing `issuer === audience` (user delegating to themselves).
4. **Group-aware delegation missing**: UCAN `audience` is single DID. Can't delegate "to all members of group X".

**Code gap** (`@xnet/identity/ucan.ts:104-131`):

```typescript
// Only validates immediate parent, not full proof chain depth
const parentCaps = proofs.flatMap((proof) => proof.att)
// Should: traverse entire chain, count depth, aggregate capabilities
```

**Recommendation:**

1. Add `maxProofDepth` config (default 4, aligned with relation traversal depth in Step 08)
2. Implement parent revocation cascade: track delegation graph, invalidate descendants on parent revoke
3. Reject self-delegation at grant creation time
4. Consider group-aware delegation as future work (audience can reference a Group node)

**Steps affected:** 05 (grants), 08 (limits)

---

### 🟡 B9. Last Admin Protection & Circular Dependencies (Medium)

**Missing special role scenarios:**

1. **Last admin protection**: Revoking the last person with `share` capability → resource becomes unrecoverable (no one can grant access back)
2. **Owner self-revocation**: Can owner revoke themselves? Who can restore?
3. **Circular group membership**: Group A contains Group B, Group B contains Group A → infinite loop in role resolution

**Current state:**

- No validation in `revoke()` to check remaining grantees
- Relation traversal has max-depth (3) and max-nodes (100) but no visited-set for cycle detection
- No "at least one admin must remain" rule

**Recommendation:**

1. Add `validateRevocation()` that counts remaining grantees with `share` capability
2. Reject revocation if it would leave zero people with `share` (or warn + require confirmation)
3. Add visited-set to relation traversal (supplement max-depth for cycle detection)
4. Document owner self-revocation as allowed but requiring another admin to restore

**Steps affected:** 05 (revoke), 03 (role resolution)

---

### 🟢 B10. Audit Logging (Low)

The plan has `AuthTrace` for debugging and DevTools timeline for real-time observation, but no **persistent audit log** for compliance. Who granted what, when, and who revoked it?

Grant nodes provide some audit trail (they're regular nodes with change history), but `can()` decisions are ephemeral.

**Recommendation:** Consider emitting `AuthDecisionEvent` to the existing telemetry system for persistent logging. Low priority — can be added later.

---

## C. Incorrect Assumptions (API Mismatches)

### 🟡 C1. Six API Name Mismatches

These need correction across the step files:

| Plan Uses                             | Actual API                                                                                                                                                                           | Steps Affected |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `adapter.saveChange(change)`          | `adapter.appendChange(change)`                                                                                                                                                       | 04             |
| `adapter.saveYjsState(state)`         | `adapter.setDocumentContent(nodeId, content)`                                                                                                                                        | 09             |
| `store.subscribe(nodeId, callback)`   | `store.subscribe(callback)` — global listener, filter by nodeId in callback                                                                                                          | 07             |
| `useStore()`                          | `useNodeStore()`                                                                                                                                                                     | 07             |
| `store.get(node.schemaId)` for schema | `schemaRegistry.get(iri)` — separate registry, not on store                                                                                                                          | 03, 04         |
| "7 devtools panels"                   | 9+ panels (NodeExplorer, ChangeTimeline, SyncMonitor, QueryDebugger, YjsInspector, HistoryPanel, SchemaRegistry, TelemetryPanel, VersionPanel, SecurityPanel, MigrationWizard, etc.) | 07             |

---

### 🟡 C2. Existing Code Not Referenced or Reconciled

The plan creates authorization primitives from scratch but doesn't reference existing implementations:

**`@xnet/core/permissions.ts`** already defines:

- `Group`, `Role`, `Capability` types
- `PermissionGrant` type
- `PermissionEvaluator` interface with `hasCapability()`, `resolveGroups()`, `getPermissions()`
- Standard roles: `viewer`, `editor`, `admin`
- `roleHasCapability()`, `evaluateCondition()`, `getMostPermissiveCapability()`

**`@xnet/identity/sharing/`** already has:

- `createShareToken()` — UCAN-based share link creation
- `buildCapabilities()` — Maps permission levels to UCAN capabilities
- `parseShareLink()` / `verifyShareToken()`
- `RevocationStore` — Signed revocation management with `computeTokenHash()`

**Recommendation:** Add a "Relationship to Existing Code" section to the README that explicitly states:

1. The plan's `PolicyEvaluator` **supersedes** `@xnet/core/permissions.ts`'s `PermissionEvaluator` interface (which was never implemented)
2. The plan's grant system **supersedes** `@xnet/identity/sharing/` for node-level access control, but sharing links may continue to work as a convenience layer on top of grants
3. The plan's `AuthAction` type should align with `@xnet/core`'s existing `Capability` type, or the old type should be deprecated

---

### 🟡 C3. Integration with Sync Infrastructure Should Be Explicit (Medium)

The plan states "Grants are regular nodes" which **implicitly** means they use NodeStore's sync infrastructure, but this should be **explicitly documented** for clarity.

**What the plan implicitly includes (by virtue of grants-as-nodes):**

- ✅ Lamport clocks — Grants inherit NodeStore's Lamport-based LWW
- ✅ Hash chain integrity — Grants are `Change<T>` events in the tamper-evident log
- ✅ Offline queue — Grant operations are node mutations → automatically queued offline
- ✅ Signature verification — Every grant change is signed with Ed25519

**What should be made explicit:**

**1. Grant operations ARE NodeStore operations**

```typescript
// These are equivalent:
store.auth.grant({ to: bob, ... })
  → store.create(GrantSchema, { grantee: bob, ... })

store.auth.revoke({ grantId })
  → store.update(GrantSchema, grantId, { revokedAt: Date.now() })
```

**2. Grants inherit ALL NodeStore properties:**

- Sync via existing CRDT infrastructure (no new sync protocol)
- Conflict resolution via Lamport clocks (same as data)
- Offline-first (queued automatically)
- Tamper-evident (part of hash chain)
- Verifiable (Ed25519 signed)

**3. Grant-specific rate limiting** — The plan doesn't address:

- Should grant operations have separate rate limits from data mutations?
- Yjs has 30 updates/sec, but grants are less frequent — same limit?
- DOS attack: malicious peer creates 1000 grants/sec

**4. Grant-specific peer scoring** — Should unauthorized grant attempts be penalized?

- Alice tries to grant Bob access but doesn't have `share` → penalty?
- Same peer scoring violations as unauthorized data writes?

**Recommendation:** Add to Step 05:

```markdown
## Integration with Sync Infrastructure

Grants-as-nodes inherit NodeStore's battle-tested sync stack:

| Capability          | Implementation                   | Inherited From |
| ------------------- | -------------------------------- | -------------- |
| Conflict resolution | Lamport LWW per field            | NodeStore      |
| Offline support     | Persistent queue, ordered replay | Offline queue  |
| Integrity           | Ed25519 signature, hash chain    | Sync layer     |
| Sync protocol       | CRDT merge, vector clocks        | NodeStore      |
| Peer validation     | Signature + schema verification  | Sync layer     |

**New considerations:**

- Grant-specific rate limits (recommended: 10 grants/min per peer)
- Grant-specific peer penalties (unauthorized grant attempts: -20 score)
```

**Steps affected:** 05 (grants), 06 (sync), 08 (rate limits, peer scoring)

---

## D. Performance Concerns

### 🟡 D1. Key Resolution Latency Is Hidden (Medium)

`computeRecipients()` calls `resolveRoleMembers()` which may do relation traversal (up to depth 3, up to 100 nodes). Each step loads a node + schema from storage. Then `wrapKeyForRecipient()` needs X25519 keys for every recipient.

On a node with 20 recipients and depth-2 relation traversal, the create/update path could take 100ms+, far exceeding the `grant() < 20ms` target.

**Recommendation:** The performance targets in Step 08 should include `computeRecipients()` as a separate benchmark with its own budget (likely 50–100ms for complex graphs). The `grant() < 20ms` target should note it excludes key resolution latency.

---

### 🟡 D2. Recipient Computation on Every Update (Medium)

Step 04 calls `computeRecipients()` on every `store.update()` to check if the recipients set changed (e.g., if an `editors` property was modified). For most updates (title change, status change), the recipients don't change, but the computation still runs.

**Recommendation:** Only re-compute recipients when auth-relevant properties change. The `CacheInvalidator.isAuthRelevantProps()` function in Step 08 hints at this, but it's not wired into the NodeStore enforcement in Step 04. Add a check: if the update patch doesn't touch any property referenced by a role resolver, skip recipient recomputation.

---

### 🟢 D3. Cache Invalidation Thundering Herd (Low)

When a popular node's grant is revoked, `invalidateNode(nodeId)` wipes the entire decision cache for that node. The next N concurrent readers all miss cache and evaluate in parallel.

With the 10ms cold `can()` target, this is likely fine for the expected concurrency levels. Note as a known edge case but don't over-engineer.

---

## E. DX Issues

### 🟡 E1. Silent vs Loud Rejection Inconsistency

The plan has different failure modes depending on context:

- **Local mutations** → `throw PermissionError` (loud)
- **Remote `applyRemoteChange`** → silently reject + emit event (silent)
- **Yjs updates** → silently reject + penalize peer (silent)

This is actually **correct behavior** (local errors should be loud, remote rejections should be silent), but it's never documented as a design decision. A developer debugging "why did my remote update disappear?" won't find guidance.

**Recommendation:** Add a "Failure Modes" table to the README or Step 04 documenting when auth failures throw vs silently reject.

---

### 🟡 E2. Legacy Schema Encryption Gap

If a developer defines a schema WITHOUT an `authorization` block, the plan falls back to `legacy` mode — **no encryption**. This means:

- Existing schemas (Page, Task, Database, Canvas) are unencrypted by default
- A developer who forgets the `authorization` block gets no protection
- There's no warning that data is flowing in plaintext

**Recommendation:** In `compat` mode, emit a console warning: "Schema 'Task' has no authorization block — data is unencrypted." In `enforce` mode (future), require an authorization block on all schemas.

---

### 🟢 E3. Error Message Clarity (Low)

The plan's `PermissionError` includes `action`, `roles`, and `reasons[]`. This is good. But the `DENY_NO_ROLE_MATCH` reason could be confusing when the user has roles but not the right one. Consider:

- `DENY_NO_ROLE_MATCH` → "You have roles [viewer] but action 'write' requires [editor, admin, owner]"

The `explain()` API provides this detail in traces, but the error message itself should be human-readable without needing to call `explain()`.

---

### 🟡 E4. Operational Debugging for Authorization (Medium)

The plan mentions DevTools AuthZ panel but **doesn't specify what operational diagnostics are needed for production troubleshooting**.

**Missing observability:**

1. **Permission denial root cause**: Real-time UI showing why `can()` denied (not just trace in console)
2. **Grant provenance**: Which device/peer created this grant? When? From which IP?
3. **Grant timeline visualization**: See grant creation, revocation, expiration events on a timeline (similar to existing Change Timeline)
4. **Delegation chain explorer**: Interactive tree showing who delegated to whom, how deep, which links are active/revoked
5. **Revocation propagation lag**: Which peers have learned about a revocation, which haven't, what's the lag?
6. **Content key age**: How long since key was rotated? How many recipients hold stale keys?

**Current state:** DevTools has 9 panels for data/sync/Yjs but no grant-specific observability.

**Recommendation:** Extend DevTools AuthZ panel (Step 07) with:

- Grant timeline (format matching existing Change Timeline)
- Delegation tree visualization (interactive, click to expand)
- Permission check live trace (real-time "why denied/allowed")
- Revocation propagation status table (peer × revocation matrix)
- Content key rotation history

**Steps affected:** 07 (devtools)

---

### 🟡 E5. Grant Expiration & Cleanup (Medium)

The plan includes `expiresIn` for grants but **doesn't address operational concerns around expiry**.

**Problems:**

1. **Stale expired grants**: No background task to prune expired grants (they accumulate in storage)
2. **Clock skew**: Different devices have different system times → inconsistent expiry behavior
3. **No renewal mechanism**: User must manually create new grant when old one expires
4. **No expiry notification**: User doesn't know a grant is about to expire

**Current state:** Grant schema has `expiresAt` field, but no cleanup process defined.

**Recommendation:**

1. Add background task to prune expired grants every 6 hours (similar to `YjsCheckpointer` in Step 09)
2. Document clock skew tolerance: "Expiry checked within ±60 seconds due to clock skew"
3. Consider adding `notifyBeforeExpiry: '24h'` for proactive user notification (low priority)
4. Consider `autoRenew: boolean` flag for grants that should auto-extend (future work)

**Steps affected:** 05 (grants), 08 (background tasks)

---

### 🟢 E6. Ownership Transfer (Low - Future Work)

**Not implemented and not mentioned:** The plan assumes `createdBy` is immutable (owner is always creator), but real-world scenarios may need ownership transfer:

- Transferring project ownership when employee leaves company
- Transferring ownership to a group/organization
- Bulk ownership change during organizational restructure

**Current state:** No ownership transfer mechanism. `createdBy` is set at node creation and never changes.

**Recommendation:** Either:

1. Document as explicit limitation: "Ownership cannot be transferred in v1. Owner is always the creator."
2. Add future work section: "Ownership transfer ceremony (planned for v2)" with sketch of design

**Steps affected:** README (limitations), 05 (future work)

---

## F. Improvement Suggestions (Priority-Ordered)

| Priority | Issue                            | Action                                                                                      | Steps Affected |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------- | -------------- |
| 🔴 P0    | X25519 key discovery             | Add key resolution strategy to Step 01 (birational conversion + hub registry fallback)      | 01, 04, 05, 09 |
| 🔴 P0    | Key backup/recovery              | Add new step or major section covering seed phrases, encrypted backup, recovery             | New (10) or 01 |
| 🔴 P0    | Offline auth policy              | Define cache TTL, re-validation strategy (eager/lazy/hybrid), max staleness threshold       | 05, 08         |
| 🟡 P1    | Delegation depth limits          | Add maxProofDepth (default 4), validate full proof chain in UCAN verification               | 05, 08         |
| 🟡 P1    | Parent revocation cascade        | Track delegation graph, invalidate child delegations when parent revoked                    | 05, 08         |
| 🟡 P1    | Last admin protection            | Validate revocation doesn't leave zero grantees with 'share' capability                     | 05, 08         |
| 🟡 P1    | Multi-device keys                | Document how content keys are wrapped for multiple devices per DID                          | 01, 05         |
| 🟡 P1    | Fix API mismatches               | Correct 6 API name mismatches to match actual codebase                                      | 03, 04, 07, 09 |
| 🟡 P1    | Reconcile existing code          | Add section explaining relationship to @xnet/core/permissions.ts and @xnet/identity/sharing | README         |
| 🟡 P1    | Make sync integration explicit   | Document that grants-as-nodes inherit NodeStore sync, add grant-specific rate limits        | 05, 06, 08     |
| 🟡 P1    | Grant conflict semantics         | Clarify field-level LWW behavior, document reliance on key rotation for security            | 05, 08         |
| 🟡 P1    | Public nodes                     | Specify concrete implementation for PUBLIC access mode                                      | 01 or 04       |
| 🟡 P1    | Data migration                   | Add batch migration utility for encrypting existing unencrypted nodes                       | 08             |
| 🟡 P2    | Authorization observability      | DevTools grant timeline, delegation tree, permission trace, revocation propagation status   | 07             |
| 🟡 P2    | Self-grant prevention            | Reject grantee === grantor at grant creation time                                           | 05             |
| 🟡 P2    | Circular group detection         | Add visited-set to relation traversal (supplement max-depth)                                | 03, 08         |
| 🟡 P2    | Grant expiration cleanup         | Background task to prune expired grants every 6 hours                                       | 05, 08         |
| 🟡 P2    | Schema version migration         | Document auth rule changes across schema versions                                           | 02             |
| 🟡 P2    | Failure mode docs                | Document when auth failures throw vs silently reject                                        | README or 04   |
| 🟡 P2    | Recipient recompute optimization | Skip recomputation when non-auth-relevant properties change                                 | 04             |
| 🟡 P2    | Write-side trust model           | Document that write auth is client-side only                                                | README         |
| 🟢 P3    | Audit logging                    | Emit AuthDecisionEvents to telemetry for persistent logging                                 | 08             |
| 🟢 P3    | Legacy schema warning            | Console warning when schema has no authorization block                                      | 04             |
| 🟢 P3    | Performance target adjustment    | Add computeRecipients() benchmark, note key resolution latency                              | 08             |
| 🟢 P3    | Ownership transfer               | Document as limitation or add future work section                                           | README, 05     |

---

## Single Biggest Risk

**Offline authorization policy and key recovery.** The plan's grants-as-nodes model elegantly solves sync (CRDT) and conflict resolution (Lamport LWW), but two critical gaps remain:

**1. Offline authorization policy under-specified (A4)**

The plan mentions `RevocationConsistency` modes but doesn't specify:

- Cache TTL for `can()` decisions in `eventual` mode
- Re-validation strategy on reconnect (eager/lazy/hybrid)
- Max staleness threshold before blocking operations
- Whether to emit events when cached decisions would change

**Impact:** Without explicit policy, implementations will vary. Security-critical applications may re-validate too aggressively (performance impact). Availability-critical applications may cache too long (security risk).

**Example scenario:**

```
Device A: Alice revokes Bob (12:00 PM)
Device B: Offline, cached Bob has write (cached at 11:50 AM)
Device B: Comes online (12:30 PM)
Question: Does Bob's cached write permission expire immediately?
          After 5 minutes? 1 hour? On next can() call?
Plan: No guidance.
```

**2. Key discovery and backup (A1, B1)**

The encryption-first model requires:

- Finding X25519 public keys for recipients (A1) — Solvable with Ed25519→X25519 birational conversion
- Recovering from lost keys (B1) — **No solution in plan**

If a user loses their device:

- They lose access to **all** encrypted content (no decrypt)
- They lose ability to unwrap **all** granted content keys (no access to shared resources)
- They cannot revoke grants they issued (don't have signing key)

**Why these are the top risks:**

1. **Offline policy** affects every permission check, every sync cycle, every cache invalidation. Get it wrong → security gaps or availability problems.

2. **Key recovery** is existential. Lose keys once → permanent data loss for that user and everyone they collaborated with (their grants become unrecoverable).

Both require architectural decisions (CAP theorem tradeoffs, crypto ceremony design) before implementation begins.

---

[Back to README](./README.md)
