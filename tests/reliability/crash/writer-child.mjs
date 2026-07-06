/**
 * Crash-harness writer child (exploration 0272, Pillar 3).
 *
 * Spawned by crash.test.ts against a pre-initialized xNet SQLite database
 * (real SCHEMA_DDL, applied by the parent). Opens it with the production
 * Electron pragmas (WAL, synchronous = NORMAL — packages/sqlite/src/adapters/
 * electron.ts) and writes deterministic batches — one transaction per batch:
 * a node upsert, K property upserts through the full-triple LWW guard, K
 * change-log inserts, and a crash_meta counter bump. The parent SIGKILLs the
 * process at a random moment mid-stream; because every batch is one
 * transaction, the database must afterwards contain an exact prefix of
 * batches, pass integrity_check, and re-running this script to completion
 * (idempotent INSERT OR IGNORE + LWW upserts) must converge it to the state
 * of a never-killed reference run.
 *
 * Deterministic given (seed): data comes from mulberry32, so a reference run
 * with the same seed produces byte-identical rows.
 *
 * Usage: node writer-child.mjs <dbPath> <seed> <batches>
 *   env XNET_BSQLITE_PATH — resolved better-sqlite3 entry (parent supplies).
 */

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require(process.env.XNET_BSQLITE_PATH ?? 'better-sqlite3')

const [dbPath, seedArg, batchesArg] = process.argv.slice(2)
const seed = Number.parseInt(seedArg, 10)
const batches = Number.parseInt(batchesArg, 10)
const PROPS_PER_BATCH = 8
const AUTHOR = 'did:key:z6MkcrashHarnessWriter0272'
const SCHEMA_ID = 'xnet://xnet.fyi/Task'

function mulberry32(a) {
  a = a >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(seed)
const db = new Database(dbPath)
// Production pragmas — keep in lockstep with ElectronSQLiteAdapter.
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('busy_timeout = 5000')
db.pragma('foreign_keys = ON')

db.exec(`CREATE TABLE IF NOT EXISTS crash_meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
)`)

const upsertNode = db.prepare(
  `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at)
   VALUES (?, ?, ?, ?, ?, NULL)
   ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
)
// The production LWW guard (full ordering triple — see sqlite-adapter.ts).
const upsertProperty = db.prepare(
  `INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at)
   VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(node_id, property_key) DO UPDATE SET
     value = excluded.value,
     lamport_time = excluded.lamport_time,
     updated_by = excluded.updated_by,
     updated_at = excluded.updated_at
   WHERE excluded.lamport_time > node_properties.lamport_time
      OR (excluded.lamport_time = node_properties.lamport_time
          AND (excluded.updated_at > node_properties.updated_at
               OR (excluded.updated_at = node_properties.updated_at
                   AND excluded.updated_by > node_properties.updated_by)))`
)
const insertChange = db.prepare(
  `INSERT OR IGNORE INTO changes
   (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, parent_hash, batch_id, signature)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
)
const bumpMeta = db.prepare(
  `INSERT INTO crash_meta (key, value) VALUES ('lastBatch', ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value
   WHERE excluded.value > crash_meta.value`
)

const writeBatch = db.transaction((batch) => {
  const nodeId = `crash-node-${batch % 7}`
  const wallTime = 1_750_000_000_000 + batch
  upsertNode.run(nodeId, SCHEMA_ID, wallTime, wallTime, AUTHOR)
  for (let i = 0; i < PROPS_PER_BATCH; i += 1) {
    const lamport = batch * PROPS_PER_BATCH + i + 1
    const key = `p${i}`
    const value = JSON.stringify(Math.floor(rng() * 1_000_000))
    upsertProperty.run(nodeId, key, Buffer.from(value), lamport, AUTHOR, wallTime)
    insertChange.run(
      `cid:blake3:crash-${seed}-${batch}-${i}`,
      nodeId,
      Buffer.from(JSON.stringify({ nodeId, properties: { [key]: value } })),
      lamport,
      AUTHOR,
      wallTime,
      AUTHOR,
      null,
      `crash-batch-${batch}`,
      Buffer.from([1])
    )
  }
  bumpMeta.run(batch)
})

for (let batch = 1; batch <= batches; batch += 1) {
  writeBatch(batch)
  if (batch === 1 || batch % 50 === 0) {
    // Progress marker the parent uses to know writes are truly underway
    // before it schedules the SIGKILL (guards against a vacuous kill).
    process.stdout.write(`batch ${batch}\n`)
  }
}
process.stdout.write('done\n')
db.close()
