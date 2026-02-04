# 09 - Test Coverage

## Overview

The hub has 18 test files with a combined ~2,200 lines. **All 18 fail due to missing dependency installation.** Additionally, 1 pre-existing test (`UCAN proofs`) regressed due to the hardening commit, and 1 flaky performance test (BLAKE3 timing) fails intermittently.

---

## Root Cause: All Hub Tests Fail

### Error Chain

```
pnpm test
  → vitest discovers packages/hub/test/*.ts via root config
    → Vite tries to resolve imports
      → "Failed to load url ws" / "@hono/node-server" / "better-sqlite3" / "yjs" / "@xnet/crypto"
```

### Why Imports Fail

1. **Dependencies not installed.** The `packages/hub/` directory has no `node_modules`. Either `pnpm install` was never run after adding the hub package, or the workspace linking failed.

2. **No hub-specific vitest config.** The hub has Node.js-native dependencies (`ws`, `better-sqlite3`) that Vite's module transformer cannot bundle. These need to be marked as externals.

### Fix (Two Steps)

```bash
# Step 1: Install all dependencies
pnpm install

# Step 2: Create packages/hub/vitest.config.ts
```

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    server: {
      deps: {
        external: ['better-sqlite3', 'ws', '@hono/node-server']
      }
    }
  }
})
```

---

## Port Conflicts

Two port pairs are shared between test files, which will cause EADDRINUSE failures when running in parallel:

| Port  | File A                    | File B               |
| ----- | ------------------------- | -------------------- |
| 14451 | `health-metadata.test.ts` | `node-relay.test.ts` |
| 14452 | `files.test.ts`           | `railway.test.ts`    |

**Fix:** Assign unique ports to each test file. Recommended: use port `14460 + index` or dynamic port allocation with `:0`.

---

## Per-File Quality Assessment

### Excellent Quality

| File                 | Lines | Tests                           | Assessment                                   |
| -------------------- | ----- | ------------------------------- | -------------------------------------------- |
| `storage.test.ts`    | 203   | Parameterized (SQLite + Memory) | Best test file. `describe.each` pattern.     |
| `crawl.test.ts`      | 309   | 7                               | Good fake timers, complex setup helper.      |
| `federation.test.ts` | 271   | Multi-hub                       | Tests Ed25519 signing. Most complex.         |
| `schemas.test.ts`    | 155   | 8                               | Covers validation, auth, version conflicts.  |
| `shards.test.ts`     | 138   | 4                               | Tests replica fallback with `vi.stubGlobal`. |

### Good Quality

| File                 | Lines | Assessment                              |
| -------------------- | ----- | --------------------------------------- |
| `awareness.test.ts`  | 155   | Good but timing-dependent (`wait(ms)`). |
| `discovery.test.ts`  | 100   | Full lifecycle coverage.                |
| `node-relay.test.ts` | 148   | Tests hash-based dedup.                 |
| `query.test.ts`      | 204   | Covers search, filter, pagination.      |
| `auth.test.ts`       | 58    | 3 paths (reject/accept/anon).           |
| `backup.test.ts`     | 73    | CRUD + 404 test.                        |
| `deploy.test.ts`     | 103   | Health, metrics, rate limiting.         |
| `relay.test.ts`      | 83    | Core Yjs relay roundtrip.               |

### Minimal Quality

| File                      | Lines | Assessment                    |
| ------------------------- | ----- | ----------------------------- |
| `config.test.ts`          | 42    | Unit test, clean but thin.    |
| `files.test.ts`           | 52    | Happy path only.              |
| `health-metadata.test.ts` | 34    | Single test.                  |
| `railway.test.ts`         | 29    | Single test (startup only).   |
| `node-pool.test.ts`       | 54    | 3 tests, missing concurrency. |

### Schema Registry Test

| File               | Lines | Assessment                                     |
| ------------------ | ----- | ---------------------------------------------- |
| `registry.test.ts` | 30    | Single test for remote resolver caching. Thin. |

---

## Coverage Gaps

### Completely Untested Modules

| Module                          | Risk   | Recommendation                                                     |
| ------------------------------- | ------ | ------------------------------------------------------------------ |
| `services/signaling.ts`         | Medium | Tested indirectly but no dedicated tests                           |
| `middleware/rate-limit.ts`      | High   | Only indirectly tested; violation logic needs unit tests           |
| `middleware/metrics.ts`         | Low    | Simple accumulator; indirect testing acceptable                    |
| `auth/capabilities.ts`          | Medium | `hasHubCapability` auth logic untested                             |
| `lifecycle/shutdown.ts`         | Medium | Graceful shutdown behavior untested                                |
| `services/federation-health.ts` | Medium | Health check timing untested                                       |
| `services/shard-rebalancer.ts`  | High   | Consistent hashing untested                                        |
| `services/shard-utils.ts`       | Medium | Tokenization logic untested                                        |
| `services/crawl-robots.ts`      | High   | **robots.txt parsing has a critical bug** (see 03-hub-services.md) |
| `client/query-client.ts`        | Medium | WebSocket client untested                                          |
| `client/crawler-client.ts`      | Medium | REST client untested                                               |
| All `routes/*.ts`               | Medium | Only tested indirectly via integration                             |
| `cli.ts`                        | Low    | CLI arg parsing untested                                           |

### Cross-Cutting Gaps

| Category       | What's Missing                                            |
| -------------- | --------------------------------------------------------- |
| Error handling | No tests for storage failures mid-operation               |
| Concurrency    | No tests for concurrent access to same doc/resource       |
| Reconnection   | No WebSocket reconnection/recovery tests                  |
| Security       | No injection, DoS, or malformed input tests               |
| Performance    | No load/throughput tests                                  |
| Shutdown       | No graceful shutdown tests                                |
| Edge cases     | No empty store, corrupt data, or boundary condition tests |

---

## Style Assessment

### Strengths

- All files use `describe`/`it`/`expect` pattern
- `beforeAll`/`afterAll` used consistently for integration lifecycle
- Type-only imports used correctly
- Named exports only
- Good test naming

### Deviations from AGENTS.md

| Convention                           | Adherence                                                  |
| ------------------------------------ | ---------------------------------------------------------- |
| File-level JSDoc headers             | Missing on ALL test files                                  |
| Section dividers (`// ─── ...`)      | Missing                                                    |
| `any` type usage                     | Several instances without justification                    |
| Timing-based assertions (`wait(ms)`) | Fragile; should use event-based assertions                 |
| Shared test helpers                  | Duplicated across files (`sendAndWait`, `connect`, `wait`) |

---

## Checklist

### Immediate

- [ ] Run `pnpm install` to install hub dependencies
- [ ] Add `vitest.config.ts` to `packages/hub/`
- [ ] Fix port conflicts (14451, 14452)
- [ ] Fix UCAN proof test (use real token)

### Priority Test Additions

- [ ] Unit tests for `crawl-robots.ts` (robots.txt parsing, `Disallow: /`)
- [ ] Unit tests for `rate-limit.ts` (violation accumulation, window reset)
- [ ] Unit tests for `capabilities.ts` (`hasHubCapability`, prefix matching)
- [ ] Unit tests for `shard-rebalancer.ts` (consistent hashing, rebalance)
- [ ] Unit tests for `shard-utils.ts` (tokenization, stop words)
- [ ] Concurrency test for `node-pool.ts` (concurrent `get()`)
- [ ] Error handling test for pool persistence failure

### Test Infrastructure

- [ ] Extract shared test helpers (`connect`, `wait`, `sendAndWait`) to `test/helpers.ts`
- [ ] Add file-level JSDoc to all test files
- [ ] Replace timing-based waits with event-based assertions where possible
- [ ] Consider dynamic port allocation to prevent conflicts entirely
