import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SCHEMA_MIGRATIONS, SCHEMA_VERSION } from '@xnetjs/sqlite'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { listCheckpoints, verifyCheckpoint } from './checkpoints'
import { inspectDatabase } from './compatibility'
import { prepareWorkspaceUpgrade } from './migrations'

let root: string
let dataPath: string
let recoveryPath: string
const requireIdentity = vi.fn()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-migration-'))
  dataPath = join(root, 'data')
  recoveryPath = join(root, 'recovery')
  await mkdir(dataPath)
  const db = new Database(join(dataPath, 'data.db'))
  db.exec(await readFile(new URL('./fixtures/schema-v8.sql', import.meta.url), 'utf8'))
  db.prepare(
    'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)'
  ).run('note', 'xnet://xnet.fyi/Page@1.0.0', 1, 1, 'did:key:fixture')
  db.prepare('INSERT INTO yjs_state (node_id, state, updated_at) VALUES (?, ?, ?)').run(
    'note',
    Buffer.from('synthetic document bytes'),
    1
  )
  db.close()
  const blobs = new Database(join(dataPath, 'xnet.db'))
  blobs.exec('CREATE TABLE blobs (cid TEXT PRIMARY KEY, data BLOB NOT NULL)')
  blobs.prepare('INSERT INTO blobs VALUES (?, ?)').run('fixture', Buffer.from('attachment'))
  blobs.close()
  await writeFile(join(dataPath, 'identity-seed.json'), 'opaque fixture identity')
  await writeFile(join(dataPath, 'retained-source.json'), 'source evidence')
  requireIdentity.mockReset()
})
afterEach(() => rm(root, { recursive: true, force: true }))
const upgrade = () =>
  prepareWorkspaceUpgrade({
    dataPath,
    recoveryPath,
    profile: 'daily',
    appVersion: 'fixture-new',
    requireIdentity
  })

it('upgrades a historical fixture on a copy and keeps identity, documents, blobs, and the original', async () => {
  const before = await readFile(join(dataPath, 'data.db'))
  expect(await upgrade()).toBe(true)
  expect(inspectDatabase(join(dataPath, 'data.db'))).toEqual({
    status: 'supported',
    version: SCHEMA_VERSION
  })
  const points = await listCheckpoints(recoveryPath)
  expect(points).toHaveLength(2)
  const pinned = points.find((point) => point.pinned)!
  expect(pinned.storageVersion).toBe(8)
  expect(points.some((point) => point.storageVersion === SCHEMA_VERSION)).toBe(true)
  await verifyCheckpoint(join(recoveryPath, pinned.id))
  expect(inspectDatabase(join(recoveryPath, pinned.id, 'workspace/data.db')).status).toBe('old')
  const [generation] = await readdir(join(recoveryPath, 'preserved'))
  expect(await readFile(join(recoveryPath, 'preserved', generation, 'data.db'))).toEqual(before)
  expect(await readFile(join(dataPath, 'identity-seed.json'), 'utf8')).toBe(
    'opaque fixture identity'
  )
  expect(await readFile(join(dataPath, 'retained-source.json'), 'utf8')).toBe('source evidence')
  const db = new Database(join(dataPath, 'data.db'), { readonly: true })
  expect(db.prepare('SELECT state FROM yjs_state WHERE node_id = ?').get('note')).toEqual({
    state: Buffer.from('synthetic document bytes')
  })
  db.close()
  const blobs = new Database(join(dataPath, 'xnet.db'), { readonly: true })
  expect(blobs.prepare('SELECT data FROM blobs WHERE cid = ?').get('fixture')).toEqual({
    data: Buffer.from('attachment')
  })
  blobs.close()
  expect(
    JSON.parse(await readFile(join(recoveryPath, 'review-required.json'), 'utf8')).version
  ).toBe(1)
  expect(await upgrade()).toBe(false)
})

it('keeps originals byte-for-byte when a migration fails', async () => {
  const before = await readFile(join(dataPath, 'data.db'))
  const sql = SCHEMA_MIGRATIONS[9]
  SCHEMA_MIGRATIONS[9] = 'THIS IS NOT VALID SQL'
  try {
    await expect(upgrade()).rejects.toThrow()
  } finally {
    SCHEMA_MIGRATIONS[9] = sql
  }
  expect(await readFile(join(dataPath, 'data.db'))).toEqual(before)
  expect((await listCheckpoints(recoveryPath))[0].pinned).toBe(true)
  expect(await readdir(join(recoveryPath, 'migrations'))).toEqual([])
})

it('refuses a candidate whose declared version hides a missing column', async () => {
  const db = new Database(join(dataPath, 'data.db'))
  db.exec('ALTER TABLE node_properties DROP COLUMN tiebreak_key')
  db.close()
  const before = await readFile(join(dataPath, 'data.db'))
  await expect(upgrade()).rejects.toThrow('node_properties.tiebreak_key')
  expect(await readFile(join(dataPath, 'data.db'))).toEqual(before)
})

it.each([7, SCHEMA_VERSION + 1])(
  'preserves unsupported version %s without an attempted upgrade',
  async (version) => {
    const db = new Database(join(dataPath, 'data.db'))
    db.prepare('UPDATE _schema_version SET version = ?').run(version)
    db.close()
    const before = await readFile(join(dataPath, 'data.db'))
    await expect(upgrade()).rejects.toThrow('needs recovery')
    expect(await readFile(join(dataPath, 'data.db'))).toEqual(before)
    expect(requireIdentity).not.toHaveBeenCalled()
  }
)

it('stops before copies or database changes when identity validation fails', async () => {
  const before = await readFile(join(dataPath, 'data.db'))
  requireIdentity.mockImplementation(() => {
    throw new Error('key store locked')
  })
  await expect(upgrade()).rejects.toThrow('key store locked')
  expect(await readFile(join(dataPath, 'data.db'))).toEqual(before)
  expect(await listCheckpoints(recoveryPath)).toEqual([])
})
