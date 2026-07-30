# Demo Hub Runaway Storage: Quota And Eviction Are Not Enforced

## Problem Statement

The `hub.xnet.fyi` demo server (Railway, 500 MB disk) is supposed to keep
itself small with two guardrails:

1. a **10 MB per-user storage cap**, and
2. a **daily clear-out** of all demo data.

Neither is happening. A single active user has accumulated **>1 GB**, which
overruns the 500 MB Railway volume — and (see exploration 0290) a full volume
is the most likely reason the hub is now returning `502 "Application failed to
respond"`, which surfaces in the app as _"Failed to fetch"_ when generating a
share link. This exploration traces why both guardrails are inert and how to
fix them.

## Executive Summary

Two independent failures, both verified against the code and the running
deployment:

- **The 10 MB demo quota is advisory-only.** `demoOverrides.quota` (10 MB) is
  computed and sent to clients in the WebSocket handshake as a _hint_, but the
  server-side enforcers (Backup/File services) are wired to `defaultQuota`
  (**1 GB**), and the **primary growth path — the append-only `node_changes`
  CRDT log — has no per-user quota check at all.** So sync data grows without
  limit.
- **Daily eviction is dead code.** `EvictionService` exists, is exported, and
  is unit-tested against a **mock** store — but it is **never instantiated or
  started** in the hub, **no real storage backend implements
  `EvictionStorage`**, and `.touch()` is never called. It has never run. And
  even its design (evict users _inactive >24 h_) would never clear an
  **active** daily user, so it isn't a "daily clear" in the first place.
- **The Railway volume is persistent** (`RAILWAY_VOLUME_MOUNT_PATH`), so data
  also never clears on restart or redeploy.

Net: `--demo` is on, but demo mode enforces nothing. One active user fills the
disk; the hub eventually crashes on a full volume.

```mermaid
flowchart LR
    U[Active user syncs nodes/docs] -->|node-relay| A[appendNodeChange]
    A -->|INSERT OR IGNORE, no quota| T[(node_changes<br/>append-only log)]
    A -.->|no .touch(did)| X[last_active table<br/>❌ does not exist]
    T --> G[Unbounded growth &gt;1 GB]
    G --> F[500 MB Railway volume FULL]
    F --> C[SQLite write / boot failure]
    C --> E[Hub crash → Railway 502]
    subgraph guardrails that should stop this
      Q[10 MB per-user quota]:::dead
      V[Daily eviction sweep]:::dead
    end
    Q -. advisory only / wired to 1 GB .-> A
    V -. never instantiated, no storage .-> T
    classDef dead fill:#fdd,stroke:#c00;
```

## Current State In The Repository

### Demo mode is genuinely enabled

- Railway start command passes `--demo`
  (`railway.toml` → `startCommand`), so `config.demo === true`.
- `--demo` parsed at `packages/hub/src/cli.ts:77,107`; `demoOverrides`
  resolved at `packages/hub/src/config.ts:139-140` via `getDemoOverrides`
  (`config.ts:84-95`).
- Demo values (`packages/hub/src/types.ts:119-138`):

  ```ts
  export const DEMO_DEFAULTS: DemoOverrides = {
    quota: 10 * 1024 * 1024,          // 10 MB per-user
    maxDocs: 50,
    maxBlob: 2 * 1024 * 1024,         // 2 MB
    evictionTtl: 24 * 60 * 60 * 1000, // 24 h inactivity
    evictionInterval: 60 * 60 * 1000  // hourly sweep
  }
  ```

So the config is correct. Nothing consumes it as an enforcer.

### Failure A — the 10 MB quota never reaches an enforcer

