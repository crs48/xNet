import { mkdtemp, mkdir, readFile, rm, writeFile, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import {
  createCheckpoint,
  listCheckpoints,
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
