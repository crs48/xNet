# Sync Flood: Full Change-Log Replay, Hub Rate-Limit, And Reconnect Storm

## Problem Statement

After fixing the OPFS in-memory fallback (PR #202, the local DB now
reports `getStorageMode() === 'opfs'`), a new failure appeared in the
debug log: the client publishes **thousands** of `node-change` messages
to its author room back-to-back, the hub closes the socket with

```
[ConnectionManager] WebSocket closed, code: 1008 reason: Rate limit exceeded
```

…and the client immediately reconnects and floods again. Interleaved are
~97 `node-error` / `error` responses from the hub and a prior
`First change for node social:enrichment:… must include schemaId` throw.

The net effect: sync never settles, the hub keeps kicking the client, and
the connection oscillates `connected → disconnected → connecting →
connected` in a storm.

## Executive Summary

Three compounding mechanisms produce the flood and the storm:

1. **Full change-log replay on every page load (root cause).**
   `NodeStoreSyncProvider.lastSyncedLamport` is an **in-memory field
   initialized to `0`** and **never persisted**
   (`packages/runtime/src/sync/node-store-sync-provider.ts:47`). On every
   `connected` event it calls `syncLocalChanges()` →
   `store.getChangesSince(this.lastSyncedLamport)` →
   `SELECT … FROM changes WHERE lamport_time > 0`
   (`packages/data/src/store/sqlite-adapter.ts:570`) — i.e. the **entire
   change log** — and publishes **one WebSocket message per change** in a
   tight loop (`node-store-sync-provider.ts:149-174`). **The OPFS fix is
   what exposed this:** with persistence working, the `changes` table is
   now large and durable (one row per mutation, unbounded), so the replay
   is huge. In the old in-memory mode the log was empty each load, hiding
   the bug.

2. **Hub rate-limit → 1008 → reconnect → re-flood (the storm).** The hub
   allows **100 messages / 1000 ms per connection**; the 3rd violation
   closes the socket with `1008 Rate limit exceeded`
   (`packages/hub/src/middleware/rate-limit.ts:12-17,53-88`,
   `packages/hub/src/server.ts:1141-1148`). Hundreds of one-per-change
   publishes blow past that instantly. The client's `onclose` does **not**
   special-case 1008 — it just `scheduleReconnect()`s
   (`connection-manager.ts:316-323`), reconnects, fires `connected`, and
   re-runs `syncLocalChanges()` from a low (often still-0) high-water
   mark → floods again. The client also **never handles `node-error`**
   (`node-store-sync-provider.ts:133-138` only handles
   `node-sync-response`), so it never learns the hub already has these
   changes.

3. **Session-local enrichment data is synced and malformed (the fuel).**
   `useSocialFeedEnrichment` creates one `SocialEnrichment` node per feed
   preview (per `platform`+`contentId`), hundreds per browsing session,
   each an immediate `node-change`
   (`apps/web/src/hooks/useSocialFeedEnrichment.ts:111-120`,
   `apps/web/src/hooks/social-feed-enrichment.ts:296-358`). These are
   derived unfurl cache data that arguably shouldn't sync at all. Separately,
   `deserializeChange` restores only `payload` and ignores the redundant
   top-level `schemaId` (`node-store-sync-provider.ts:256-272`,
   `packages/hub/src/services/node-relay.ts:137-153`), so any change whose
   `payload.schemaId` is missing throws `First change … must include
   schemaId` in `applyChange` (`store.ts:2286-2290`) — an **uncaught**
   rejection that aborts the rest of the `applyRemoteChanges` batch and
   yields `node-error`s.

