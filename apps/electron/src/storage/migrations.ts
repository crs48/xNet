import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { SCHEMA_DDL, SCHEMA_MIGRATIONS, SCHEMA_VERSION } from '@xnetjs/sqlite'
import Database from 'better-sqlite3'
import { createCheckpoint } from './checkpoints'
import {
  inspectDatabase,
  requireCompatibleDatabase,
  WorkspaceRecoveryRequired
} from './compatibility'
import { restoreCheckpoint } from './restore'

// Version 8 is the oldest independently captured fixture verified by this desktop migration path.
export const OLDEST_DESKTOP_STORAGE_VERSION = 8
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const rowCount = (db: Database.Database, name: string) =>
  (db.prepare(`SELECT COUNT(*) AS count FROM ${quote(name)}`).get() as { count: number }).count

/** Apply ordered upgrades only to a disposable candidate; validate its actual column contract. */
export function migrateDatabaseCandidate(path: string, fromVersion: number): void {
  if (fromVersion < OLDEST_DESKTOP_STORAGE_VERSION || fromVersion >= SCHEMA_VERSION)
    throw new Error('Unsupported candidate migration version')
  const db = new Database(path, { fileMustExist: true })
  const expected = new Database(':memory:')
  try {
    if (
      (
        db.prepare('SELECT MAX(version) AS version FROM _schema_version').get() as {
          version: number
        }
      ).version !== fromVersion
    )
      throw new Error('Candidate version differs from the inspected source')
    db.pragma('synchronous = FULL')
    db.pragma('foreign_keys = ON')
    expected.exec(SCHEMA_DDL)
    const oldTables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
    const oldCounts = new Map(oldTables.map(({ name }) => [name, rowCount(db, name)]))
    db.transaction(() => {
      for (let version = fromVersion + 1; version <= SCHEMA_VERSION; version++) {
        const sql = SCHEMA_MIGRATIONS[version]
        if (!sql) throw new Error(`Missing ordered migration for storage version ${version}`)
        db.exec(sql)
        db.prepare('INSERT INTO _schema_version (version, applied_at) VALUES (?, ?)').run(
          version,
          Date.now()
        )
      }
      const tables = expected
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
      for (const { name } of tables) {
        const required = expected.prepare(`PRAGMA table_info(${quote(name)})`).all() as {
          name: string
          type: string
          pk: number
        }[]
        const actual = db.prepare(`PRAGMA table_info(${quote(name)})`).all() as {
          name: string
          type: string
          pk: number
        }[]
        for (const column of required)
          if (
            !actual.some(
              (candidate) =>
                candidate.name === column.name &&
                candidate.type === column.type &&
                candidate.pk === column.pk
            )
          )
            throw new Error(
              `Candidate is missing the expected column contract: ${name}.${column.name}`
            )
      }
      // These migrations add structure; deleting even derived rows would violate their contract.
      for (const [name, count] of oldCounts)
        if (name !== '_schema_version' && rowCount(db, name) !== count)
          throw new Error(`Candidate migration changed existing row counts: ${name}`)
      if (
        db.pragma('quick_check', { simple: true }) !== 'ok' ||
        (db.pragma('foreign_key_check') as unknown[]).length > 0
      )
        throw new Error('Candidate failed database integrity validation')
    })()
    db.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    expected.close()
    db.close()
  }
}

/** Before any normal writable open. Originals and the pinned pre-upgrade copy both survive. */
export async function prepareWorkspaceUpgrade(options: {
  dataPath: string
  recoveryPath: string
  profile: string
  appVersion: string
  testIdentity?: boolean
  requireIdentity: () => void
}): Promise<boolean> {
  const dbPath = join(options.dataPath, 'data.db')
  const state = inspectDatabase(dbPath)
  requireCompatibleDatabase(join(options.dataPath, 'xnet.db'), 'blobs')
  if (state.status === 'missing' || state.status === 'supported') return false
  if (state.status !== 'old' || state.version < OLDEST_DESKTOP_STORAGE_VERSION)
    throw new WorkspaceRecoveryRequired(dbPath, state)
  options.requireIdentity()
  const original = await createCheckpoint({ ...options, pinned: true })
  const container = join(options.recoveryPath, 'migrations', randomUUID())
  const candidate = join(container, 'workspace')
  await mkdir(container, { recursive: true, mode: 0o700 })
  try {
    await cp(join(options.recoveryPath, original.id, 'workspace'), candidate, {
      recursive: true,
      mode: constants.COPYFILE_FICLONE
    })
    migrateDatabaseCandidate(join(candidate, 'data.db'), state.version)
    const upgraded = await createCheckpoint({ ...options, dataPath: candidate })
    await restoreCheckpoint({
      ...options,
      id: upgraded.id,
      allowTestIdentity: options.testIdentity
    })
    return true
  } finally {
    // This is only the disposable candidate. Original generations and recovery points are separate.
    await rm(container, { recursive: true, force: true })
  }
}