- **Backup/File services are wired to `defaultQuota` (1 GB), not the demo
  quota** (`packages/hub/src/server.ts:170-178`):

  ```ts
  const backup = new BackupService(storage, {
    maxQuotaBytes: config.defaultQuota,  // 1 GB — should be demoOverrides.quota
    maxBlobSize: config.maxBlobSize      // 50 MB — should be demoOverrides.maxBlob
  })
  const files = new FileService(storage, { maxStoragePerUser: config.defaultQuota })
  ```

  The enforcement _logic_ is fine (`services/backup.ts:34-46` →
  `QUOTA_EXCEEDED`/`BLOB_TOO_LARGE`; `services/files.ts:56-57`) — it's just
  checking against 1 GB.

- **The append-only `node_changes` log has no quota check at all.** The
  ingestion path `packages/hub/src/services/node-relay.ts:129-145` validates
  hash/DID/signature/mentions and then calls `storage.appendNodeChange(...)`
  unconditionally. `author_did` is stored on every row
  (`storage/sqlite.ts:320`) but never summed or capped. `appendNodeChange`
  (`sqlite.ts:1141-1148,2089`) is `INSERT OR IGNORE` with no size/count gate.
  This is the >1 GB grower. The only deletion path is `clearNodeChanges(room)`
  (`sqlite.ts:1163-1165`), reachable only via an explicit `node-clear` request
  (`node-relay.ts:154-160`) — never automatic.

- **`demoOverrides.quota` is used in exactly two informational places:** the
  WS handshake `demoLimits.quotaBytes` sent to clients (`server.ts:797-803`,
  advisory — the client is trusted to self-limit) and a startup `console.log`
  (`cli.ts:130`).

- Other unbounded per-user stores with no quota gate: `doc_state` (Yjs blobs,
  `sqlite.ts:51,843`, persisted from `pool/node-pool.ts:97-109`), `doc_meta`,
  etc. Only `backups`/`file_meta` have quota logic (set to 1 GB).

### Failure B — eviction is unwired dead code

`EvictionService` (`packages/hub/src/services/eviction.ts`) is fully written —
`start()` does an immediate sweep + `setInterval` (`:34-46`), `evict()`
deletes inactive users (`:62-84`), `touch()` records activity (`:57-59`). But:

- **Never instantiated in production.** `grep "new EvictionService"` across
  `packages/hub/src` → zero hits (only `test/eviction.test.ts`). The lifecycle
  start block (`server.ts:671-689`) starts telemetry/awareness/discovery/
  federation/crawl — **not** eviction. `.touch()` is never called on any
  request path, so `last_active` is never recorded.
- **No storage backend implements `EvictionStorage`.** The interface needs
  `upsertActivity`/`getInactiveDids`/`deleteUserData`/`deleteActivity`
  (`eviction.ts:12-21`); none of these (nor a `last_active`/`user_activity`
  table) exist in `storage/sqlite.ts`, `storage/memory.ts`, or
  `storage/interface.ts`. So the service cannot function even if started.
- **Wrong semantics for "daily clear."** `evict()` deletes DIDs with
  `last_active < now - evictionTtl` (24 h). An **active** user (the one user,
  using it daily) is never idle for 24 h → never evicted. Inactivity eviction
  is not the same as a daily wipe.
- **Green tests hide it.** `test/eviction.test.ts` tests the service against a
  **mock** `EvictionStorage` (`:10-38`) and asserts `DEMO_DEFAULTS`
  (`:190-198`). Nothing asserts wiring into the server or a real storage impl.
  Classic "unit-tested in isolation, never integrated."

### The volume is persistent (restart won't help)

`config.ts:107-111` resolves `dataDir = RAILWAY_VOLUME_MOUNT_PATH ??
HUB_DATA_DIR ?? cliOptions.dataDir`. Railway mounts a **persistent** volume,
so `--data /data` is overridden and data survives restarts/redeploys. Even a
hypothetical "clear on boot" would not empty the volume. The Railway
`startCommand` also bypasses the Litestream `CMD` entrypoint (which itself
builds the command _without_ `--demo`, a separate latent inconsistency in
`packages/hub/litestream-entrypoint.sh:13`).

### Likely link to the 502 outage (0290)

