/**
 * Identity-seed provider (0335 blocker #1 / 0456): the seed must be random and
 * persistent per profile, never derivable from source outside test mode, and a
 * corrupt store must fail loudly instead of silently rotating the DID.
 */

import type { SafeStorageLike } from './secure-seed'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { deterministicTestSeed, getOrCreateIdentitySeed } from './identity-seed'

const makeSafeStorage = (available = true): SafeStorageLike => ({
  isEncryptionAvailable: () => available,
  encryptString: (text: string) => Buffer.from(`enc:${text}`, 'utf8'),
  decryptString: (data: Buffer) => {
    const decoded = data.toString('utf8')
    if (!decoded.startsWith('enc:')) throw new Error('Invalid encrypted payload')
    return decoded.slice(4)
  }
})

describe('identity-seed', () => {
  const dirs: string[] = []
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), 'xnet-identity-seed-'))
    dirs.push(dir)
    return dir
  }

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('generates a random 32-byte seed and persists it encrypted', () => {
    const dir = tempDir()
    const first = getOrCreateIdentitySeed(dir, makeSafeStorage(true), { profile: 'default' })
    expect(first.mode).toBe('secure')
    expect(first.seed).toHaveLength(32)
    // Not the old deterministic seed.
    expect(first.seed).not.toEqual(deterministicTestSeed('default'))

    // Stable across boots.
    const second = getOrCreateIdentitySeed(dir, makeSafeStorage(true), { profile: 'default' })
    expect(second.seed).toEqual(first.seed)

    // Nothing seed-shaped in the clear on disk.
    const raw = readFileSync(join(dir, 'identity-seed.json'), 'utf8')
    expect(raw).not.toContain(Buffer.from(first.seed).toString('base64'))
  })

  it('two profiles get independent seeds', () => {
    const a = getOrCreateIdentitySeed(tempDir(), makeSafeStorage(true), { profile: 'default' })
    const b = getOrCreateIdentitySeed(tempDir(), makeSafeStorage(true), { profile: 'default' })
    expect(a.seed).not.toEqual(b.seed)
  })

  it('falls back to a plaintext file when secure storage is unavailable', () => {
    const dir = tempDir()
    const result = getOrCreateIdentitySeed(dir, makeSafeStorage(false), { profile: 'default' })
    expect(result.mode).toBe('plaintext')
    expect(result.seed).toHaveLength(32)
    // Still readable on the next boot.
    const again = getOrCreateIdentitySeed(dir, makeSafeStorage(false), { profile: 'default' })
    expect(again.seed).toEqual(result.seed)
  })

  it('test mode reproduces the deterministic profile-mixed seed', () => {
    const dir = tempDir()
    const result = getOrCreateIdentitySeed(dir, makeSafeStorage(true), {
      profile: 'wt-demo',
      testMode: true
    })
    expect(result.mode).toBe('test')
    expect(result.seed).toEqual(deterministicTestSeed('wt-demo'))
    // Test mode must not write anything to disk.
    expect(() => readFileSync(join(dir, 'identity-seed.json'))).toThrow()
  })

  it('a corrupt stored seed fails loudly instead of regenerating', () => {
    const dir = tempDir()
    getOrCreateIdentitySeed(dir, makeSafeStorage(true), { profile: 'default' })
    writeFileSync(join(dir, 'identity-seed.json'), JSON.stringify({ version: 1, payload: 42 }))
    expect(() =>
      getOrCreateIdentitySeed(dir, makeSafeStorage(true), { profile: 'default' })
    ).toThrow(/invalid/)
  })
})
