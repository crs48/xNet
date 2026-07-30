#!/usr/bin/env node
/**
 * Backup → restore → verify drill (exploration 0272, Pillar 4).
 *
 * "A backup you have never restored is not a backup." This drill takes an
 * xNet SQLite database, snapshots it with SQLite's online backup API,
 * restores the snapshot to a scratch path, and then verifies the restored
 * file BOTH physically and logically:
 *
 *   - PRAGMA integrity_check + quick_check must return 'ok';
 *   - row counts for nodes / node_properties / changes must match the source;
 *   - the change-log high-water mark (MAX(lamport_time)) must match;
 *   - every node's head hash (the change-log tip per node) must match.
 *
 * Physical integrity alone is not enough — a structurally valid database
 * missing half its change log restores "cleanly" and still loses data, which
 * is why the logical checks exist. The same checks apply unchanged to a
 * Litestream-restored file: point --db at the `litestream restore` output
 * and the original, via --against.
 *
 * Usage:
 *   node scripts/reliability/restore-drill.mjs --db <path> [--scratch <dir>]
 *   node scripts/reliability/restore-drill.mjs --db <restored> --against <original>
 *
 * Exit codes: 0 = drill passed, 2 = verification failed, 1 = usage/IO error.
 * Prints a JSON report to stdout either way.
 *
 * Never call process.exit() here: stdout is an async pipe when the drill is
 * piped (to a test harness, to `jq`, to a log collector), and exiting drops
 * whatever has not drained — 8KB on macOS, 64KB on Linux. The failure reports
 * are the big ones, because a corrupt database makes integrity_check emit
 * thousands of lines, so exiting eagerly truncates the JSON exactly when the
 * news is bad. Set process.exitCode and let Node flush and exit on its own.
 */

import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const sqlitePkg = createRequire(resolve(HERE, '../../packages/sqlite/package.json'))
const Database = sqlitePkg('better-sqlite3')

function parseArgs(argv) {
  const args = { db: null, against: null, scratch: null }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--db') args.db = argv[++i]
    else if (argv[i] === '--against') args.against = argv[++i]
    else if (argv[i] === '--scratch') args.scratch = argv[++i]
  }
  return args
}

function inspect(dbPath) {
  const db = new Database(dbPath, { readonly: false, fileMustExist: true })
  try {
    const integrity = db.pragma('integrity_check', { simple: true })
    const quick = db.pragma('quick_check', { simple: true })
    const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
    const highWater =
      db.prepare('SELECT COALESCE(MAX(lamport_time), 0) AS hw FROM changes').get().hw ?? 0
    // Head hash per node: the tip of each node's change chain. On ties keep
    // the lexicographically greatest hash so the comparison is deterministic.
    const heads = db
      .prepare(
        `SELECT node_id, MAX(hash) AS head FROM changes c
         WHERE lamport_time = (SELECT MAX(lamport_time) FROM changes WHERE node_id = c.node_id)
         GROUP BY node_id ORDER BY node_id`
      )
      .all()
    return {
      integrity,
      quick,
      counts: {
        nodes: count('nodes'),
        node_properties: count('node_properties'),
        changes: count('changes')
      },
      highWater,
      heads
    }
  } finally {
    db.close()
  }
}

function diffReports(source, restored) {
  const failures = []
  if (restored.integrity !== 'ok') failures.push(`integrity_check: ${restored.integrity}`)
  if (restored.quick !== 'ok') failures.push(`quick_check: ${restored.quick}`)
  for (const table of Object.keys(source.counts)) {
    if (source.counts[table] !== restored.counts[table]) {
      failures.push(`${table} rows: source=${source.counts[table]} restored=${restored.counts[table]}`)
    }
  }
  if (source.highWater !== restored.highWater) {
    failures.push(`high-water: source=${source.highWater} restored=${restored.highWater}`)
  }
  const sourceHeads = JSON.stringify(source.heads)
  const restoredHeads = JSON.stringify(restored.heads)
  if (sourceHeads !== restoredHeads) failures.push('per-node head hashes differ')
  return failures
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.db) {
    console.error('usage: restore-drill.mjs --db <path> [--against <path>] [--scratch <dir>]')
    process.exitCode = 1
    return
  }

  let restoredPath = args.db
  let sourcePath = args.against
  let scratchDir = null

  if (!args.against) {
    // Full drill: back up --db, restore to scratch, verify against the source.
    sourcePath = args.db
    scratchDir = args.scratch ?? mkdtempSync(join(tmpdir(), 'xnet-restore-drill-'))
    restoredPath = join(scratchDir, 'restored.db')
    const source = new Database(sourcePath, { fileMustExist: true })
    try {
      await source.backup(restoredPath)
    } finally {
      source.close()
    }
  }

  let sourceReport
  let restoredReport
  try {
    sourceReport = inspect(sourcePath)
    restoredReport = inspect(restoredPath)
  } catch (error) {
    console.log(
      JSON.stringify({ ok: false, failures: [`inspection failed: ${error.message}`] }, null, 2)
    )
    process.exitCode = 2
    return
  } finally {
    if (scratchDir && !args.scratch) rmSync(scratchDir, { recursive: true, force: true })
  }

  // The source must itself be healthy — a drill that "passes" by comparing
  // two corrupt files equally would be worse than no drill.
  const failures = [
    ...(sourceReport.integrity !== 'ok' ? [`source integrity_check: ${sourceReport.integrity}`] : []),
    ...diffReports(sourceReport, restoredReport)
  ]

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        source: { path: sourcePath, ...sourceReport, heads: undefined },
        restored: { path: restoredPath, ...restoredReport, heads: undefined },
        headsCompared: sourceReport.heads.length,
        failures
      },
      null,
      2
    )
  )
  process.exitCode = failures.length === 0 ? 0 : 2
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
