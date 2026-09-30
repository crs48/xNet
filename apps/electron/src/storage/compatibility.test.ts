import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCHEMA_VERSION } from '@xnetjs/sqlite'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  inspectDatabase,
  requireCompatibleDatabase,
  WorkspaceRecoveryRequired
} from './compatibility'

let root: string
let path: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'xnet-compatibility-'))
  path = join(root, 'data.db')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function fixture(version?: number | string): void {
  const db = new Database(path)
  db.exec("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('Keep this note')")
  if (version !== undefined) {
    db.exec('CREATE TABLE _schema_version (version, applied_at INTEGER)')
    db.prepare('INSERT INTO _schema_version VALUES (?, 1)').run(version)
  }
  db.close()
}

describe('read-only workspace compatibility', () => {
  it('distinguishes an absent file without creating a database', () => {
    expect(inspectDatabase(path)).toEqual({ status: 'missing' })
    expect(readdirSync(root)).toEqual([])
  })

  it('does not create a new database over orphaned recovery files', () => {
    writeFileSync(`${path}-wal`, 'previous workspace')
    expect(inspectDatabase(path).status).toBe('unreadable')
    expect(readdirSync(root)).toEqual(['data.db-wal'])
  })

  it.each([
    [undefined, 'unversioned'],
    [1, 'old'],
    [SCHEMA_VERSION - 1, 'old'],
    [SCHEMA_VERSION, 'supported'],
    [SCHEMA_VERSION + 1, 'future'],
    ['broken', 'unreadable'],
    [0, 'unreadable']
  ] as const)('preserves a database with version %s (%s)', (version, status) => {
    fixture(version)
    const before = readFileSync(path)
    expect(inspectDatabase(path).status).toBe(status)
    if (status === 'supported') expect(() => requireCompatibleDatabase(path)).not.toThrow()
    else expect(() => requireCompatibleDatabase(path)).toThrow(WorkspaceRecoveryRequired)
    expect(readFileSync(path)).toEqual(before)
    const db = new Database(path, { readonly: true })
    expect(db.prepare('SELECT body FROM notes').get()).toEqual({ body: 'Keep this note' })
    db.close()
  })

  it('preserves corrupt files and their sidecars', () => {
    for (const suffix of ['', '-wal', '-shm']) writeFileSync(path + suffix, `preserve ${suffix}`)
    expect(inspectDatabase(path).status).toBe('unreadable')
    expect(() => requireCompatibleDatabase(path)).toThrow(WorkspaceRecoveryRequired)
    for (const suffix of ['', '-wal', '-shm']) {
      expect(readFileSync(path + suffix, 'utf8')).toBe(`preserve ${suffix}`)
    }
  })

  it('reads committed versions in a live WAL without checkpointing it', () => {
    const writer = new Database(path)
    try {
      writer.pragma('journal_mode = WAL')
      writer.pragma('wal_autocheckpoint = 0')
      writer.exec('CREATE TABLE _schema_version (version INTEGER)')
      writer.prepare('INSERT INTO _schema_version VALUES (?)').run(SCHEMA_VERSION + 1)
      const database = readFileSync(path)
      const wal = readFileSync(`${path}-wal`)
      expect(inspectDatabase(path).status).toBe('future')
      expect(readFileSync(path)).toEqual(database)
      expect(readFileSync(`${path}-wal`)).toEqual(wal)
    } finally {
      writer.close()
    }
  })

  it('does not mistake invalid filesystem paths for new workspaces', () => {
    expect(inspectDatabase(root).status).toBe('unreadable')
    fixture()
    expect(inspectDatabase(join(path, 'child')).status).toBe('unreadable')
  })

  it('validates the separate legacy blob store without writing to it', () => {
    const db = new Database(path)
    db.exec('CREATE TABLE blobs (cid TEXT PRIMARY KEY, data BLOB)')
    db.close()
    const before = readFileSync(path)
    expect(inspectDatabase(path, 'blobs')).toEqual({ status: 'supported', version: 1 })
    expect(readFileSync(path)).toEqual(before)
  })

  it('rejects an unreadable blob schema before normal initialization', () => {
    fixture()
    expect(() => requireCompatibleDatabase(path, 'blobs')).toThrow(WorkspaceRecoveryRequired)
  })
})
