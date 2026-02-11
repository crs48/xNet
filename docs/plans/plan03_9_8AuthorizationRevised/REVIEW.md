# Plan Review: plan03_9_8AuthorizationRevised

> Architectural audit of the authorization plan against the actual xNet codebase. Conducted 2026-02-10.

**Verdict:** The plan is strong — the encryption-first model, room-gated Yjs design, and typed builder DX are well-considered. Two critical gaps (key discovery, key recovery) must be addressed before implementation. Six API mismatches need correction. Several medium-priority concerns around multi-device, public nodes, and data migration need sections added.

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

### 🟢 B7. Audit Logging (Low)

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

## F. Improvement Suggestions (Priority-Ordered)

| Priority | Issue                            | Action                                                                                      | Steps Affected |
| -------- | -------------------------------- | ------------------------------------------------------------------------------------------- | -------------- |
| 🔴 P0    | X25519 key discovery             | Add key resolution strategy to Step 01 (birational conversion + hub registry fallback)      | 01, 04, 05, 09 |
| 🔴 P0    | Key backup/recovery              | Add new step or major section covering seed phrases, encrypted backup, recovery             | New (10) or 01 |
| 🟡 P1    | Multi-device keys                | Document how content keys are wrapped for multiple devices per DID                          | 01, 05         |
| 🟡 P1    | Fix API mismatches               | Correct 6 API name mismatches to match actual codebase                                      | 03, 04, 07, 09 |
| 🟡 P1    | Reconcile existing code          | Add section explaining relationship to @xnet/core/permissions.ts and @xnet/identity/sharing | README         |
| 🟡 P1    | Public nodes                     | Specify concrete implementation for PUBLIC access mode                                      | 01 or 04       |
| 🟡 P1    | Data migration                   | Add batch migration utility for encrypting existing unencrypted nodes                       | 08             |
| 🟡 P2    | Schema version migration         | Document auth rule changes across schema versions                                           | 02             |
| 🟡 P2    | Failure mode docs                | Document when auth failures throw vs silently reject                                        | README or 04   |
| 🟡 P2    | Recipient recompute optimization | Skip recomputation when non-auth-relevant properties change                                 | 04             |
| 🟡 P2    | Write-side trust model           | Document that write auth is client-side only                                                | README         |
| 🟢 P3    | Audit logging                    | Emit AuthDecisionEvents to telemetry for persistent logging                                 | 08             |
| 🟢 P3    | Legacy schema warning            | Console warning when schema has no authorization block                                      | 04             |
| 🟢 P3    | Performance target adjustment    | Add computeRecipients() benchmark, note key resolution latency                              | 08             |

---

## Single Biggest Risk

**Key discovery and backup.** The entire encryption-first model collapses if:

1. You can't find someone's X25519 key to wrap a content key for them → **grants don't work**
2. A user loses their keys and has no recovery path → **permanent data loss**

Everything else in the plan is solid engineering. These two gaps are existential and must be resolved before implementation begins.

---

[Back to README](./README.md)