`/health`'s `usedBytes` (`server.ts:383`, `data-usage.ts:34-63`) is a
`stat`-sum for display and drives no enforcement. With >1 GB of `node_changes`
against a 500 MB volume, SQLite writes fail with `SQLITE_FULL`; a
schema/migration write or WAL checkpoint on boot then throws, the process
crashes, the Railway healthcheck fails, and the edge serves `502`. That is the
most probable root of exploration 0290's outage — the runaway data and the
"Failed to fetch" are one incident.

## External Research

- **Multi-tenant quota patterns.** Durable per-tenant caps are enforced at the
  _write path_ with a running byte counter (a `usage(did) += len` row updated
  in the same transaction as the insert), not recomputed by scanning — e.g.
  how object stores and Postgres-RLS SaaS backends bound tenants. xNet already
  does this shape for backups/files; the `node_changes` path simply skips it.
- **Ephemeral demo environments.** The common pattern for public demo backends
  (e.g. "playground" deployments) is a **scheduled full reset** (truncate all
  tenant data on a cron / TTL) rather than per-user inactivity eviction, which
  is exactly the "clear out all data every day" the operator expects. Railway
  supports scheduled restarts/cron services; a persistent volume must be
  actively truncated, not merely remounted.
- **Disk-full crash loops.** A full SQLite volume is a classic
  crash-on-startup: `SQLITE_FULL` during migration/WAL checkpoint aborts boot,
  the platform healthcheck fails, and you get a fallback 502 with no app-level
  headers — see 0290. A disk-usage watchdog that sheds writes before the
  volume fills prevents the hard-down.

## Key Findings

1. `--demo` is on, but demo mode enforces **nothing** on the data path.
2. The 10 MB cap is a **client-trusted hint**; the server caps only
   backups/files, and at **1 GB**.
3. The `node_changes` append log is the **unbounded grower** and has no
   per-DID accounting.
4. `EvictionService` is **dead code**: unwired, no storage impl, never
   touched; and its inactivity semantics wouldn't clear an active user anyway.
5. The Railway volume is **persistent**, so nothing clears on restart.
6. This runaway is the **likely cause of the 502** in 0290.

## Options And Tradeoffs

### Bounding per-user size (the real 10 MB cap)

| Option | What | Tradeoff |
| --- | --- | --- |
| **A. Enforce a per-DID byte budget on the write path** (recommended) | Maintain a `usage_by_did` counter updated in the same tx as `appendNodeChange`/`doc_state`; reject writes over `demoOverrides.quota`. | Real cap on the actual grower; needs a counter + reject signal back through node-relay (the client must handle rejection gracefully). |
| **B. Point Backup/File quota at the demo override** | In demo mode, pass `demoOverrides.quota`/`maxBlob` to Backup/File services. | Necessary but insufficient — doesn't touch `node_changes`, the main leak. Do it alongside A. |
| **C. Cap by row count / maxDocs** | Enforce `demoOverrides.maxDocs` (50) at the relay. | Coarse; a few huge docs still blow the byte budget. |

### Clearing demo data ("daily")

| Option | What | Tradeoff |
| --- | --- | --- |
| **A. Scheduled full reset every 24 h** (recommended for a demo) | A timer that truncates all demo tables (`node_changes`, `doc_state`, `doc_meta`, `backups`, `file_meta`, grants, share links) + `VACUUM`, gated on `config.demo`. Matches the operator's stated intent. | Wipes everyone (fine for a demo); must run in-process against the persistent volume, not rely on restart. |
| **B. Wire up the existing inactivity `EvictionService`** | Implement `EvictionStorage` in sqlite/memory, instantiate + `start()` in the lifecycle when demo, call `.touch(did)` on authenticated messages. | Reuses existing code, but **won't bound an active user** — only useful combined with the per-user quota (A above). |
| **C. Both** | Per-user quota bounds live size; daily reset caps long-term accumulation. | Most robust; a bit more code + tests. |

### Safety net

