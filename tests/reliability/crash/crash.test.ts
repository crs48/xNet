/**
 * Crash-consistency harness (exploration 0272, Pillar 3).
 *
 * SQLite's own crash-testing pattern, applied to the xNet schema: a child
 * process writes transactional batches at full speed (production Electron
 * pragmas: WAL + synchronous=NORMAL) and the parent SIGKILLs it mid-stream —
 * the OS-level equivalent of a power cut for everything above the filesystem.
 * On reopen the database must:
 *
 *   1. pass PRAGMA integrity_check / quick_check,
 *   2. contain an EXACT transactional prefix — every committed batch is
 *      complete, no partial batch is ever visible (WAL atomicity),
 *   3. converge under replay — re-running the deterministic writer to
 *      completion over the crashed file (idempotent LWW upserts + INSERT OR
 *      IGNORE) must produce a database identical to a never-killed
 *      reference run.
 *
 * Depth knob: XNET_CRASH_ITERATIONS (default 3 in the PR lane; the soak
 * workflow escalates). Skips when the better-sqlite3 native module is not
 * loadable for this Node ABI (same pattern as the packages/data suite).
 */

import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import { describe, expect, it } from 'vitest'
import { envInt, SimRng } from '../support/rng'

const ITERATIONS = envInt('XNET_CRASH_ITERATIONS', 3)
const BATCHES = envInt('XNET_CRASH_BATCHES', 4000)
const PROPS_PER_BATCH = 8

const HERE = fileURLToPath(new URL('.', import.meta.url))
const CHILD = join(HERE, 'writer-child.mjs')

function resolveBetterSqlite(): string | null {
  try {
    const req = createRequire(
      fileURLToPath(new URL('../../../packages/sqlite/package.json', import.meta.url))
    )
    return req.resolve('better-sqlite3')
  } catch {
    return null
  }
}

const BSQLITE = resolveBetterSqlite()

function loadDatabaseCtor(): (new (path: string, opts?: unknown) => any) | null {
  if (!BSQLITE) return null
  try {
    const req = createRequire(import.meta.url)
    return req(BSQLITE)
  } catch {
    return null
  }
}

const Database = loadDatabaseCtor()

interface ChildRun {
  exitedBeforeKill: boolean
}

/** Spawn the writer, SIGKILL it `delayMs` after the first committed batch. */
function runAndKill(dbPath: string, seed: number, delayMs: number): Promise<ChildRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, dbPath, String(seed), String(BATCHES)], {
      env: { ...process.env, XNET_BSQLITE_PATH: BSQLITE! },
      stdio: ['ignore', 'pipe', 'inherit']
    })
    let sawFirstBatch = false
    let finished = false
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (text.includes('done')) finished = true
      if (!sawFirstBatch && text.includes('batch')) {
        sawFirstBatch = true
        setTimeout(() => child.kill('SIGKILL'), delayMs)
      }
    })
    child.on('error', reject)
    child.on('exit', () => resolve({ exitedBeforeKill: finished }))
  })
}

/** Run the writer to completion (reference run / replay run). */
function runToCompletion(dbPath: string, seed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD, dbPath, String(seed), String(BATCHES)], {
      env: { ...process.env, XNET_BSQLITE_PATH: BSQLITE! },
      stdio: ['ignore', 'ignore', 'inherit']
    })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`writer exited with ${code}`))
    )
  })
}

async function initSchema(dbPath: string): Promise<void> {
  const adapter = await createElectronSQLiteAdapter({ path: dbPath })
  await adapter.close()
}

function cleanup(dbPath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`
    if (existsSync(file)) rmSync(file, { force: true })
  }
}

function dump(db: any) {
  return {
    integrity: db.pragma('integrity_check', { simple: true }),
    quick: db.pragma('quick_check', { simple: true }),
    lastBatch: (db.prepare(`SELECT value FROM crash_meta WHERE key = 'lastBatch'`).get()?.value ??
      0) as number,
    changeCount: db.prepare('SELECT COUNT(*) AS n FROM changes').get().n as number,
    perBatch: db
      .prepare('SELECT batch_id, COUNT(*) AS n FROM changes GROUP BY batch_id')
      .all() as Array<{ batch_id: string; n: number }>,
    properties: db
      .prepare(
        `SELECT node_id, property_key, value, lamport_time, updated_by, updated_at
         FROM node_properties ORDER BY node_id, property_key`
      )
      .all(),
    changeHashes: db
      .prepare('SELECT hash FROM changes ORDER BY hash')
      .all()
      .map((r: { hash: string }) => r.hash)
  }
}

describe.skipIf(!Database)('crash consistency under SIGKILL (0272)', () => {
  it(
    `survives ${ITERATIONS} random-offset SIGKILLs with atomic prefixes and replay convergence`,
    async () => {
      const rng = new SimRng(0xdead)
      let killedMidRun = 0

      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const seed = 1000 + iteration
        const crashedPath = join(tmpdir(), `xnet-crash-${process.pid}-${iteration}.db`)
        const referencePath = join(tmpdir(), `xnet-crash-ref-${process.pid}-${iteration}.db`)
        try {
          await initSchema(crashedPath)
          const { exitedBeforeKill } = await runAndKill(crashedPath, seed, 10 + rng.int(80))
          if (!exitedBeforeKill) killedMidRun += 1

          // 1 + 2: integrity and the atomic-prefix invariant.
          const crashed = new Database!(crashedPath)
          const state = dump(crashed)
          crashed.close()
          expect(state.integrity, `iteration ${iteration}`).toBe('ok')
          expect(state.quick, `iteration ${iteration}`).toBe('ok')
          expect(state.lastBatch).toBeGreaterThanOrEqual(1)
          expect(state.changeCount).toBe(state.lastBatch * PROPS_PER_BATCH)
          for (const row of state.perBatch) {
            expect(row.n, `partial batch ${row.batch_id} in iteration ${iteration}`).toBe(
              PROPS_PER_BATCH
            )
          }

          // 3: replay the crashed file to completion; compare to a reference
          // run that never crashed.
          await runToCompletion(crashedPath, seed)
          await initSchema(referencePath)
          await runToCompletion(referencePath, seed)

          const replayed = new Database!(crashedPath)
          const reference = new Database!(referencePath)
          const replayedState = dump(replayed)
          const referenceState = dump(reference)
          replayed.close()
          reference.close()

          expect(replayedState.lastBatch).toBe(BATCHES)
          expect(replayedState.changeCount).toBe(referenceState.changeCount)
          expect(replayedState.changeHashes).toEqual(referenceState.changeHashes)
          expect(replayedState.properties).toEqual(referenceState.properties)
        } finally {
          cleanup(crashedPath)
          cleanup(referencePath)
        }
      }

      // Guard against a vacuous pass: with the default batch count the child
      // cannot plausibly finish before every kill fires. If it somehow does,
      // the harness has stopped testing crashes at all — fail loudly.
      expect(killedMidRun).toBeGreaterThan(0)
    },
    // Each iteration runs the writer up to three times (crash, replay,
    // reference), so give the soak-tier plenty of head-room.
    Math.max(120_000, ITERATIONS * 30_000)
  )
})
