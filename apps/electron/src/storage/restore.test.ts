import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCheckpoint } from './checkpoints'
import { restoreCheckpoint, recoverPendingRestore } from './restore'

let root: string
let dataPath: string
let recoveryPath: string
let id: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-restore-'))
  dataPath = join(root, 'data')
  recoveryPath = join(root, 'recovery')
  await mkdir(dataPath)
  for (const name of ['data.db', 'xnet.db']) {
    const db = new Database(join(dataPath, name))
    db.exec('CREATE TABLE notes (body TEXT)')
    db.close()
  }
  await writeFile(join(dataPath, 'identity-seed.json'), 'same key bytes')
  await writeFile(join(dataPath, 'note.txt'), 'before update')
  id = (await createCheckpoint({ dataPath, recoveryPath, profile: 'daily', appVersion: 'test' })).id
  await writeFile(join(dataPath, 'note.txt'), 'newer work')
})
afterEach(() => rm(root, { recursive: true, force: true }))

describe('restore with retained generations', () => {
  it('restores a verified point and preserves all newer work', async () => {
    await restoreCheckpoint({ id, dataPath, recoveryPath, profile: 'daily' })
    expect(await readFile(join(dataPath, 'note.txt'), 'utf8')).toBe('before update')
    const [generation] = await readdir(join(recoveryPath, 'preserved'))
    expect(await readFile(join(recoveryPath, 'preserved', generation, 'note.txt'), 'utf8')).toBe(
      'newer work'
    )
    expect(await readFile(join(dataPath, 'identity-seed.json'), 'utf8')).toBe('same key bytes')
    expect(
      JSON.parse(await readFile(join(recoveryPath, 'review-required.json'), 'utf8')).version
    ).toBe(1)
  })

  it('rejects tampering before replacing the live workspace', async () => {
    await writeFile(join(recoveryPath, id, 'workspace/note.txt'), 'tampered')
    await expect(
      restoreCheckpoint({ id, dataPath, recoveryPath, profile: 'daily' })
    ).rejects.toThrow('verification failed')
    expect(await readFile(join(dataPath, 'note.txt'), 'utf8')).toBe('newer work')
  })

  it.each(['before-rename', 'between-renames', 'after-promotion'] as const)(
    'resumes a crash %s before normal database startup',
    async (phase) => {
      const candidate = join(recoveryPath, 'restore', id)
      await cp(join(recoveryPath, id), candidate, { recursive: true })
      await writeFile(
        join(recoveryPath, 'pending-restore.json'),
        JSON.stringify({ version: 1, id })
      )
      if (phase !== 'before-rename') {
        await mkdir(join(recoveryPath, 'preserved'))
        await rename(dataPath, join(recoveryPath, 'preserved', id))
      }
      if (phase === 'after-promotion') await rename(join(candidate, 'workspace'), dataPath)
      await recoverPendingRestore(dataPath, recoveryPath)
      expect(await readFile(join(dataPath, 'note.txt'), 'utf8')).toBe('before update')
      expect(await readFile(join(recoveryPath, 'preserved', id, 'note.txt'), 'utf8')).toBe(
        'newer work'
      )
      await expect(readFile(join(recoveryPath, 'pending-restore.json'))).rejects.toMatchObject({
        code: 'ENOENT'
      })
    }
  )

  it('does not let a journal choose paths outside recovery storage', async () => {
    await writeFile(
      join(recoveryPath, 'pending-restore.json'),
      JSON.stringify({ version: 1, id: '../../outside' })
    )
    await expect(recoverPendingRestore(dataPath, recoveryPath)).rejects.toThrow(
      'Unreadable restore journal'
    )
    expect(await readFile(join(dataPath, 'note.txt'), 'utf8')).toBe('newer work')
  })
})
