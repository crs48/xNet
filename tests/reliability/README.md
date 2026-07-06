# Reliability lane

Durability, fault-injection, and scale tests for the sync engine
(exploration 0272). Everything here answers one question: **does data
survive?** — crashes, kills, reorders, partitions, restores, and scale — as
opposed to the feature suites, which ask whether things work.

## Running

```bash
pnpm exec vitest run --project reliability          # PR tier, ~10s
XNET_SIM_SEEDS=25 XNET_CRASH_ITERATIONS=25 \
  pnpm exec vitest run --project reliability        # deeper, still local-friendly
```

The nightly [`soak.yml`](../../.github/workflows/soak.yml) workflow runs the
deep tiers (plus the browser OPFS durability spec) and files an alarm issue
on failure.

## Structure

| Directory          | What it proves                                                                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sim/`             | Deterministic sync simulation (DST-lite): seeded virtual network (drop/duplicate/reorder/partition) over real `NodeStore`s and a hash-verifying relay, with client crash-restart. Invariants: replica convergence, LWW double-apply idempotency, cursor monotonicity, relay dedup, same-seed determinism. |
| `crash/`           | SIGKILL crash harness: a child process writes transactional batches with production pragmas (WAL, `synchronous = NORMAL`) and is killed mid-stream; reopen must show `integrity_check` = ok, an exact transactional prefix, and replay convergence.                                                       |
| `fault-injection/` | A Proxy adapter throws synthetic I/O errors mid-`applyNodeBatch`: rollback atomicity, the DB stays usable, re-apply converges (including the electron chunk-boundary prefix shape).                                                                                                                       |
| `restore/`         | Drives `scripts/reliability/restore-drill.mjs`: backup → restore → physical (`integrity_check`) **and** logical (row counts, high-water mark, per-node head hashes) verification; must fail on a corrupted copy.                                                                                          |
| `scale/`           | Seeds N nodes / M change-log rows (the 0249→0260 cold-open shape) and asserts hot-read costs as **adapter round-trip budgets** (the 0271 currency) — wall-clock ceilings only bite under `XNET_SOAK=1`.                                                                                                   |
| `hub/`             | Real in-process hub under a reconnect-storm load: M WebSocket clients × K signed changes, all of which must land exactly once.                                                                                                                                                                            |
| `support/`         | Seeded PRNG (`SimRng`, mulberry32), env knobs, the fault-injecting adapter wrapper.                                                                                                                                                                                                                       |

Related, outside this directory:

- `tests/e2e/src/durability.spec.ts` — reload mid write-burst against real
  OPFS (soak lane).
- `packages/data/src/store/convergence.test.ts` — the original seeded-shuffle
  LWW convergence tests this lane generalises.
- `conformance/` — golden protocol vectors (byte-level, cross-language).

## Seeds and replay

Every random decision flows through a `SimRng` created from an integer seed,
and failures print that seed:

```
[sim seed=12648430 ops=160] invariant violated — replay with XNET_SIM_OPS=160 and this seed
```

To replay, temporarily pin the seed list in the relevant test (for the
simulation: the `SEEDS` array in `sim/simulation.test.ts`) and re-run. Two
runs of the same seed produce the same event trace — the determinism test
enforces this, and `SimResult.relayLog` carries the full accepted change log
for post-mortems. Wall-clock time is pinned during simulation
(`vi.useFakeTimers` faking only `Date`) so LWW wallTime tiebreaks cannot
mask ordering bugs; identities derive from the seed for the same reason.

## Depth knobs

| Env                     | Default (PR) | Soak    | Meaning                                 |
| ----------------------- | ------------ | ------- | --------------------------------------- |
| `XNET_SIM_SEEDS`        | 4            | 25      | Simulation runs per suite               |
| `XNET_SIM_OPS`          | 160          | 400     | Scheduler steps per run                 |
| `XNET_CRASH_ITERATIONS` | 3            | 25      | SIGKILL iterations                      |
| `XNET_CRASH_BATCHES`    | 4000         | 4000    | Writer batches per iteration            |
| `XNET_SCALE_NODES`      | 5 000        | 100 000 | Seeded nodes                            |
| `XNET_SCALE_CHANGES`    | 20 000       | 318 000 | Seeded change-log rows                  |
| `XNET_HUB_CLIENTS`      | 8            | 24      | Concurrent load clients                 |
| `XNET_HUB_CHANGES`      | 25           | 50      | Changes per client                      |
| `XNET_SOAK`             | unset        | `1`     | Arms the (generous) wall-clock ceilings |

## Track record

Building the simulation surfaced two shipped durability defects before the
lane itself ever merged — the reload-resync `INVALID_HASH` strand (lossy
change-log round-trip) and arrival-order divergence on same-Lamport
concurrent edits (lamport-only SQL guards). Both are fixed and regression-
pinned in `packages/data/src/store/sqlite-adapter.test.ts` ("change-record
envelope (0272)") and by the simulation's convergence invariant. Details in
the 0272 exploration doc under `docs/explorations/`.
