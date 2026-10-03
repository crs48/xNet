import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { retainImportSource } from './import-sources'

let root: string
let dataPath: string
let sourcePath: string
const bytes = '{"private":"source evidence"}'
const expectedHash = createHash('sha256').update(bytes).digest('hex')
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-source-custody-'))
  dataPath = join(root, 'workspace')
  sourcePath = join(root, 'export.json')
  await mkdir(dataPath)
  await writeFile(sourcePath, bytes)
})
afterEach(() => rm(root, { recursive: true, force: true }))
const retain = () => retainImportSource({ dataPath, sourcePath, expectedHash })

it('keeps private exact bytes usable after the original export is removed', async () => {
  const path = await retain()
  expect(await readFile(sourcePath, 'utf8')).toBe(bytes)
  expect((await stat(path)).mode & 0o777).toBe(0o600)
  await rm(sourcePath)
  expect(await readFile(path, 'utf8')).toBe(bytes)
  expect(await retain()).toBe(path)
})

it('rejects a changed archive before promoting it', async () => {
  await writeFile(sourcePath, 'changed after review')
  await expect(retain()).rejects.toThrow('differs from the reviewed archive')
  expect(await readdir(join(dataPath, 'import-sources'))).toEqual([])
})

it('detects damaged retained evidence without overwriting it', async () => {
  const path = await retain()
  await writeFile(path, 'damaged')
  await expect(retain()).rejects.toThrow('differs')
  expect(await readFile(path, 'utf8')).toBe('damaged')
})

it('handles concurrent imports of the same archive', async () => {
  const paths = await Promise.all([retain(), retain()])
  expect(paths[0]).toBe(paths[1])
  expect(await readdir(join(dataPath, 'import-sources'))).toEqual([expectedHash])
})

it('refuses symbolic links and invalid fingerprints', async () => {
  await symlink(sourcePath, join(root, 'link.json'))
  await expect(
    retainImportSource({ dataPath, sourcePath: join(root, 'link.json'), expectedHash })
  ).rejects.toThrow('regular file')
  await expect(
    retainImportSource({ dataPath, sourcePath, expectedHash: '../escape' })
  ).rejects.toThrow('fingerprint')
})
