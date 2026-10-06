import { mkdtemp, mkdir, readFile, rm, writeFile, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import {
  createCheckpoint,
  listCheckpoints,
  inspectCheckpoints,
  retainCheckpoints,
  verifyCheckpoint
} from './checkpoints'

let root: string
let dataPath: string
let recoveryPath: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-checkpoint-'))
  dataPath = join(root, 'workspace')
  recoveryPath = join(root, 'recovery')
  await mkdir(dataPath)
  for (const file of ['data.db', 'xnet.db']) {
    const db = new Database(join(dataPath, file))
    db.exec("CREATE TABLE content (value TEXT); INSERT INTO content VALUES ('keep me')")
    db.close()
  }
  await writeFile(
    join(dataPath, 'identity-seed.json'),
    '{"testFixture":"opaque encrypted identity"}'
  )
})
afterEach(() => rm(root, { recursive: true, force: true }))

const create = () =>
  createCheckpoint({ dataPath, recoveryPath, appVersion: '3.0.0', profile: 'test' })

describe('complete native recovery copies', () => {
  it('refuses an optional database whose recovery sidecars remain without its base file', async () => {
    await writeFile(join(dataPath, 'library.db-wal'), 'not a complete database')
    await expect(create()).rejects.toThrow('missing database with remaining sidecars')
  })
  it('verifies both stores, key files, and nested imported evidence', async () => {
    await mkdir(join(dataPath, 'sources'))
    await writeFile(join(dataPath, 'sources', 'archive.zip'), 'retained archive bytes')
    const manifest = await create()
    const path = join(recoveryPath, manifest.id)
    expect((await verifyCheckpoint(path)).files).toHaveLength(4)
    expect((await listCheckpoints(recoveryPath)).map((point) => point.id)).toEqual([manifest.id])
    await rm(dataPath, { recursive: true })
    expect((await verifyCheckpoint(path)).id).toBe(manifest.id)
    expect(await readFile(join(path, 'workspace/sources/archive.zip'), 'utf8')).toBe(
      'retained archive bytes'
    )
  })

  it('prunes only after verification and preserves originals outside retention', async () => {
    const first = await create()
    await create()
    const newest = await create()
    await mkdir(join(recoveryPath, 'preserved', 'original'), { recursive: true })
    await writeFile(join(recoveryPath, 'preserved', 'original', 'data'), 'newer work')
    await retainCheckpoints(recoveryPath, newest.id, { keep: 2 })
    expect(await listCheckpoints(recoveryPath)).toHaveLength(2)
    expect(await readdir(recoveryPath)).not.toContain(first.id)
    expect(await readFile(join(recoveryPath, 'preserved', 'original', 'data'), 'utf8')).toBe(
      'newer work'
    )
    const broken = await create()
    await writeFile(join(recoveryPath, broken.id, 'workspace/data.db'), 'broken')
    await expect(retainCheckpoints(recoveryPath, broken.id, { keep: 2 })).rejects.toThrow()
    expect(await listCheckpoints(recoveryPath)).toHaveLength(3)
    await verifyCheckpoint(join(recoveryPath, newest.id))
  })

  it('rejects a backup destination inside the source', async () => {
    await expect(
      createCheckpoint({
        dataPath,
        recoveryPath: join(dataPath, 'copies'),
        appVersion: '1',
        profile: 'test'
      })
    ).rejects.toThrow('outside')
  })

  it('includes committed WAL content in a standalone database', async () => {
    const writer = new Database(join(dataPath, 'data.db'))
    writer.pragma('journal_mode = WAL')
    writer.pragma('wal_autocheckpoint = 0')
    writer.exec("INSERT INTO content VALUES ('from WAL')")
    try {
      const manifest = await create()
      const path = join(recoveryPath, manifest.id)
      const db = new Database(join(path, 'workspace/data.db'), { readonly: true })
      try {
        expect(db.prepare('SELECT value FROM content ORDER BY rowid').all()).toEqual([
          { value: 'keep me' },
          { value: 'from WAL' }
        ])
      } finally {
        db.close()
      }
      await verifyCheckpoint(path)
      expect(manifest.files.some((file) => file.path.endsWith('-wal'))).toBe(false)
    } finally {
      writer.close()
    }
  })

  it('keeps WAL copies independent of live writes and later recovery points', async () => {
    const source = join(dataPath, 'data.db')
    const writer = new Database(source)
    writer.pragma('journal_mode = WAL')
    writer.pragma('wal_autocheckpoint = 0')
    writer.exec("INSERT INTO content VALUES ('first saved value')")
    try {
      const before = await Promise.all([readFile(source), readFile(`${source}-wal`)])
      const first = await create()
      expect(await Promise.all([readFile(source), readFile(`${source}-wal`)])).toEqual(before)
      expect(writer.pragma('journal_mode', { simple: true })).toBe('wal')

      writer.exec("UPDATE content SET value = 'later live value' WHERE rowid = 2")
      const second = await create()
      const firstPath = join(recoveryPath, first.id)
      const secondPath = join(recoveryPath, second.id)
      const firstCopy = new Database(join(firstPath, 'workspace/data.db'), { readonly: true })
      const secondCopy = new Database(join(secondPath, 'workspace/data.db'))
      try {
        expect(firstCopy.pragma('journal_mode', { simple: true })).toBe('delete')
        expect(firstCopy.prepare('SELECT value FROM content WHERE rowid = 2').get()).toEqual({
          value: 'first saved value'
        })
        expect(secondCopy.prepare('SELECT value FROM content WHERE rowid = 2').get()).toEqual({
          value: 'later live value'
        })
        secondCopy.exec("UPDATE content SET value = 'edited restored copy' WHERE rowid = 2")
        expect(writer.prepare('SELECT value FROM content WHERE rowid = 2').get()).toEqual({
          value: 'later live value'
        })
      } finally {
        firstCopy.close()
        secondCopy.close()
      }
      await verifyCheckpoint(firstPath)
    } finally {
      writer.close()
    }
  })

  it('rejects an incomplete source and keeps the previous good copy', async () => {
    const good = await create()
    await rm(join(dataPath, 'identity-seed.json'))
    await expect(create()).rejects.toThrow('missing required content')
    expect((await verifyCheckpoint(join(recoveryPath, good.id))).id).toBe(good.id)
    expect(await readdir(recoveryPath)).toEqual([good.id])
  })

  it('rejects missing blobs, altered content, and forged incomplete manifests', async () => {
    const manifest = await create()
    const path = join(recoveryPath, manifest.id)
    await writeFile(join(path, 'workspace/identity-seed.json'), 'changed')
    await expect(verifyCheckpoint(path)).rejects.toThrow('verification failed')
    manifest.files = manifest.files.filter((file) => file.path !== 'xnet.db')
    await writeFile(join(path, 'manifest.json'), JSON.stringify(manifest))
    await expect(verifyCheckpoint(path)).rejects.toThrow('Incomplete recovery copy')
  })

  it('never follows a source symlink into unrelated user files', async () => {
    await symlink(root, join(dataPath, 'outside'))
    await expect(create()).rejects.toThrow('symbolic link')
  })

  it('does not label a failed or corrupt source as a recovery point', async () => {
    await writeFile(join(dataPath, 'data.db'), 'broken database')
    await expect(create()).rejects.toThrow()
    expect(await listCheckpoints(recoveryPath)).toEqual([])
    expect(await readdir(recoveryPath)).toEqual([])
  })

  it('does not allow a test identity to stand in for daily ownership', async () => {
    await rm(join(dataPath, 'identity-seed.json'))
    const point = await createCheckpoint({
      dataPath,
      recoveryPath,
      appVersion: 'test',
      profile: 'test',
      testIdentity: true
    })
    await expect(verifyCheckpoint(join(recoveryPath, point.id))).rejects.toThrow('test identity')
  })
})

