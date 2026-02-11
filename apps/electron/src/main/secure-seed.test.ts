import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSeedPhrase,
  loadSeedPhrase,
  storeSeedPhrase,
  type SafeStorageLike
} from './secure-seed'

const makeSafeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
  decryptString: (data: Buffer) => {
    const decoded = data.toString('utf8')
    if (!decoded.startsWith('enc:')) {
      throw new Error('Invalid encrypted payload')
    }
    return decoded.slice(4)
  }
})

describe('secure-seed', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stores and loads a seed phrase via secure storage', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-seed-test-'))
    dirs.push(dir)

    storeSeedPhrase(dir, '  alpha   beta gamma  ', makeSafeStorage(true))
    const recovered = loadSeedPhrase(dir, makeSafeStorage(true))

    expect(recovered).toBe('alpha beta gamma')
  })

  it('clearSeedPhrase removes stored seed data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-seed-test-'))
    dirs.push(dir)

    storeSeedPhrase(dir, 'alpha beta gamma', makeSafeStorage(true))
    clearSeedPhrase(dir)

    expect(loadSeedPhrase(dir, makeSafeStorage(true))).toBeNull()
  })

  it('throws when secure storage is unavailable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-seed-test-'))
    dirs.push(dir)

    expect(() => storeSeedPhrase(dir, 'alpha beta gamma', makeSafeStorage(false))).toThrow(
      'Platform secure storage is unavailable'
    )
  })

  it('throws when stored seed file is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-seed-test-'))
    dirs.push(dir)
    writeFileSync(
      join(dir, 'seed-recovery.json'),
      JSON.stringify({ version: 1, bad: true }),
      'utf8'
    )

    expect(() => loadSeedPhrase(dir, makeSafeStorage(true))).toThrow(
      'Stored seed record is invalid'
    )
  })
})
