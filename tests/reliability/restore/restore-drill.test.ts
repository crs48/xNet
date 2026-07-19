/**
 * Restore drill verification (exploration 0272, Pillar 4).
 *
 * Runs scripts/reliability/restore-drill.mjs against a seeded real database
 * and asserts both directions:
 *   - the drill PASSES on a healthy database (backup → restore → physical +
 *     logical verification), and
 *   - the drill FAILS on a deliberately corrupted copy — a drill that cannot
 *     detect corruption is worse than none.
 *
 * Skips when the better-sqlite3 native module is unavailable for this Node
 * ABI (same pattern as the crash harness).
 */

import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, openSync, writeSync, closeSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { createElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

const DRILL = fileURLToPath(
  new URL('../../../scripts/reliability/restore-drill.mjs', import.meta.url)
)
const WRITER = fileURLToPath(new URL('../crash/writer-child.mjs', import.meta.url))

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

function nativeLoads(): boolean {
  if (!BSQLITE) return false
  try {
    createRequire(import.meta.url)(BSQLITE)
    return true
  } catch {
    return false
  }
}

/**
 * Parse the drill's JSON report, failing with the raw stdout when it isn't
 * parseable. A bare `JSON.parse` throws a SyntaxError naming only a byte
 * offset, which tells you nothing about what the drill actually printed —
 * and the drill's own diagnosis is exactly what you need at that moment.
 */
function parseReport(stdout: string, stderr: string, code: number): any {
  if (!stdout) return null
  try {
    return JSON.parse(stdout)
  } catch (error: any) {
    throw new Error(
      `restore-drill exited ${code} but its stdout is not valid JSON: ${error.message}\n` +
        `--- stdout (${stdout.length} bytes) ---\n${stdout}\n` +
        `--- stderr (${stderr.length} bytes) ---\n${stderr}\n--- end ---`
    )
  }
}

async function runDrill(args: string[]): Promise<{ code: number; report: any }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [DRILL, ...args], {
      env: { ...process.env }
    })
    return { code: 0, report: parseReport(stdout, stderr, 0) }
  } catch (error: any) {
    const code = error.code ?? 1
    return { code, report: parseReport(error.stdout ?? '', error.stderr ?? '', code) }
  }
}

describe.skipIf(!nativeLoads())('restore drill (0272)', () => {
  const dbPath = join(tmpdir(), `xnet-restore-drill-${process.pid}.db`)
  const corruptPath = join(tmpdir(), `xnet-restore-drill-${process.pid}-corrupt.db`)

  beforeAll(async () => {
    // Seed a realistic database: real schema, then the deterministic crash
    // writer fills nodes/node_properties/changes.
    const adapter = await createElectronSQLiteAdapter({ path: dbPath })
    await adapter.close()
    await execFileAsync(process.execPath, [WRITER, dbPath, '2026', '500'], {
      env: { ...process.env, XNET_BSQLITE_PATH: BSQLITE! }
    })
  }, 60_000)

  afterAll(() => {
    for (const p of [dbPath, corruptPath]) {
      for (const suffix of ['', '-wal', '-shm']) {
        if (existsSync(`${p}${suffix}`)) rmSync(`${p}${suffix}`, { force: true })
      }
    }
  })

  it('passes on a healthy database and verifies logical state, not just integrity', async () => {
    const { code, report } = await runDrill(['--db', dbPath])
    expect(code).toBe(0)
    expect(report.ok).toBe(true)
    expect(report.failures).toEqual([])
    expect(report.restored.integrity).toBe('ok')
    expect(report.restored.counts.changes).toBeGreaterThan(0)
    expect(report.restored.counts.changes).toBe(report.source.counts.changes)
    expect(report.restored.highWater).toBe(report.source.highWater)
    expect(report.headsCompared).toBeGreaterThan(0)
  }, 60_000)

  it('fails loudly on a corrupted copy', async () => {
    copyFileSync(dbPath, corruptPath)
    // Stomp a stretch of page data past the header. The drill must notice —
    // via integrity_check or a failed inspection — and exit non-zero.
    const size = statSync(corruptPath).size
    const fd = openSync(corruptPath, 'r+')
    try {
      writeSync(fd, Buffer.alloc(4096, 0xff), 0, 4096, Math.floor(size / 2))
    } finally {
      closeSync(fd)
    }

    const { code, report } = await runDrill(['--db', corruptPath])
    expect(code).toBe(2)
    expect(report?.ok).toBe(false)
    expect((report?.failures ?? []).length).toBeGreaterThan(0)
  }, 60_000)

  it('supports comparing a pre-restored file via --against (litestream drill shape)', async () => {
    // Simulate "litestream restore wrote a file; verify it against prod".
    const restoredCopy = join(tmpdir(), `xnet-restore-drill-${process.pid}-copy.db`)
    try {
      const req = createRequire(import.meta.url)
      const Database = req(BSQLITE!)
      const src = new Database(dbPath)
      await src.backup(restoredCopy)
      src.close()

      const { code, report } = await runDrill(['--db', restoredCopy, '--against', dbPath])
      expect(code).toBe(0)
      expect(report.ok).toBe(true)
    } finally {
      if (existsSync(restoredCopy)) rmSync(restoredCopy, { force: true })
    }
  }, 60_000)
})