| Option | What | Tradeoff |
| --- | --- | --- |
| **Disk-usage watchdog** (recommended) | Before each write (or on a short interval), check volume usage; when >~85%, reject non-critical writes with a clear error instead of crashing. | Prevents the hard-down / 502 even if a future bug slips the quota. |

## Recommendation

1. **Immediate (unblock the disk + the 502):** stop the demo hub, **truncate
   the demo data on the Railway volume** (delete `hub.db*` or `DELETE FROM
   node_changes; VACUUM;` — demo data is disposable), redeploy, and confirm
   `curl https://hub.xnet.fyi/health` → `200` and disk usage drops. This
   should also clear 0290's outage if it's disk-full-induced.
2. **Enforce the real per-user cap (Option A + B):** add a per-DID byte counter
   checked in `appendNodeChange`/`doc_state`, reject over `demoOverrides.quota`,
   and route Backup/File quota to the demo override in demo mode.
3. **Implement a daily full reset (Clearing Option A):** a `config.demo`-gated
   scheduled truncate-all + VACUUM, running in-process (persistent volume).
   Prefer this over the inactivity `EvictionService` for the "clear daily"
   requirement; wire eviction too only if inactivity cleanup is also wanted.
4. **Add a disk-usage watchdog** so a full volume sheds writes instead of
   crashing.
5. **Close the test gap:** integration tests that (a) demo mode rejects writes
   past 10 MB/DID on the `node_changes` path, (b) the daily reset empties all
   demo tables, (c) a real storage backend satisfies whatever eviction/reset
   interface ships.

## Example Code

Route quota to the demo override in demo mode (`packages/hub/src/server.ts:170`):

```ts
const perUserQuota = config.demo && config.demoOverrides
  ? config.demoOverrides.quota            // 10 MB
  : config.defaultQuota                   // 1 GB
const maxBlob = config.demo && config.demoOverrides
  ? config.demoOverrides.maxBlob          // 2 MB
  : config.maxBlobSize
const backup = new BackupService(storage, { maxQuotaBytes: perUserQuota, maxBlobSize: maxBlob })
const files = new FileService(storage, { maxStoragePerUser: perUserQuota })
```

Per-DID byte budget on the change-log write path
(`packages/hub/src/services/node-relay.ts:140`):

```ts
if (this.perUserQuota) {
  const used = await this.storage.getUsageByDid(authorDid)          // new
  const incoming = byteLengthOf(change)
  if (used + incoming > this.perUserQuota) {
    return this.reject(peerId, 'quota-exceeded')                    // client shows a cap notice
  }
}
await this.storage.appendNodeChange(room, change)
await this.storage.addUsageByDid(authorDid, byteLengthOf(change))   // same-tx counter
```

Daily reset (demo-gated), started in the lifecycle:

```ts
if (config.demo) {
  const resetMs = 24 * 60 * 60 * 1000
  setInterval(() => {
    storage.truncateAllDemoData()   // node_changes, doc_state, doc_meta, backups, file_meta, grants, share_links + VACUUM
      .catch((e) => console.error('[demo-reset] failed', e))
  }, resetMs)
}
```

## Risks And Open Questions

- **Rejecting a sync write mid-session:** the client must handle a
  `quota-exceeded` relay rejection without data loss or a crash loop — it
  should stop pushing and surface "demo storage full," keeping local data
  intact. Needs a client-side path (ties into the handshake `demoLimits`).
- **Byte accounting accuracy:** counting `payload_json + signature` bytes vs.
  on-disk page size will differ; the cap should target logical bytes with
  headroom below the 500 MB physical volume.
- **VACUUM cost / Litestream:** on a demo hub, `VACUUM` after a daily
  truncate is fine, but note the 0258 finding that Litestream VACUUM
  invalidates lineage — the Railway path bypasses Litestream, so it's moot
  here, but don't enable both without revisiting.
- **What counts as "a user" on a shared demo?** Quotas are per-DID; a single
  human with multiple identities could still accumulate. Acceptable for a
  demo, worth noting.
