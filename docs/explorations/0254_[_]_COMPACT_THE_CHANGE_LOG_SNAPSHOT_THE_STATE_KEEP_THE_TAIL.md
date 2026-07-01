# Compact The Change Log: The Durable Cold‑Open Fix — Snapshot The State, Keep The Tail

## Problem Statement

Opening the web app with a populated local cache stalls before any data paints.
We have chased this **ten times** (0204, 0227, 0228, 0229, 0233, 0249, 0253) and
every instrumentation pass finally converged on a single structural cause with
**two distinct symptoms**, both proportional to the size of the local `changes`
log (~318k–424k rows on the affected workspace):

1. **Intermittent slow SQLite `open()`** — a cold `installOpfsSAHPoolVfs()` /
   `createSyncAccessHandle()` on the large database file intermittently exceeds
   the 15 s open timeout (OPFS handle contention, sometimes self‑inflicted by a
   leaked worker). Fixed *as a failure mode* by **#355** (terminate + retry with
   a fresh worker) — boot now recovers instead of dying — but the underlying
   file is still large, so the slow open still *happens*.

2. **A ~5 s main‑thread freeze after `hub:connected`** — the first outbound
   resync (`syncLocalChanges`) deserialized (`JSON.parse` per row) and sorted the
   entire multi‑hundred‑k‑row slice synchronously. Fixed *as a freeze* by **#356**
   (code‑unit sort + yield every 1024), but the residual synchronous
   `getChangesSince` deserialize is still proportional to the slice size.

Both #355 and #356 make the boot **survivable and non‑janky**. Neither shrinks
the thing that makes both slow: **the change log itself.** This exploration is
the durable root fix the whole saga deferred as **F3 — compact the `changes`
log** so the database file is small (fast cold open) and the resync slice is
small (cheap deserialize).

The user's decision was explicit: fix the 5 s freeze first (**#356**, merged),
**then** design compaction. This is that design.

## Executive Summary

The decisive finding from grounding the kernel, sync protocol, and storage
projection in the current code:

> **The local `changes` log is a non‑authoritative cache.** Current node state is
> *fully materialized* in the `nodes` + `node_properties` tables and every live
> query reads from those; the log is never replayed for reads. The **hub** holds
> the authoritative full per‑room log. Therefore a client can **prune its local
> `changes` rows below a safe watermark** without affecting reads, without losing
> data (the hub can re‑serve history), and — if the watermark is chosen correctly
> — without breaking convergence with peers that did not compact.

This reframes "compaction" from a scary rewrite of a signed, hash‑chained,
LWW‑replicated log into something far safer: **local cache GC of already‑durable,
already‑confirmed history**, plus a `VACUUM` to reclaim the file space. The
materialized projection *is* the snapshot; we don't have to synthesize one.

The central design question is the **watermark**: how far can we prune the local
log and still (a) serve outbound delta‑sync, (b) let new local writes chain
correctly, and (c) guarantee a compacted peer converges byte‑identically to one
that replayed from 0. The following sections establish those invariants from the
code, then evaluate the candidate strategies.

## Current State In The Repository

### The log is a projection source, not a read source

- **Materialized state tables** — `nodes` (`packages/sqlite/src/schema.ts:30`)
  and `node_properties` (`packages/sqlite/src/schema.ts:40`) hold the current
  LWW‑merged value of every node/property, each property carrying its own
  `{ lamport_time, updated_by }` provenance.
- **The projection/reducer** — `NodeStore.applyChange`
  ([`store.ts:2345`](../../packages/data/src/store/store.ts)) does two things per
  change: `storage.appendChange(change)` (line ~2367, into `changes`) **and**
  `materializeNodeChange` → `storage.setNode(...)` (line ~2372, into
  `nodes`/`node_properties`). `setNode`
  ([`sqlite-adapter.ts:751`](../../packages/data/src/store/sqlite-adapter.ts))
  upserts with an LWW `WHERE lamport_time` guard.