**Headline recommendation:** (a) **persist the per-room high-water mark**
so a reload doesn't replay from 0; (b) **batch + throttle** outbound
changes (one `node-sync-batch` array, token-bucket under the hub's limit)
instead of one publish per change; (c) **request-sync-first** so we only
push what the hub is missing; (d) **treat 1008 as backpressure** — long
jittered backoff, no immediate re-flood, handle `node-error`; (e) **stop
syncing session-local enrichment** and make `applyRemoteChanges`
resilient to one malformed change.

## Current State In The Repository

### The flood loop (sequence)

```mermaid
sequenceDiagram
    autonumber
    participant SM as SyncManager
    participant NSP as NodeStoreSyncProvider
    participant Store as NodeStore (SQLite/OPFS)
    participant Conn as ConnectionManager
    participant Hub as Hub (rate limiter)

    Note over Conn,Hub: WebSocket opens → status 'connected'
    Conn->>NSP: onStatus('connected')
    NSP->>NSP: syncLocalChanges()  (lastSyncedLamport = 0 on fresh load)
    NSP->>Store: getChangesSince(0)
    Store-->>NSP: ALL changes (entire log — large now OPFS persists)
    loop one message per change (no batching)
        NSP->>Conn: publish(authorRoom, {type:'node-change', …})
        Conn->>Hub: ws.send(...)  ← counts against 100 msg/sec
    end
    Hub-->>Conn: violation 1, 2 → {type:'error'}; violation 3 → close(1008)
    Conn->>NSP: onStatus('disconnected')
    Conn->>Conn: scheduleReconnect() (2s base, no 1008 special-case)
    Conn->>Hub: reconnect → 'connected'
    Note over NSP: onStatus('connected') fires again → syncLocalChanges() re-floods
```

### Key files and seams

**The replay (client):**
- `packages/runtime/src/sync/node-store-sync-provider.ts:47` —
  `private lastSyncedLamport = 0` (in-memory, never loaded from storage).
- `:96-101` / `:108-111` — on `connected` (and on attach if already
  connected): `syncLocalChanges()` + `requestSync()`.
- `:149-161` — `syncLocalChanges()` = `getChangesSince(lastSyncedLamport)`
  then `for (const change …) broadcastChange(change)`.
- `:163-174` — `broadcastChange()` = one `connection.publish(room, {type:
  'node-change', …})` per change. No batching, no throttle.
- `:140-147` — `requestSync()` sends `node-sync-request {room,
  sinceLamport}`; `:229` updates `lastSyncedLamport` from the response's
  `highWaterMark` (but only after a response, and it's lost on reload).

**The change log (store):**
- `packages/data/src/store/sqlite-adapter.ts:570-580` —
  `getChangesSince(sinceLamport)` = `… WHERE lamport_time > ? ORDER BY
  lamport_time ASC`. With `0`, returns the whole table.
- `packages/sqlite/src/schema.ts:121-134` — `changes` table: one row per
  mutation, **grows unbounded**; pruning (`packages/history/src/pruning.ts`)
  exists but is opt-in (keep-last-200/node, ≥30 days, needs a snapshot).
- `packages/sqlite/src/schema.ts:204-207` — `sync_state(key,value)` exists
  but only stores a **global** `lastLamportTime`; there is **no per-room
  high-water-mark**, and `NodeStoreSyncProvider` never reads it.
- Remote changes are correctly tagged `isRemote:true`
  (`store.ts:1888`) and the rebroadcast guard
  (`node-store-sync-provider.ts:103-106`) holds — so there is **no
  apply→rebroadcast amplification loop**. The flood is pure replay, not a
  cycle.

**The hub rate limiter:**
- `packages/hub/src/middleware/rate-limit.ts:12-17` —
  `perConnectionRate: 100, windowMs: 1000, maxMessageSize: 5MB`.
- `:53-88` — per-message counter; `>100/window` → violation; **3
  violations** → `'…will be closed'`.
- `packages/hub/src/server.ts:1141-1148` — on that reason →
  `ws.close(1008, 'Rate limit exceeded')`, else `{type:'error'}`.

**Close-code handling (client):**
- `packages/runtime/src/sync/connection-manager.ts:316-323` — `onclose`
  logs code+reason but treats **all** codes the same → `scheduleReconnect()`.
- `:340-353` — exponential backoff (base 2000ms, ×2, cap 30s) added in
  0204, but the **first** retry is still the base delay and nothing knows
  1008 means "you're being throttled, stop pushing."

**`node-error` (hub → client, unhandled):**
- `packages/hub/src/server.ts:1283-1326,1413-1490` — emits `node-error`
  with codes `UNAUTHORIZED/INVALID_CHANGE/INVALID_HASH/INVALID_SIGNATURE/
  MISSING_SCOPE/REPLAY_REJECTED`.
- `packages/hub/src/services/node-relay.ts:100` — dedupes by hash
  (`hasNodeChange`): an already-stored change `return false` (dropped) — so
  the hub *is* idempotent, but the client keeps resending because it
  ignores `node-error` and resets its cursor.

**The enrichment fuel + schemaId fragility:**
- `apps/web/src/hooks/useSocialFeedEnrichment.ts:111-120,165-172` — one
  `SocialEnrichment` create/update per uncached preview; `requestMany`
  enqueues every visible item.
- `apps/web/src/hooks/social-feed-enrichment.ts:296-358` — queue writes
  one-at-a-time, ~500 ms apart, each its own `node-change`.
- `packages/social/src/schemas/enrichment.ts:50-52` — deterministic
  `social:enrichment:<platform>:<contentId>` ids.
- `node-store-sync-provider.ts:232-272` — `serializeChange` writes
  `schemaId` at top level *and* in `payload`; `deserializeChange` restores
  only `payload` (top-level ignored — no fallback).
- `packages/data/src/store/store.ts:2286-2290` — first change without a
  `schemaId` throws; the throw escapes `applyRemoteChanges` and aborts the
  batch → hub `node-error`.

### Why now (the OPFS irony)

```mermaid
flowchart TD
    A[Before PR #202: OPFS handle contention] --> B[SQLite falls back to :memory:]
    B --> C[changes table EMPTY every load]
    C --> D[getChangesSince(0) ≈ 0 rows → tiny/no flood]
    D --> E[bug hidden]
    F[After PR #202: OPFS retry works] --> G[changes table DURABLE + large]
    G --> H[getChangesSince(0) = whole log → hundreds/thousands of msgs]
    H --> I[blow past 100 msg/sec → 1008 → reconnect storm]
```

## External Research

- **WebSocket close code 1008 is a policy violation, not a transient
  error.** Guidance is explicit: do **not** naively exponential-backoff-
  and-retry a 1008 as if it were a blip — it signals the client is doing
  something the server rejects (here: exceeding the rate limit). Servers
  should send a retry-after; clients should back off with **jitter** so
  reconnects spread over 10–30 s rather than stampeding.
  ([WebSocket.org error handling](https://websocket.org/guides/error-handling/),
  [WebSocket.org close codes](https://websocket.org/reference/close-codes/),
  [OneUptime: handling WS rate limiting](https://oneuptime.com/blog/post/2026-01-24-websocket-rate-limiting/view))

- **Backpressure + batching are the standard remedy for write storms.**
  The pattern: per-connection queue limits, a lightweight feedback
  channel, throttle/suspend low-priority producers, batch background
  writes (flush interactive ones immediately), and exponential backoff to
  prevent reconnection storms.
  ([Vertext Labs: WS backpressure & flow control](https://vertextlabs.com/websocket-backpressure-flow-control-real-time-chat-streams/),
  [LatteStream: WS best practices](https://lattestream.com/blog/websocket-best-practices))

- **Delta/anti-entropy sync uses a persisted cursor.** Production sync
  engines (Yjs state vectors, CRDT delta-state, replication logs) exchange
  a *high-water mark / state vector* and send only the delta the peer is
  missing — never the whole log on reconnect. xNet already does this for
  Yjs docs (`sync-step1`/`sync-step2` carry state vectors) but the
  **node-store** path resets its cursor to 0 each load.

## Key Findings

1. **The high-water mark is not durable.** `lastSyncedLamport` lives only
   in the `NodeStoreSyncProvider` instance and is recreated as `0` on
   every page load. There is no per-room cursor in `sync_state`.

2. **Outbound sync is one-message-per-change.** No batching, no throttle,
   no coalescing — directly antagonistic to a 100 msg/sec hub limit.

3. **1008 is treated as a generic disconnect.** The reconnect path
   re-triggers the exact flood that caused the close. The first reconnect
   is ~2 s (no jitter), so the storm is tight.

4. **The hub is idempotent but the client is not cursor-stable.** The hub
   dedupes by hash and returns a `highWaterMark`; the client ignores
   `node-error` and re-pushes from 0 anyway.

5. **Enrichment data inflates the log.** Hundreds of session-local
   `social:enrichment:*` nodes per browse, all synced, all individually
   broadcast — both the *fuel* for the flood and the source of the
   `schemaId` `node-error`s.

6. **No apply→rebroadcast loop.** `isRemote` tagging is correct; this is a
   replay/volume problem, not an amplification cycle.

7. **The change log is unbounded.** Without opt-in pruning it grows
   forever, so the flood (and the cold-start replay) only gets worse over
   time.

## Options And Tradeoffs

### A. Persist the per-room high-water mark
Store `nodeSync:hwm:<room>` in `sync_state`; load it into
`lastSyncedLamport` on attach; persist after each successful sync.

- **Pros:** Directly kills the full-log replay; a reload sends only truly
  new local changes. Small, surgical.
- **Cons:** Must be careful that "synced to hub" really means durably
  stored (advance the cursor on the hub's ack / `highWaterMark`, not on
  local send). A too-eager cursor could skip a change the hub never got.

### B. Batch + throttle outbound changes
Replace per-change `publish` with a `node-sync-batch` (array) and a
token-bucket sender capped under the hub limit (e.g. ≤50 msg/sec, batches
of N changes per message).

- **Pros:** Collapses N messages into a few; stays under 100/sec even when
  a genuine backlog exists; mirrors the inbound `node-sync-response` array
  shape. Helps every push, not just reloads.
- **Cons:** New wire message type (hub must accept `node-sync-batch`);
  batch size vs latency tuning.

### C. Request-sync-first ordering
On connect, send `node-sync-request` and **wait** for the
`node-sync-response` (with `highWaterMark`) before pushing; only push
changes `> highWaterMark`.

- **Pros:** When the hub is already ahead (the common reload case), we push
  *nothing*. Uses data the hub already returns.
- **Cons:** Adds a round-trip before first push; needs the cursor (A) to be
  meaningful across the await.

### D. Treat 1008 as backpressure
Special-case close code 1008: long jittered backoff (e.g. 15–30 s ±
jitter), and do **not** auto-run `syncLocalChanges` on the next connect
until the backlog is drained through the throttled sender. Handle
`node-error` (log, stop resending that hash).

- **Pros:** Breaks the storm even if a flood slips through; aligns with WS
  guidance ("don't retry 1008 naively").
- **Cons:** Must distinguish 1008-rate-limit from 1008-auth (both are
  policy violations); needs the rate-limit reason string or a structured
  code.

### E. Stop syncing session-local enrichment + harden apply
Mark `SocialEnrichment` as local-only (skip in the sync provider), or
batch enrichment writes; fix `deserializeChange` to fall back to top-level
`schemaId`; make `applyRemoteChanges` skip+warn on one bad change instead
of throwing the whole batch.

- **Pros:** Removes hundreds of pointless synced nodes (less fuel) and the
  `node-error` source; one malformed change can't abort a batch.
- **Cons:** Need a principled "derived/cache" vs "durable" node
  distinction; verify no one relies on enrichment syncing across devices.

### Comparison

| Option | Stops full replay | Stops the storm | Effort | Risk |
|---|---|---|---|---|
| A Persist HWM | **yes** | partial | low | med (cursor correctness) |
| B Batch+throttle | partial | **yes** | med | med (new wire type) |
| C Request-first | **yes** (when hub ahead) | partial | low–med | low |
| D 1008 backpressure | no | **yes** | low | low |
| E Enrichment + harden | reduces fuel | partial | med | low–med |

## Recommendation

Ship **A + C + D first** (kills the replay and the storm with the least
surface), then **B**, then **E**:

1. **A — persist the per-room cursor.** Advance it from the hub's
   `highWaterMark` / acks, not from local send, so it's safe.
2. **C — request-sync-first.** On connect, await `node-sync-response` and
   only push `> highWaterMark`. Combined with A, a normal reload pushes
   nothing.
3. **D — 1008 backpressure.** Long jittered backoff on rate-limit closes;
   don't immediately re-push; handle `node-error`.
4. **B — batch + throttle** the genuine-backlog case into
   `node-sync-batch` under a token bucket, so even a first-ever sync of a
   large log can't trip the limiter.
5. **E — enrichment hygiene + resilient apply** to cut the fuel and the
   `schemaId` `node-error`s.

This sequence is measurement-cheap, each step independently reduces the
flood, and A+C+D alone should make the log quiet on a normal reload.

## Example Code

### A — persist + load the per-room sync cursor

```ts
// NodeStoreSyncProvider — load on attach, persist after sync
async attach(connection: ConnectionManager): Promise<void> {
  this.connection = connection
  this.lastSyncedLamport = await this.store.getSyncCursor?.(this.room) ?? 0  // NEW
  // …existing wiring…
}

private async advanceCursor(to: number): Promise<void> {
  if (to <= this.lastSyncedLamport) return
  this.lastSyncedLamport = to
  await this.store.setSyncCursor?.(this.room, to)  // sync_state: nodeSync:hwm:<room>
}
```

### C — request-sync-first, push only the delta

```ts
this.statusCleanup = connection.onStatus(async (status) => {
  if (status !== 'connected') return
  this.requestSync()                 // ask hub for its highWaterMark first
  await this.awaitSyncResponse()     // resolves in handleSyncResponse()
  await this.syncLocalChanges()      // now only pushes changes > highWaterMark
})
```

### B — batch + token-bucket outbound

```ts
private queue: NodeChange[] = []
private enqueue(change: NodeChange) { this.queue.push(change); this.flushSoon() }

private async flush() {
  while (this.queue.length && this.bucket.take()) {        // ≤ N msg/sec
    const batch = this.queue.splice(0, BATCH_SIZE)         // e.g. 100 changes
    this.connection?.publish(this.room, {
      type: 'node-sync-batch',
      room: this.room,
      changes: batch.map((c) => this.serializeChange(c))
    })
    await this.advanceCursor(Math.max(...batch.map((c) => c.lamport.time)))
  }
}
```

### D — 1008 backpressure on the connection

```ts
ws.onclose = (event) => {
  clearConnectTimer(); connectInProgress = false; ws = null
  setStatus('disconnected')
  if (event.code === 1008) {
    log('policy/rate-limit close — long jittered backoff, suppress re-push')
    scheduleReconnect({ minDelay: 15000, jitter: true, suppressInitialPush: true })
  } else {
    scheduleReconnect()
  }
}
```

### E — schemaId fallback on deserialize

```ts
private deserializeChange(s: SerializedNodeChange): NodeChange {
  const payload = s.payload?.schemaId ? s.payload : { ...s.payload, schemaId: s.schemaId }
  return { /* …, */ payload }
}
```

## Risks And Open Questions

- **Cursor correctness (A).** Advancing `lastSyncedLamport` on local
  *send* (current code, lines 159/173) can skip changes the hub never
  durably stored if the socket drops mid-flush. Advance only on the hub's
  ack/`highWaterMark`.
- **Lamport ties.** `getChangesSince` uses `> ?`; two changes with equal
  `lamport_time` from different authors are both excluded once the cursor
  passes — confirm no legitimate change is skipped (compound cursor on
  `(lamport_time, hash)` if needed).
- **New `node-sync-batch` wire type (B).** Requires hub support + version
  negotiation; until both sides speak it, keep a capped per-change
  fallback.
- **1008 ambiguity (D).** Rate-limit and auth both close with 1008; need
  the reason string or a structured close payload to pick the right
  backoff (auth → stop entirely; rate-limit → long backoff).
- **Enrichment as durable data (E).** Confirm `SocialEnrichment` is truly
  derivable/local before excluding it from sync; some users may expect
  cross-device enrichment cache.
- **Change-log growth.** Even with a persisted cursor, a first-ever sync of
  a huge log still needs batching+throttle; consider enabling pruning.
- **Hub limit headroom.** 100 msg/sec is low for a legitimate large
  initial sync; consider a higher limit for authenticated owners, or a
  dedicated bulk `node-sync-batch` path exempt from the per-message
  counter (counted by bytes instead).

## Implementation Status

Shipped in the 0206 PR (A + C + throttle + D + E — the flood-stopping core
and the robustness fixes). Two items are deferred **by design**: the new
`node-sync-batch` wire type (+ hub support) — the client-side **throttle**
already keeps a backlog under the hub's limit without a protocol change and
a hub change carries more risk/deploy coupling; and excluding `SocialEnrichment`
from sync — with the persisted cursor enrichment changes sync once and aren't
re-replayed, so dropping cross-device enrichment is a separate product call.
Change-log pruning stays optional.

## Implementation Checklist

- [x] Add `getSyncCursor(room)` / `setSyncCursor(room, lamport)` to the
      store + `sqlite-adapter` (key `nodeSync:hwm:<room>` in `sync_state`,
      monotonic) + `memory-adapter`.
- [x] Load the cursor into `lastSyncedLamport` on connect; advance/persist it
      only from the hub's `highWaterMark` (an in-memory `pushedThrough`
      handles within-session dedup).
- [x] Reorder connect handling: `requestSync()` → await `node-sync-response`
      (4s timeout fallback) → `syncLocalChanges()` pushing only `> cursor`.
- [~] Throttle outbound node-changes (≤40 / 1000ms, deduped by hash).
      **Partial:** the token-bucket throttle ships; replacing per-change
      `publish` with a batched `node-sync-batch` message is **deferred**.
- [ ] Teach the hub to accept `node-sync-batch` (count by bytes).
      **Deferred** (no new wire type this PR; throttle suffices).
- [x] Special-case WebSocket close code 1008: long jittered backoff
      (`rateLimitBackoffMs`, default 15s + ≤50% jitter). (Cursor +
      request-first already remove the flood that would re-push.)
- [x] Handle inbound `node-error` on the client: log, don't re-flood.
- [ ] Mark `SocialEnrichment` local-only / batch enrichment writes.
      **Deferred** (persisted cursor means it syncs once, not re-replayed;
      excluding it is a separate product call).
- [x] Fix `deserializeChange` (client + hub) to fall back to top-level
      `schemaId`; `applyRemoteChanges` (+ the provider's single-change path)
      skip+warn on one bad change instead of throwing the batch.
- [ ] (Optional) Enable change-log pruning or compaction. **Deferred.**

## Validation Checklist

Unit-verified in CI (shipped with the PR):

- [x] Persisted cursor is loaded on connect and `requestSync` uses it; local
      changes are pushed only after the hub responds (`node-store-sync-provider.test.ts`).
- [x] The cursor is persisted from the hub's `highWaterMark`, monotonically
      (`node-store-sync-provider.test.ts`, `sqlite-adapter.test.ts`).
- [x] Outbound node-changes are capped per window and the remainder drains
      later (throttle test).
- [x] A 1008 close triggers the long backoff, not the short cadence; non-1008
      closes keep the normal backoff (`connection-manager.test.ts`).
- [x] `node-error` is logged and does not throw; a missing payload `schemaId`
      is restored from the top-level field on deserialize.
- [x] A single malformed change no longer aborts an `applyRemoteChanges`
      batch — the rest apply, a warning is logged (`store.test.ts`).

Live-runtime validation (requires a session against the hub):

- [ ] On reload with a populated local DB and the hub already in sync, the
      client publishes **zero** `node-change` messages (check the console).
- [ ] A genuine local backlog stays under the hub's per-second limit (no
      `error`/`1008`) while the throttle drains it.
- [ ] After a 1008 close, the client backs off ≥15 s and does not re-flood.
- [ ] Cursor persists across reloads (inspect `sync_state`).
- [ ] Steady-state connection stays `connected` (no oscillation) under a
      normal browsing/enrichment session.

## References

- `packages/runtime/src/sync/node-store-sync-provider.ts:47,96-111,149-174,232-272` — cursor, replay, serialize/deserialize
- `packages/data/src/store/sqlite-adapter.ts:570-580` — `getChangesSince` (`> ?`)
- `packages/sqlite/src/schema.ts:121-134,204-207` — `changes` + `sync_state`
- `packages/data/src/store/store.ts:1888,2286-2290` — `isRemote` tag, schemaId throw
- `packages/hub/src/middleware/rate-limit.ts:12-17,53-88` — 100 msg/1000 ms, 3-strike close
- `packages/hub/src/server.ts:1141-1148,1283-1326,1413-1490` — 1008 close, `node-error`
- `packages/hub/src/services/node-relay.ts:100,119-135,137-153` — hash dedupe, sync response, deserialize
- `packages/runtime/src/sync/connection-manager.ts:316-323,340-353` — onclose, backoff
- `apps/web/src/hooks/useSocialFeedEnrichment.ts:111-120,165-172` + `social-feed-enrichment.ts:296-358` — enrichment volume
- `packages/history/src/pruning.ts` — opt-in change-log pruning
- [WebSocket.org — Error Handling: Close Codes & Recovery](https://websocket.org/guides/error-handling/)
- [WebSocket.org — Close Codes Reference (1008)](https://websocket.org/reference/close-codes/)
- [OneUptime — How to Handle WebSocket Rate Limiting](https://oneuptime.com/blog/post/2026-01-24-websocket-rate-limiting/view)
- [Vertext Labs — WebSocket Backpressure & Flow Control](https://vertextlabs.com/websocket-backpressure-flow-control-real-time-chat-streams/)
- [LatteStream — WebSocket Best Practices](https://lattestream.com/blog/websocket-best-practices)
- Related: `docs/explorations/0204_[x]_FAST_LOCAL_FIRST_COLD_START_AND_CACHE_HYDRATION.md` (OPFS fix that exposed this), exploration 0188 (local-first connection behavior)