it('preserves damaged older manifests while creating and retaining new verified copies', async () => {
  const broken = await create()
  await writeFile(join(recoveryPath, broken.id, 'manifest.json'), '{truncated')
  await create()
  await create()
  const newest = await create()
  await retainCheckpoints(recoveryPath, newest.id, { keep: 2 })
  const listing = await inspectCheckpoints(recoveryPath)
  expect(listing.checkpoints).toHaveLength(2)
  expect(listing.checkpoints[0].id).toBe(newest.id)
  expect(listing.unreadable).toEqual([{ id: broken.id, reason: expect.any(String) }])
  expect(await readFile(join(recoveryPath, broken.id, 'manifest.json'), 'utf8')).toBe('{truncated')
  await expect(listCheckpoints(recoveryPath)).rejects.toThrow('Unreadable recovery points')
  await verifyCheckpoint(join(recoveryPath, newest.id))
})

it('reports recovery symlinks and unsafe manifests without following or pruning them', async () => {
  const point = await create()
  const alias = '1-11111111-1111-1111-1111-111111111111'
  await symlink(join(recoveryPath, point.id), join(recoveryPath, alias))
  const corrupt = await create()
  const manifestPath = join(recoveryPath, corrupt.id, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.files.push({ path: '../outside', size: 0, sha256: '0'.repeat(64) })
  await writeFile(manifestPath, JSON.stringify(manifest))
  const listing = await inspectCheckpoints(recoveryPath)
  expect(listing.checkpoints.map((value) => value.id)).toEqual([point.id])
  expect(listing.unreadable).toHaveLength(2)
  expect(listing.unreadable.map((value) => value.reason)).toEqual(
    expect.arrayContaining([
      'Recovery point must be a real directory',
      'Invalid recovery file path'
    ])
  )
  const newest = await create()
  await retainCheckpoints(recoveryPath, newest.id, { keep: 2 })
  expect(await readdir(recoveryPath)).toEqual(expect.arrayContaining([alias, corrupt.id]))
})

it('distinguishes absent recovery storage from an unreadable recovery root', async () => {
  expect(await inspectCheckpoints(recoveryPath)).toEqual({ checkpoints: [], unreadable: [] })
  await writeFile(recoveryPath, 'not a directory')
  await expect(inspectCheckpoints(recoveryPath)).rejects.toThrow()
})