- **Reads never touch `changes`** — `getNode`
  ([`sqlite-adapter.ts:665`](../../packages/data/src/store/sqlite-adapter.ts)) and
  `listNodesOptimized` (~`:867`) read only the materialized tables +
  `node_property_scalars` derived index. **The `changes` log is history/audit +
  outbound‑sync provenance only.**
- **Lamport watermark** — `getLastLamportTime`/`setLastLamportTime` live in the
  `sync_state` K/V table
  ([`sqlite-adapter.ts:1051`](../../packages/data/src/store/sqlite-adapter.ts)),
  seeded into the clock at `NodeStore.initialize`
  ([`store.ts:197`](../../packages/data/src/store/store.ts)).

### The kernel: a per-node hash chain of immutable, signed changes

- **`changes` schema** — `hash`(PK), `node_id`, `payload`(BLOB JSON), `lamport_time`,
  `lamport_peer`, `wall_time`, `author`, `parent_hash`, `batch_id`, `signature`
  ([`schema.ts:125`](../../packages/sqlite/src/schema.ts); FK
  `node_id → nodes(id) ON DELETE CASCADE`).
- **The chain is per‑node** — a new write sets `parentHash = getLastChange(nodeId)?.hash
  ?? null` ([`store.ts:2152`](../../packages/data/src/store/store.ts)). The very first
  change for a node has `parentHash: null`. (The spec says "per‑author"; the
  implementation and conformance vectors are per‑**node**.) **Consequence for
  compaction: the *only* thing a new write needs from history is that one node's most
  recent change hash — its "tip." Preserve the per‑node tips and every new write still
  chains to the correct predecessor.**
- **The hash is immutable and the signature commits to it** — `hash = BLAKE3` over the
  canonical‑JSON of the unsigned change (covers `payload`, `parentHash`, `lamport`,
  `authorDID`, …); the `signature` is Ed25519 over the UTF‑8 bytes of the
  `cid:blake3:…` hash *string* ([`packages/sync/src/change.ts`](../../packages/sync/src/change.ts)).
  **You therefore cannot synthesize a re‑signed "snapshot change" without the author's
  private key.** Compaction must *drop redundant rows*, never rewrite them — which is
  exactly what the materialized‑projection insight lets us do.
- **Deletes are soft** — a change with `deleted: true`; the node row is kept with a
  `deleted_at` timestamp, resolved by LWW like any property. No row is removed from
  `changes` on delete.

### Sync: the hub is authoritative; the client's log is a mostly‑redundant cache

