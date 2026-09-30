import { constants, copyFileSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TaggedError } from '@xnetjs/core'
import { SCHEMA_VERSION } from '@xnetjs/sqlite'
import Database from 'better-sqlite3'

export type StorageCompatibility =
  | { status: 'missing' }
  | { status: 'supported'; version: number }
  | { status: 'old' | 'future'; version: number; expected: number }
  | { status: 'unversioned' }
  | { status: 'unreadable'; reason: string }

function fingerprint(path: string): string | null {
  try {
    const stat = statSync(path, { bigint: true })
    return `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** SQLite can write the SHM even in readonly mode. Inspect a disposable copy instead. */
export function inspectDatabase(
  path: string,
  kind: 'workspace' | 'blobs' = 'workspace'
): StorageCompatibility {
  let db: Database.Database | undefined
  let scratch: string | undefined
  try {
    try {
      const file = statSync(path)
      if (!file.isFile()) return { status: 'unreadable', reason: 'Database path is not a file.' }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (['-wal', '-shm', '-journal'].some((suffix) => fingerprint(path + suffix) !== null)) {
          return {
            status: 'unreadable',
            reason: 'Database is missing but recovery sidecars remain.'
          }
        }
        return { status: 'missing' }
      }
      throw error
    }
    // The app holds the profile lock. Still refuse a source changed by another
    // writer during the copy; it is not evidence of a compatible workspace.
    if (fingerprint(`${path}-journal`) !== null) {
      return { status: 'unreadable', reason: 'A rollback journal needs recovery on a copy.' }
    }
    const before = [fingerprint(path), fingerprint(`${path}-wal`)]
    scratch = mkdtempSync(join(tmpdir(), 'xnet-inspect-'))
    const candidate = join(scratch, 'data.db')
    copyFileSync(path, candidate, constants.COPYFILE_FICLONE)
    if (before[1] !== null)
      copyFileSync(`${path}-wal`, `${candidate}-wal`, constants.COPYFILE_FICLONE)
    const after = [fingerprint(path), fingerprint(`${path}-wal`)]
    if (before.some((value, index) => value !== after[index])) {
      return {
        status: 'unreadable',
        reason: 'Database changed during inspection. Close other writers and retry.'
      }
    }
    db = new Database(candidate, { readonly: true, fileMustExist: true })
    const integrity = db.pragma('quick_check') as { quick_check: string }[]
    if (integrity.length !== 1 || integrity[0]?.quick_check !== 'ok') {
      return { status: 'unreadable', reason: 'SQLite integrity check failed.' }
    }
    if (kind === 'blobs') {
      // This older store has no version table; validate its actual contract.
      db.prepare('SELECT cid, data FROM blobs LIMIT 0').all()
      return { status: 'supported', version: 1 }
    }
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_schema_version'")
      .get()
    if (!table) return { status: 'unversioned' }
    const rows = db.prepare('SELECT version FROM _schema_version').all() as { version: unknown }[]
    if (rows.length === 0) return { status: 'unversioned' }
    if (rows.some(({ version }) => !Number.isSafeInteger(version) || Number(version) < 1)) {
      return { status: 'unreadable', reason: 'Invalid storage version record.' }
    }
    const version = Math.max(...rows.map((row) => Number(row.version)))
    if (version === SCHEMA_VERSION) return { status: 'supported', version }
    return {
      status: version < SCHEMA_VERSION ? 'old' : 'future',
      version,
      expected: SCHEMA_VERSION
    }
  } catch (error) {
    return { status: 'unreadable', reason: error instanceof Error ? error.message : String(error) }
  } finally {
    try {
      db?.close()
    } finally {
      if (scratch) rmSync(scratch, { recursive: true, force: true })
    }
  }
}

export class WorkspaceRecoveryRequired extends TaggedError {
  readonly _tag = 'WorkspaceRecoveryRequired'

  constructor(
    readonly path: string,
    readonly compatibility: StorageCompatibility
  ) {
    const detail = compatibility.status === 'unreadable' ? ` ${compatibility.reason}` : ''
    super(
      `This workspace needs recovery (${compatibility.status}).${detail} Original files were preserved.`
    )
  }
}

export function requireCompatibleDatabase(
  path: string,
  kind: 'workspace' | 'blobs' = 'workspace'
): void {
  const result = inspectDatabase(path, kind)
  if (result.status !== 'missing' && result.status !== 'supported') {
    throw new WorkspaceRecoveryRequired(path, result)
  }
}
