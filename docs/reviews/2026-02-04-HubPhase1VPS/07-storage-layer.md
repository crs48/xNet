# 07 - Storage Layer

## Overview

The hub storage layer consists of a 50+ method interface (`interface.ts`), a memory implementation (`memory.ts`), a SQLite implementation (`sqlite.ts`), and a factory (`index.ts`). The SQLite implementation at 1,570 lines is the largest single file in the hub.

---

## Interface (interface.ts -- 327 lines)

The `HubStorage` interface defines 27 types and 50+ methods covering:

| Domain       | Methods                                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Doc state    | `getDocState`, `setDocState`, `deleteDocState`                                                                                                              |
| Doc meta     | `getDocMeta`, `upsertDocMeta`, `deleteDocMeta`, `listDocMeta`, `search`                                                                                     |
| Blobs        | `putBlob`, `getBlob`, `deleteBlob`, `listBlobs`                                                                                                             |
| Files        | `putFile`, `getFile`, `deleteFile`, `listFiles`, `getFileData`, `putFileData`                                                                               |
| Awareness    | `getAwareness`, `putAwareness`, `deleteAwareness`, `listAwareness`                                                                                          |
| Peers        | `registerPeer`, `getPeer`, `listPeers`, `deletePeer`                                                                                                        |
| Federation   | `putFederationPeer`, `getFederationPeers`, `logFederationQuery`                                                                                             |
| Shards       | `putShardAssignment`, `getShardAssignment`, `listShardAssignments`, `putShardPostings`, `listShardPostings`, `getShardTermStats`, `recomputeShardTermStats` |
| Crawl        | `upsertCrawlQueue`, `popCrawlQueue`, `getCrawlStats`, `getCrawlDomainCooldowns`, `putCrawlDomainCooldowns`                                                  |
| Schemas      | `putSchema`, `getSchema`, `listSchemas`, `searchSchemas`                                                                                                    |
| Node changes | `putNodeChange`, `getNodeChangesSince`                                                                                                                      |
| Search       | `updateSearchBody` (optional)                                                                                                                               |

**Issue:** `updateSearchBody` is marked optional (`?`) but both implementations provide it. The optionality forces callers to use duck-typing checks.

---

## SQLite Implementation (sqlite.ts -- 1,570 lines)

### Strengths

- All prepared statements created upfront in `initStatements()` -- efficient
- FTS5 used for both document search and schema search
- WAL mode enabled for concurrent read/write
- Blobs and files stored on filesystem (not in SQLite) -- correct for large binaries
- Proper use of transactions for multi-step operations

### Bugs

| #   | Line                | Issue                                                                      | Severity |
| --- | ------------------- | -------------------------------------------------------------------------- | -------- |
| 1   | 762, 822            | **Path traversal** -- blob/file keys used directly in `join()`             | Critical |
| 2   | 731-735             | `getNodeChangesSince` has hardcoded `LIMIT 1000` -- silent truncation      | Major    |
| 3   | 1176, 1198, 1216    | Dynamic `db.prepare()` per call -- statement handle leak                   | Major    |
| 4   | 957, 875, 989, 1400 | `JSON.parse()` without try-catch -- crashes on corrupt data                | Major    |
| 5   | 272-291             | FTS5 content-sync triggers don't include body text -- rebuild loses bodies | Medium   |

### Dynamic Statement Leak Detail

```typescript
// sqlite.ts:1176 -- NEW prepared statement created on EVERY call
const stmt = db.prepare(`
  SELECT * FROM shard_postings
  WHERE shard_id = ? AND term IN (${placeholders})
`)
```

`better-sqlite3` doesn't automatically finalize unused statements. Each call creates a new statement object that persists until GC collects it. Under load, this causes memory growth proportional to call frequency.

**Fix:** Use a statement cache keyed by the number of placeholders:

```typescript
private shardQueryStmts = new Map<number, Statement>()
getShardQueryStmt(termCount: number) {
  if (!this.shardQueryStmts.has(termCount)) {
    const placeholders = Array(termCount).fill('?').join(', ')
    this.shardQueryStmts.set(termCount, db.prepare(`...IN (${placeholders})`))
  }
  return this.shardQueryStmts.get(termCount)!
}
```

### Missing JSON.parse Error Handling

Four row-mapping functions use `JSON.parse()` without try-catch:

| Function              | Line | Field             |
| --------------------- | ---- | ----------------- |
| `rowToAwarenessEntry` | 957  | `state_json`      |
| `rowToSchemaRecord`   | 875  | `definition_json` |
| `rowToPeerRecord`     | 989  | `endpoints_json`  |
| `getDocMeta`          | 1400 | `properties_json` |

If any of these fields contain corrupt JSON (e.g., from a partial write), the entire storage operation crashes with an unhandled error.

---

## Memory Implementation (memory.ts -- 590 lines)

### Behavioral Differences from SQLite

| Behavior              | Memory                          | SQLite                       | Impact                           |
| --------------------- | ------------------------------- | ---------------------------- | -------------------------------- |
| Search                | `String.includes()` (substring) | FTS5 `MATCH` (boolean query) | Different results for same query |
| `getNodeChangesSince` | No limit                        | `LIMIT 1000`                 | Silent truncation in SQLite      |
| `federationLogs`      | Unbounded array                 | Unbounded table              | Memory leak in memory impl       |
| Shard queries         | O(n) full scan                  | SQL with indexes             | Much slower in memory            |

---

## Factory (index.ts -- 48 lines)

Clean factory pattern. No issues.

---

## Checklist

- [ ] Sanitize blob/file keys against path traversal (resolve + startsWith check)
- [ ] Remove or paginate `LIMIT 1000` in `getNodeChangesSince`
- [ ] Cache dynamic prepared statements by placeholder count
- [ ] Add try-catch to all `JSON.parse()` calls in row mappers
- [ ] Store body text in `doc_meta` table for FTS5 rebuild safety
- [ ] Remove `updateSearchBody` optionality from interface (both impls provide it)
- [ ] Unify search semantics between memory and SQLite (at minimum, document the difference)
- [ ] Add max length to `federationLogs` in memory impl