- **Client outbound** — `syncLocalChanges`
  ([`node-store-sync-provider.ts`](../../packages/runtime/src/sync/node-store-sync-provider.ts))
  calls `getChangesSince(this.pushedThrough)` and enqueues; the cursor only
  *advances to a confirmed value* from the hub's `highWaterMark` in a
  `node-sync-response`. `getChangesSince`
  ([`sqlite-adapter.ts:591`](../../packages/data/src/store/sqlite-adapter.ts)) is
  `SELECT ... FROM changes WHERE lamport_time > ? ORDER BY lamport_time ASC`
  (no LIMIT — the whole tail at once; this is what #356 made non‑blocking).
- **Hub storage is the full log** — `node_changes`
  ([`packages/hub/src/storage/sqlite.ts:1141`](../../packages/hub/src/storage/sqlite.ts)),
  append‑only, deduped by `hash` PRIMARY KEY, served by `getNodeChangesSince`
  (`room, lamport_time > ? ORDER BY lamport_time ASC, lamport_author ASC LIMIT
  1000`). The hub does **not** materialize state — it is a pure change relay.
- **Bootstrap** — a fresh client (cursor 0) replays the entire room from the hub
  via `getChangesSince(0)` (`InitialSyncManager`), applying each with
  `applyRemoteChanges` → `applyRemoteChange`
  ([`store.ts:1866`](../../packages/data/src/store/store.ts)): verify hash,
  verify signature, authorize, `receive(clock, lamport)`, `applyChange`.
- **Convergence** — ordered replay + per‑property LWW (`shouldReplace`,
  [`store.ts:2378`](../../packages/data/src/store/store.ts)): incoming wins on
  higher lamport, ties broken by **code‑unit** author order (the same collation
  #356 aligned the outbound sort to). Order‑independent at the property level ⇒
  any peer applying the same set converges identically.
- **`node-clear` precedent** — `clearRoom` deletes the hub's room log and resets
  the client cursor to 0 (`node-relay.ts` + provider `clearRoom`). Proof that
  wiping the log and re‑deriving is already a supported operation — compaction is
  the *bounded, safe* version of it.

### What exists for space reclamation today

- **One‑time idle `VACUUM`** — [`apps/web/src/lib/db-vacuum.ts`](../../apps/web/src/lib/db-vacuum.ts),
  gated by `localStorage['xnet:db-vacuumed:v1']`, scheduled on
  `requestIdleCallback`. Defragments but **does not shrink row count** — with a
  424k‑row log the file stays large.
- **No log pruning** anywhere. `clear()`
  ([`sqlite-adapter.ts:1996`](../../packages/data/src/store/sqlite-adapter.ts))
  is a test‑only full `DELETE FROM changes`.

### Where the rows come from

Every user edit and every applied remote change appends exactly one row
(plus properties), and nothing ever removes them. Devtools seed
(`packages/devtools/src/seed`) bulk‑creates deterministic nodes; re‑runs LWW‑upsert
rather than delete, so a re‑seeded workspace accretes changes. The count is
**data‑proportional and monotonic** — it only ever grows.

## Key Findings

1. **State is fully materialized independent of the log** — reads are safe across
   any truncation of `changes`. (Decisive; confirmed in code, not inferred.)
2. **The hub is authoritative, but the persisted cursor is _not_ a proof of
   durability for this client's own changes.** The cursor advances to the hub's
   `highWaterMark` = `MAX(lamport)` over **all** authors, which a *foreign* peer's
   change can inflate past a *local* change this client authored at a low lamport
   (offline/concurrent) and never pushed. That stranded self‑authored row is the
   **only** recoverable copy (a `clearRoom` reset re‑pushes it from 0). Dropping
   "everything below the cursor" would destroy it → permanent data loss +
   divergence. This is the load‑bearing correction the adversarial pass surfaced;
   the safe rule keys on **live‑value lineage**, not the cursor alone.
3. **Convergence is per‑property LWW over an unordered set** — it does not require
   any peer to retain historical changes, only to have applied them into the
   projection **and** to still hold the row backing each currently‑winning value.
   Keep every "winner" row (+ per‑node tips) and the retained subset still
   materialises to the exact current state and can re‑push it.
4. **#355 + #356 already de‑risked the failure modes** — compaction is now a pure
   *performance/space* win on top of a boot that already survives a large log, so
   it can ship incrementally, behind a kill‑switch, without a flag‑day.

## External Research

Log compaction is standard in event sourcing: once events are folded into a
read model, historical events below a checkpoint can be truncated, keeping a
recent tail for late/concurrent arrivals. xNet's twist is that its "events" are
**signed, per‑node hash‑chained, immutable** changes replicated by LWW — so we
cannot rewrite them into a synthesized snapshot event (the hash and signature are
unforgeable without the author's key). The resolution is that xNet **already
maintains the read model** (`nodes`/`node_properties`) as a first‑class,
durable, OPFS‑persisted projection. The projection *is* the snapshot; compaction
is therefore not "build a checkpoint and truncate" but "**drop the log rows the
projection has made redundant.**"

## Options And Tradeoffs

Three designs were developed independently and scored (convergence‑safety /
blast‑radius / durability / effort):

| Design | Blast radius | Fixes | Verdict |
| --- | --- | --- | --- |
| **A. Client‑only log GC** (prune redundant history, keep per‑node tips) | local package + one idle scheduler; **no** hub/wire/DDL change | returning‑device cold open (**the affected case**) | **Ship.** Smallest convergence‑safe change. |
| **B. Snapshot + truncate** (event‑sourcing) | same as A locally | same as A | **Collapses into A.** Its value was proving an *explicit local snapshot is pure redundancy* — `packages/history/snapshot-cache.ts` `Snapshot` is a `structuredClone` of exactly the `nodes`/`node_properties` the DB already holds, and `PruningEngine` is not wired into `apps/web` at all. So: build **no** local snapshot; reserve the concept for the hub. |
| **C. Hub‑assisted signed‑snapshot bootstrap** | client **+ hub** (new `room_snapshots` table, `node-snapshot-*` messages, auth, protocol‑version bump, conformance vectors) | **also** fresh‑device bootstrap (O(nodes) seed vs O(changes) replay) | **Right destination, future work.** The only fix for fresh‑device cost, but XL effort + a new trust surface; ship dark/opt‑in later. |

The recommendation is **A, refined by the adversarial pass below** — the smallest
change that attacks the affected user's actual problem (a huge **local** log)
with zero protocol risk.

## The Adversarial Pass — Why The Obvious Rule Is Unsafe

The naive rule ("drop every row with `lamport < cursor − margin` except per‑node
tips") is **wrong**, and five independent red‑team lenses converged on the *same*
root cause:

> The persisted cursor equals the hub's `highWaterMark` = `MAX(lamport)` over
> **all** authors the hub holds — **not** a proof that this client's own changes
> below that lamport were ever transmitted.

Because Lamport clocks are neither globally unique nor gap‑free (`tick = max+1`,
`receive = max`), a client can author a change at a **low** lamport (while its
clock was low — offline or concurrent) that it never pushes. On reconnect
`pushedThrough` is force‑advanced to the hub's `highWaterMark`
(`node-store-sync-provider.ts:452`), so `getChangesSince(pushedThrough)` (strict
`lamport_time > ?`) **never re‑fetches** that stranded row. Today this is a
*latent, self‑healing* inconsistency — `clearRoom()` resets the cursor to 0 and
re‑pushes the entire local log, so the stranded change eventually reaches the
hub. **The naive GC deletes that row, converting a recoverable gap into permanent
data loss and cross‑peer divergence.** Confirmed sub‑cases:

- **Stranded self‑authored change** (converge + lost‑write + cursor lenses):
  the row holds a still‑winning property value the tip never re‑set; deleting it
  loses live state after any reset/fresh bootstrap.
- **Hub rollback** (Litestream/R2 point‑in‑time restore): `highWaterMark` drops
  **below** the persisted cursor; the monotonic guard treats it as a no‑op, and
  post‑compaction the client no longer holds the rows to re‑push → shared‑room
  divergence a fresh peer can't reconstruct.
- **BYO‑hub / hub migration**: the cursor is keyed by `authorDID` room, not hub
  identity; pointed at a fresh/empty hub the client only ever pushes tips, and a
  fresh peer replaying tip‑only history is missing every superseded‑but‑winning
  value.

Only the **hash‑chain** lens found no functional break (parentHash is consumed
solely when *creating* a change; the hub and apply path validate hash+signature
and never check parent existence) — with two required pins (below).

## Recommendation — Superseded‑History GC (client‑only, convergence‑safe)

Prune only history the projection has **made redundant**, keyed on **live‑value
lineage** rather than the cursor alone. A `changes` row is **KEPT** if it is in
any of these sets; otherwise it is prunable:

- **(K1) Recent tail** — `lamport_time ≥ Wsafe`, where
  `Wsafe = (MIN over rooms of getSyncCursor(room)) − LAMPORT_MARGIN`. Preserves
  everything `getChangesSince(pushedThrough)` still owes the hub, plus a margin.
- **(K2) Per‑node tip** — the single highest row per `node_id`, selected
  **byte‑identically to `getLastChange`**: `ORDER BY lamport_time DESC, hash ASC
  LIMIT 1`. Guarantees new‑write `parentHash` chaining is unchanged, and that
  every surviving node keeps ≥ 1 row (current deletions are tips → kept).
- **(K3) Live‑value backers** — any row whose identity `(node_id, lamport_time,
  author)` is the LWW provenance of a currently‑winning property in
  `node_properties` (or the node's `deleted_at` provenance). This is the
  adversarial fix: **no live projection value is ever left unbacked by a log
  row**, so a stranded‑but‑winning self‑authored change is never dropped, and the
  retained subset still materialises to — and can re‑push — the exact current
  state.

**Pruned = below `Wsafe`, not a tip, and backing no live value** — i.e. purely
*superseded* history (a property edited N times leaves N−1 dead rows). On a
churny, monotonically‑growing 424k‑row log this is the dominant fraction, so the
file shrinks materially, attacking **both** cold‑open costs at the root: a smaller
file → faster cold OPFS open (#355), and a smaller `getChangesSince` slice →
cheaper first resync (#356).

**Session‑level gates — no‑op the *entire* pass if any hold** (defence in depth
against the red‑team scenarios):

- any room's cursor is `0` (never confirmed), storage is `memory`, or the outbound
  breaker is halted (0224 `INVALID_HASH`);
- **rollback detected** — any room's most‑recent hub `highWaterMark` is *below*
  its persisted cursor (treat as "hub lost history"; re‑offer local rows, never
  prune);
- **hub identity changed this session** — pin GC to a single stable hub endpoint;
  skip for one session after any endpoint change (BYO‑hub guard).

**Correctness invariants the implementation MUST preserve** (each maps to a
verified claim):

1. Reads never regress — only `DELETE FROM changes`; never touch `nodes`,
   `node_properties`, `node_property_scalars`, or `sync_state`.
2. Outbound never loses a change — nothing `≥ Wsafe` is dropped (K1).
3. `parentHash` chaining unbroken — per‑node tip kept with the exact
   `getLastChange` tie‑break (K2); "≥ 1 row per surviving node" is a hard invariant.
4. Live state always backed — every currently‑winning value keeps its log row (K3).
5. Lamport clock never regresses — seeded from `sync_state.lastLamportTime`, which
   GC never touches.
6. Idempotent against non‑compacting peers — re‑delivery of a pruned row is a
   double no‑op (`INSERT OR IGNORE` on the `hash` PK + LWW `shouldReplace`).
7. Writer‑worker liveness — chunked `DELETE` inside `enqueueWrite`, idle‑scheduled,
   `try/catch` that never throws, so GC can never re‑introduce the freeze it cures.
8. No forged rows — only delete; never rewrite/re‑sign/synthesize a change.
9. Hub/protocol untouched — no hub code, no `node_changes`, no wire message, no
   hash/signature/protocol‑version/`SCHEMA_VERSION` change.

## Example Code

A single client‑only adapter method (chunked, tip‑ and lineage‑preserving) plus an
idle scheduler mirroring the existing `db-vacuum.ts` wiring.

```ts
// packages/data/src/store/sqlite-adapter.ts  (new method on the SQLite adapter)
//
// Prune superseded history below `wsafe`, keeping per-node tips and every row that
// still backs a live LWW value. Runs inside the write lane so it never races an
// interactive op; chunked so a 424k-row delete never monopolises the worker.
async pruneSupersededChanges(
  wsafe: number,
  { chunk = 5_000, maxRows = 250_000 } = {}
): Promise<{ deleted: number }> {
  if (!Number.isFinite(wsafe) || wsafe <= 0) return { deleted: 0 }
  let deleted = 0
  for (;;) {
    const n = await this.enqueueWrite(async () => {
      // A row is prunable iff: below the safe floor, NOT a per-node tip, and NOT
      // the LWW provenance of any live property. Chunk via a bounded subselect.
      const res = await this.db.run(
        `DELETE FROM changes WHERE hash IN (
           SELECT c.hash FROM changes c
           WHERE c.lamport_time < ?                                  -- below Wsafe
             AND c.hash <> (                                         -- (K2) not the tip
               SELECT t.hash FROM changes t
               WHERE t.node_id = c.node_id
               ORDER BY t.lamport_time DESC, t.hash ASC LIMIT 1)
             AND NOT EXISTS (                                        -- (K3) backs no live value
               SELECT 1 FROM node_properties p
               WHERE p.node_id = c.node_id
                 AND p.lamport_time = c.lamport_time
                 AND p.updated_by  = c.author)
           LIMIT ?)`,
        [wsafe, chunk]
      )
      return res.changes ?? 0
    })
    deleted += n
    if (n < chunk || deleted >= maxRows) break
    await this.yieldToIdle() // cooperative: let interactive ops interleave
  }
  return { deleted }
}
```

```ts
// apps/web/src/lib/change-log-compaction.ts  (new; scheduler mirrors db-vacuum.ts)
export function scheduleChangeLogCompaction(deps: CompactionDeps): void {
  if (!isEnabled('xnet:compact:changes')) return          // kill-switch
  onIdle(async () => {
    const rooms = await deps.listSyncedRooms()
    if (rooms.length === 0) return
    // Gate: every room confirmed at least once; no rollback; stable hub.
    const cursors = await Promise.all(rooms.map((r) => deps.getSyncCursor(r)))
    if (cursors.some((c) => c <= 0)) return
    if (await deps.anyRollbackOrHubChange(rooms)) return    // HWM < cursor, or endpoint changed
    if (deps.outboundHalted()) return                       // 0224 breaker tripped
    const wsafe = Math.min(...cursors) - LAMPORT_MARGIN
    const { deleted } = await deps.store.pruneSupersededChanges(wsafe)
    if (deleted > 0) {
      await deps.checkpointWal()                            // TRUNCATE so WAL doesn't transiently grow
      deps.rearmVacuum()                                    // reclaim freed pages (reuse db-vacuum)
    }
    persistDebug('xnet:compact:last', { wsafe, deleted })   // truncation-proof, like #352
  })
}
```

## Risks And Open Questions

- **Solo‑workspace yield.** For a single‑author workspace most rows are
  self‑authored; the win comes from *superseded* rows (churn), not foreign ones.
  Open question: measure the superseded fraction on the real 424k log before
  committing to the space estimate. If churn is low, the durable fix is the
  hub‑snapshot bootstrap (follow‑up), not local GC.
- **Audit/history degradation is intended.** `verifyChain` will report
  `broken-chain` when a kept tip's `parentHash` points below the retained window;
  this must be classified **expected, not error** (`packages/history`
  `verification.ts:78`), and full‑history blame/timeline routed to the hub. Off
  the boot/read path, so acceptable — but it is a real behaviour change for audit
  tooling.
- **The strand bug is pre‑existing and orthogonal.** `pushedThrough` advancing to
  `highWaterMark` past un‑pushed local changes is a latent correctness gap **today**
  (independent of GC). K3 makes GC safe regardless, but the strand itself deserves
  its own fix: track a real per‑client *pushed* cursor / an explicit unacked‑local
  set that `syncLocalChanges` always re‑offers. Filed as a follow‑up.
- **VACUUM cost.** Reclaiming pages rewrites the file (≈2× transient space, one
  blocking pass). Reuse the idle one‑shot; if its generation flag is already burned
  on the affected workspace, re‑arm it so the file‑size win isn't deferred.
- **Per‑room accounting.** Rows aren't tagged by room locally, so `MIN`‑across‑rooms
  `Wsafe` is conservative — one lagging room pins the floor low. A later
  enhancement could tag `changes` by room to prune per‑room.

## Implementation Checklist

- [ ] `pruneSupersededChanges(wsafe, …)` on the SQLite node‑storage adapter —
      chunked, inside `enqueueWrite`, tip tie‑break identical to `getLastChange`
      (`ORDER BY lamport_time DESC, hash ASC`), K3 `NOT EXISTS` lineage guard.
- [ ] `scheduleChangeLogCompaction` in `apps/web` mirroring `db-vacuum.ts`; behind
      `xnet:compact:changes` kill‑switch; idle‑scheduled.
- [ ] Session gates: every room cursor > 0, storage ≠ memory, outbound not halted,
      **no rollback** (`HWM ≥ cursor`), **stable hub identity** this session.
- [ ] Rollback handling: on `node-sync-response` with `highWaterMark <
      getSyncCursor(room)`, reset `pushedThrough → min(pushedThrough, HWM)` and
      re‑offer; never prune above the last‑seen HWM.
- [ ] `PRAGMA wal_checkpoint(TRUNCATE)` after prune; re‑arm idle `VACUUM`.
- [ ] Truncation‑proof debug: `localStorage['xnet:compact:last'] = { wsafe,
      deleted }` (same pattern as #352).
- [ ] `@xnetjs/data` (+ `@xnetjs/runtime` if the provider exposes the watermark)
      changeset — behaviour‑additive, `patch`.
- [ ] **Follow‑up (separate):** hub‑assisted signed‑snapshot bootstrap (Design C).
- [ ] **Follow‑up (separate):** fix the `pushedThrough` strand (real pushed cursor
      / unacked‑local re‑offer set).

## Validation Checklist

- [ ] **Convergence conformance (currently would FAIL without K3):** author a local
      change *below* a concurrently‑received `highWaterMark`, run GC, bootstrap a
      fresh peer from the hub → assert projections byte‑identical.
- [ ] **Live‑value retention:** property edited N times; after GC the winning row
      survives and the projection value is unchanged; N−1 superseded rows gone.
- [ ] **Tip/chain:** after GC, `getLastChange(nodeId)` returns the same hash as
      pre‑GC for every node; a new write produces an identical `parentHash`/hash to
      an uncompacted peer (equal‑lamport same‑node seed exercises the tie‑break).
- [ ] **Idempotent re‑delivery:** re‑applying a pruned change is a row‑level
      (`INSERT OR IGNORE`) and projection‑level (LWW) no‑op.
- [ ] **Rollback:** hub `HWM` regresses below the cursor → GC no‑ops and the client
      re‑offers; no divergence.
- [ ] **BYO‑hub:** repoint at an empty hub → GC skips that session; current state is
      still fully re‑pushable from the retained (K1∪K2∪K3) rows.
- [ ] **Liveness:** GC of a 424k‑row log never blocks an interactive op > one frame
      (chunked); `xnet:boot:longblock` shows no new long task attributable to it.
- [ ] **Space:** post‑GC + VACUUM, file bytes and `changes` row count drop by the
      measured superseded fraction; cold‑open `sqlite:open` improves accordingly.

## References

- This saga: [0204](../../docs/explorations/0204_[x]_FAST_LOCAL_FIRST_COLD_START_AND_CACHE_HYDRATION.md),
  [0233](../../docs/explorations/0233_[_]_THE_15_SECOND_COLD_FIRST_QUERY_OPFS_PAGE_IN_AND_DB_BLOAT.md)
  (the canonical prior compaction note),
  [0249](../../docs/explorations/0249_[_]_THE_COLD_OPEN_STALL_NAMING_THE_15S_QUERY_AND_THE_9S_IDENTITY_BUCKET.md),
  [0253](../../docs/explorations/0253_[_]_THE_SEVENTH_COLD_OPEN_MIGRATION_THE_STALL_LEFT_EXECMS.md).
- Failure‑mode fixes this builds on: **#355** (resilient SQLite open retry),
  **#356** (yield outbound resync off the main thread).
- Kernel/projection: [`store.ts`](../../packages/data/src/store/store.ts),
  [`sqlite-adapter.ts`](../../packages/data/src/store/sqlite-adapter.ts),
  [`schema.ts`](../../packages/sqlite/src/schema.ts).
- Sync: [`node-store-sync-provider.ts`](../../packages/runtime/src/sync/node-store-sync-provider.ts),
  hub [`storage/sqlite.ts`](../../packages/hub/src/storage/sqlite.ts),
  [`services/node-relay.ts`](../../packages/hub/src/services/node-relay.ts).
- Space reclamation: [`db-vacuum.ts`](../../apps/web/src/lib/db-vacuum.ts).
- Protocol spec: `docs/specs/protocol/03-replication.md`.