- **`private: true`** — `packages/hub` is private, so no changeset is required
  for these fixes (per CLAUDE.md); still needs a Changelog fragment if the
  repo's changelog check applies.

## Implementation Checklist

- [ ] **Immediate:** truncate demo data on the Railway volume; redeploy; confirm `/health` 200 and disk drops (also clears the 0290 502 if disk-full-induced).
- [x] Route Backup/File quota to `demoOverrides.quota`/`maxBlob` when `config.demo` (`server.ts:170-178`).
- [x] Add per-DID usage accounting to storage (`getUsageByDid`/`addUsageByDid` + a `usage_by_did` row/table) in `storage/sqlite.ts` and `storage/memory.ts`.
- [x] Enforce `demoOverrides.quota` on the `appendNodeChange` / `doc_state` write paths (`node-relay.ts`, `pool/node-pool.ts`); reject over budget.
- [x] Implement a `config.demo`-gated **daily truncate-all + VACUUM** started in the lifecycle (`server.ts`), operating on the persistent volume.
- [ ] (Optional) Implement `EvictionStorage` in sqlite/memory, instantiate + `start()` `EvictionService`, and call `.touch(did)` on authenticated messages — only if inactivity cleanup is also desired.
- [x] Add a disk-usage watchdog that sheds writes near capacity instead of crashing.
- [x] Handle a `quota-exceeded` relay rejection gracefully on the client (surface "demo storage full", keep local data).
- [x] Reconcile `litestream-entrypoint.sh:13` (missing `--demo`) with the Railway `startCommand` so all launch paths agree.
- [x] Tests: demo write over 10 MB/DID is rejected; daily reset empties all demo tables; real storage satisfies the reset/eviction interface.

## Validation Checklist

- [x] With `--demo`, a single DID syncing >10 MB is **rejected** at the relay; `node_changes` for that DID stays under budget.
- [ ] `hub.xnet.fyi` disk usage stays well under 500 MB across a day of use.
- [x] The daily reset empties `node_changes`/`doc_state`/backups/files and the volume shrinks (VACUUM), verified by `/health` `usedBytes`.
- [x] Backup/File uploads over 2 MB (demo `maxBlob`) return `413`/`BLOB_TOO_LARGE` in demo mode.
- [x] Killing available disk (simulated full volume) makes the hub **shed writes with a clear error**, not crash into a 502.
- [ ] `curl https://hub.xnet.fyi/health` returns 200 continuously (no crash loop) under sustained single-user load.

## References

- `railway.toml` — demo start command (`--demo --data /data`), healthcheck.
- `packages/hub/Dockerfile`, `packages/hub/litestream-entrypoint.sh` — image + entrypoint (Railway overrides `CMD`).
- `packages/hub/src/config.ts:82-140` — demo override resolution + `RAILWAY_VOLUME_MOUNT_PATH` data dir.
- `packages/hub/src/types.ts:97-138` — `DEFAULT_CONFIG` (1 GB) + `DEMO_DEFAULTS` (10 MB / 24 h).
- `packages/hub/src/server.ts:170-178,671-689,797-803` — quota wiring, lifecycle start (no eviction), handshake `demoLimits`.
- `packages/hub/src/services/node-relay.ts:129-160` — change ingestion (no quota) + `node-clear`.
- `packages/hub/src/storage/sqlite.ts:311-336,1141-1165,2089` — `node_changes` schema + `appendNodeChange`/`clearNodeChanges`.
- `packages/hub/src/services/eviction.ts`, `packages/hub/test/eviction.test.ts` — the dead service + its mock-only test.
- `packages/hub/src/services/backup.ts`, `services/files.ts` — the only real quota enforcers (set to 1 GB).
- Related explorations: 0290 (share-link failure / the 502 outage), 0258 (Cloud HA — Litestream/VACUUM lineage), and the cold-open-stall note (318k-row `changes` log).
