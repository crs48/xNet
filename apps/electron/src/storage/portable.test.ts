import type { SafeStorageLike } from '../main/secure-seed'
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { getOrCreateIdentitySeed } from '../main/identity-seed'
import { loadSeedPhrase, storeSeedPhrase } from '../main/secure-seed'
import { captureDesktopSettings } from '../shared/desktop-settings'
import { createCheckpoint, verifyCheckpoint } from './checkpoints'
import { readDesktopSettings, writeDesktopSettings } from './desktop-settings'
import { exportPortableCheckpoint, unpackPortableCheckpoint } from './portable'

const safe = (mac: string): SafeStorageLike => ({
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`${mac}:${text}`),
  decryptString: (bytes) => {
    const text = bytes.toString()
    if (!text.startsWith(`${mac}:`)) throw new Error('This key belongs to another Mac')
    return text.slice(mac.length + 1)
  }
})
// Production-cost scrypt and fsync run repeatedly; shared CI CPUs need a bounded larger budget.
vi.setConfig({ testTimeout: 60_000 })

const password = 'test-only four random recovery words'
let root: string
let dataPath: string
let recoveryPath: string
let destination: string
let checkpointPath: string
let seed: Uint8Array

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-portable-'))
  dataPath = join(root, 'data')
  recoveryPath = join(root, 'recovery')
  destination = join(root, 'external')
  await mkdir(dataPath)
  await mkdir(destination)
  seed = getOrCreateIdentitySeed(dataPath, safe('first-Mac'), { profile: 'daily' }).seed
  storeSeedPhrase(dataPath, 'fixture recovery mnemonic', safe('first-Mac'))
  for (const name of ['data.db', 'xnet.db']) {
    const db = new Database(join(dataPath, name))
    db.exec("CREATE TABLE notes(body TEXT); INSERT INTO notes VALUES ('private note body')")
    db.close()
  }
  await mkdir(join(dataPath, 'sources'))
  await writeFile(join(dataPath, 'sources', 'export.json'), '{"private":"source evidence"}')
  const point = await createCheckpoint({
    dataPath,
    recoveryPath,
    appVersion: 'fixture',
    profile: 'daily'
  })
  checkpointPath = join(recoveryPath, point.id)
})
afterEach(() => rm(root, { recursive: true, force: true }))
const exportPoint = () =>
  exportPortableCheckpoint({
    checkpointPath,
    destination,
    password,
    safeStorage: safe('first-Mac')
  })
const unpack = (path: string, recoveryPassword = password, output = join(root, 'incoming')) =>
  unpackPortableCheckpoint({
    path,
    output,
    password: recoveryPassword,
    safeStorage: safe('second-Mac')
  })

