import type { SafeStorageLike } from '../main/secure-seed'
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import {
  captureDesktopSettings,
  restoreDesktopSettings,
  validateDesktopSettings
} from '../shared/desktop-settings'
import { readDesktopSettings, SETTINGS_FILE, writeDesktopSettings } from './desktop-settings'

const safe: SafeStorageLike = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`fixture:${value}`),
  decryptString: (bytes) => {
    if (!bytes.toString().startsWith('fixture:')) throw new Error('Cannot decrypt')
    return bytes.toString().slice(8)
  }
}
const memoryStorage = () => {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    }
  }
}
const fixture = () =>
  captureDesktopSettings({
    getItem: (key) => (key === 'xnet:ai-api-key' ? 'test-only-secret' : null)
  })
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'xnet-settings-'))
})
afterEach(() => rm(root, { recursive: true, force: true }))

it('distinguishes absent settings from damaged settings and preserves damaged bytes', async () => {
  expect(await readDesktopSettings(root, safe)).toBeNull()
  await writeFile(join(root, SETTINGS_FILE), '{broken')
  await expect(readDesktopSettings(root, safe)).rejects.toThrow()
  await expect(writeDesktopSettings(root, fixture(), safe)).rejects.toThrow()
  expect(await readFile(join(root, SETTINGS_FILE), 'utf8')).toBe('{broken')
})

it('writes privately and leaves an unchanged snapshot untouched', async () => {
  await writeDesktopSettings(root, fixture(), safe)
  const before = await stat(join(root, SETTINGS_FILE))
  expect(before.mode & 0o777).toBe(0o600)
  expect(await readDesktopSettings(root, safe)).toEqual(fixture())
  await writeDesktopSettings(root, fixture(), safe)
  expect((await stat(join(root, SETTINGS_FILE))).mtimeMs).toBe(before.mtimeMs)
  expect(await readdir(root)).toEqual([SETTINGS_FILE])
})

it('does not include decrypted credentials in a parse failure', async () => {
  await writeFile(
    join(root, SETTINGS_FILE),
    JSON.stringify({
      version: 1,
      payload: safe.encryptString('{"secret":"do-not-print-this-key", broken').toString('base64')
    })
  )
  const error = await readDesktopSettings(root, safe).catch((failure: unknown) => failure)
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toContain('invalid JSON')
  expect((error as Error).message).not.toContain('do-not-print')
})

it('refuses a locked key store, failed encryption, and a symlink without replacing data', async () => {
  await writeDesktopSettings(root, fixture(), safe)
  const before = await readFile(join(root, SETTINGS_FILE))
  const locked = { ...safe, isEncryptionAvailable: () => false }
  await expect(readDesktopSettings(root, locked)).rejects.toThrow('Unlock')
  await expect(writeDesktopSettings(root, fixture(), locked)).rejects.toThrow('Unlock')
  const changed = fixture()
  changed.values['xnet-electron-theme'] = 'light'
  await expect(
    writeDesktopSettings(root, changed, {
      ...safe,
      encryptString: () => {
        throw new Error('key store failed')
      }
    })
  ).rejects.toThrow('key store failed')
  expect(await readFile(join(root, SETTINGS_FILE))).toEqual(before)
  await rm(join(root, SETTINGS_FILE))
  await writeFile(join(root, 'original'), before)
  await symlink(join(root, 'original'), join(root, SETTINGS_FILE))
  await expect(writeDesktopSettings(root, fixture(), safe)).rejects.toThrow('Invalid')
  expect(await readFile(join(root, 'original'))).toEqual(before)
})

it('rejects incomplete and future contracts rather than silently losing keys', () => {
  expect(() => validateDesktopSettings({ version: 2, values: {} })).toThrow('version')
  expect(() => validateDesktopSettings({ version: 1, values: {} })).toThrow('Incomplete')
  expect(() =>
    validateDesktopSettings({ ...fixture(), values: { ...fixture().values, unknown: 'value' } })
  ).toThrow('unsupported')
})

it('restores before first use, removes absent values, and excludes device authorizations', () => {
  const storage = memoryStorage()
  storage.setItem('xnet-electron-theme', 'stale')
  storage.setItem('xnet:ai-bridge-token', 'old-device')
  storage.setItem('xnet:ai-openrouter-verifier', 'old-request')
  restoreDesktopSettings(storage, { settings: fixture(), restoreId: 'restore-one' })
  expect(storage.getItem('xnet:ai-api-key')).toBe('test-only-secret')
  expect(storage.getItem('xnet-electron-theme')).toBeNull()
  expect(storage.getItem('xnet:ai-bridge-token')).toBeNull()
  expect(storage.getItem('xnet:ai-openrouter-verifier')).toBeNull()
})

it('preserves newer edits on normal restarts and applies each explicit restore once', () => {
  const storage = memoryStorage()
  const recovery = { settings: fixture(), restoreId: 'restore-one' }
  restoreDesktopSettings(storage, recovery)
  storage.setItem('xnet:ai-api-key', 'newer-setting')
  restoreDesktopSettings(storage, recovery)
  restoreDesktopSettings(storage, { ...recovery, restoreId: null })
  expect(storage.getItem('xnet:ai-api-key')).toBe('newer-setting')
  restoreDesktopSettings(storage, { ...recovery, restoreId: 'restore-two' })
  expect(storage.getItem('xnet:ai-api-key')).toBe('test-only-secret')
})

it('does not mark an interrupted application complete and retries all settings', () => {
  const storage = memoryStorage()
  const recovery = { settings: fixture(), restoreId: 'restore-one' }
  expect(() =>
    restoreDesktopSettings(
      {
        ...storage,
        setItem: () => {
          throw new Error('quota')
        }
      },
      recovery
    )
  ).toThrow('quota')
  restoreDesktopSettings(storage, recovery)
  expect(storage.getItem('xnet:ai-api-key')).toBe('test-only-secret')
})

it('does not collect arbitrary browser keys or authorization tokens', () => {
  const storage = memoryStorage()
  storage.setItem('xnet:test:bypass', 'true')
  storage.setItem('xnet:ai-openrouter-verifier', 'private')
  storage.setItem('xnet:ai-bridge-token', 'private')
  expect(JSON.stringify(captureDesktopSettings(storage))).not.toMatch(/private|bypass/)
})