it('still reads a version-1 backup without desktop settings', async () => {
  // Independent legacy writer: an old backup must not depend on the current export format.
  const format = 'xnet-desktop-portable/1'
  const salt = randomBytes(32)
  const key = scryptSync(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
  const sealLegacy = (bytes: Buffer) => {
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(Buffer.from(format))
    return Buffer.concat([nonce, cipher.update(bytes), cipher.final(), cipher.getAuthTag()])
  }
  const path = join(destination, 'legacy.xnetbackup')
  await mkdir(join(path, 'objects'), { recursive: true })
  const checkpoint = await verifyCheckpoint(checkpointPath)
  const chunks: Record<string, string[]> = {}
  for (const file of checkpoint.files) {
    const encrypted = sealLegacy(await readFile(join(checkpointPath, 'workspace', file.path)))
    const hash = createHash('sha256').update(encrypted).digest('hex')
    chunks[file.path] = [hash]
    await writeFile(join(path, 'objects', hash), encrypted)
  }
  await writeFile(
    join(path, 'header.json'),
    JSON.stringify({ format, kdf: 'scrypt-N131072-r8-p1', salt: salt.toString('base64') })
  )
  await writeFile(
    join(path, 'manifest.enc'),
    sealLegacy(
      Buffer.from(
        JSON.stringify({
          format,
          checkpoint,
          chunks,
          seedB64: Buffer.from(seed).toString('base64'),
          mnemonic: loadSeedPhrase(dataPath, safe('first-Mac'))
        })
      )
    )
  )
  key.fill(0)
  const restored = await unpack(path)
  expect(
    getOrCreateIdentitySeed(restored.workspace, safe('second-Mac'), { profile: 'daily' }).seed
  ).toEqual(seed)
  expect(await readDesktopSettings(restored.workspace, safe('second-Mac'))).toBeNull()
})

it('restores exact content and the same identity without the original Mac key store', async () => {
  const exported = await exportPoint()
  await rm(dataPath, { recursive: true })
  await rm(recoveryPath, { recursive: true })
  const restored = await unpack(exported.path)
  expect(
    getOrCreateIdentitySeed(restored.workspace, safe('second-Mac'), { profile: 'daily' }).seed
  ).toEqual(seed)
  expect(loadSeedPhrase(restored.workspace, safe('second-Mac'))).toBe('fixture recovery mnemonic')
  expect(await readFile(join(restored.workspace, 'sources/export.json'), 'utf8')).toContain(
    'source evidence'
  )
  const db = new Database(join(restored.workspace, 'data.db'), { readonly: true })
  expect(db.prepare('SELECT body FROM notes').get()).toEqual({ body: 'private note body' })
  db.close()
  const local = await createCheckpoint({
    dataPath: restored.workspace,
    recoveryPath,
    profile: 'new-Mac',
    appVersion: 'fixture'
  })
  await verifyCheckpoint(join(recoveryPath, local.id))
  const clear = Buffer.concat(
    await Promise.all(
      (await readdir(exported.path))
        .filter((name) => name !== 'objects')
        .map((name) => readFile(join(exported.path, name)))
    )
  )
  expect(clear.includes(Buffer.from(seed).toString('base64'))).toBe(false)
  expect(clear.includes('private note body')).toBe(false)
})

it('authenticates a multi-chunk file without losing its tail', async () => {
  const bytes = Buffer.alloc(4 * 1024 * 1024 + 53, 42)
  bytes.write('important tail', bytes.length - 14)
  await writeFile(join(dataPath, 'large.bin'), bytes)
  const point = await createCheckpoint({
    dataPath,
    recoveryPath,
    profile: 'daily',
    appVersion: 'fixture'
  })
  checkpointPath = join(recoveryPath, point.id)
  const restored = await unpack((await exportPoint()).path)
  expect(await readFile(join(restored.workspace, 'large.bin'))).toEqual(bytes)
})

it('rewraps preferences, a provider key, and a draft for a different Mac key store', async () => {
  const settings = captureDesktopSettings({ getItem: () => null })
  settings.values['xnet:ai-api-key'] = 'fixture-provider-secret'
  settings.values['xnet.library.capture-draft.v1'] = '{"note":"unfinished private thought"}'
  settings.values['xnet-electron-theme'] = 'light'
  await writeDesktopSettings(dataPath, settings, safe('first-Mac'))
  const point = await createCheckpoint({
    dataPath,
    recoveryPath,
    profile: 'daily',
    appVersion: 'fixture'
  })
  checkpointPath = join(recoveryPath, point.id)
  const exported = await exportPoint()
  await rm(dataPath, { recursive: true })
  await rm(recoveryPath, { recursive: true })
  const restored = await unpack(exported.path)
  expect(await readDesktopSettings(restored.workspace, safe('second-Mac'))).toEqual(settings)
  await expect(readDesktopSettings(restored.workspace, safe('first-Mac'))).rejects.toThrow(
    'another Mac'
  )
  for (const object of await readdir(join(exported.path, 'objects'))) {
    const bytes = await readFile(join(exported.path, 'objects', object))
    expect(bytes.includes('fixture-provider-secret')).toBe(false)
    expect(bytes.includes('unfinished private thought')).toBe(false)
  }
})

it('rejects a wrong password before creating any plaintext output', async () => {
  const exported = await exportPoint()
  await expect(unpack(exported.path, 'wrong recovery password')).rejects.toThrow('Could not unlock')
  expect(await readdir(root)).not.toContain('incoming')
})

it.each(['damage', 'remove'] as const)(
  'rejects %s to a chunk and cleans its disposable output',
  async (action) => {
    const exported = await exportPoint()
    const [name] = await readdir(join(exported.path, 'objects'))
    const path = join(exported.path, 'objects', name)
    if (action === 'remove') await rm(path)
    else await writeFile(path, 'damaged cipher bytes')
    await expect(unpack(exported.path)).rejects.toThrow()
    expect(await readdir(root)).not.toContain('incoming')
    await verifyCheckpoint(checkpointPath)
  }
)

it('never replaces an existing destination workspace', async () => {
  const exported = await exportPoint()
  const before = await readFile(join(dataPath, 'data.db'))
  await expect(unpack(exported.path, password, dataPath)).rejects.toThrow()
  expect(await readFile(join(dataPath, 'data.db'))).toEqual(before)
})

it('rejects a damaged manifest and refuses weak recovery passwords', async () => {
  await expect(
    exportPortableCheckpoint({
      checkpointPath,
      destination,
      password: 'short',
      safeStorage: safe('first-Mac')
    })
  ).rejects.toThrow('12 characters')
  const exported = await exportPoint()
  await writeFile(join(exported.path, 'manifest.enc'), 'damaged')
  await expect(unpack(exported.path)).rejects.toThrow('Could not unlock')
  expect(await readdir(root)).not.toContain('incoming')
})
