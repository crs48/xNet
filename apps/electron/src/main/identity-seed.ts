/**
 * The desktop signing identity's private-key seed (exploration 0335, blocker #1;
 * shipped via 0456).
 *
 * The renderer used to derive its Ed25519 key from a fixed seed baked into
 * source (`makeTestKey`) — anyone reading the repo could reconstruct any
 * default-profile user's private key, and two default profiles collided onto
 * the same DID. The seed is now generated randomly once per profile in the
 * MAIN process, stored under the profile's data directory — encrypted with
 * Electron `safeStorage` when the platform provides it — and handed to the
 * renderer over IPC.
 *
 * Test/dev determinism rides the existing `XNET_TEST_BYPASS` flag (the e2e
 * harness already sets it): in test mode the old profile-mixed deterministic
 * seed is reproduced HERE, so CI keeps stable DIDs and no keychain prompts,
 * and the renderer contains no derivable-key path at all.
 */

import type { SafeStorageLike } from './secure-seed'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type IdentitySeedMode = 'secure' | 'plaintext' | 'test'

export type IdentitySeedResult = {
  /** 32-byte Ed25519 private-key seed. */
  seed: Uint8Array
  /** How the seed is stored: platform-encrypted, plaintext fallback, or deterministic test. */
  mode: IdentitySeedMode
}

type StoredIdentitySeed = {
  version: 1
  /** base64 seed bytes; encrypted via safeStorage unless `plaintext` is true. */
  payload: string
  plaintext?: boolean
  updatedAt: number
}

const SEED_FILE_NAME = 'identity-seed.json'

const isStoredIdentitySeed = (value: unknown): value is StoredIdentitySeed => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<StoredIdentitySeed>
  return (
    candidate.version === 1 &&
    typeof candidate.payload === 'string' &&
    typeof candidate.updatedAt === 'number'
  )
}

/** The pre-0456 deterministic dev/test seed, reproduced for `XNET_TEST_BYPASS`. */
export function deterministicTestSeed(profileName: string): Uint8Array {
  const seed = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
    27, 28, 29, 30, 31, 32
  ])
  for (let i = 0; i < profileName.length; i++) {
    seed[i % 32] ^= profileName.charCodeAt(i)
  }
  return seed
}

/**
 * Load the profile's identity seed, generating and persisting one on first
 * boot. A corrupt or wrong-length stored seed is a loud failure, never a
 * silent regeneration — regenerating would rotate the user's DID behind
 * their back.
 */
export function getOrCreateIdentitySeed(
  dataDir: string,
  safeStorage: SafeStorageLike,
  options: { profile: string; testMode?: boolean }
): IdentitySeedResult {
  if (options.testMode) {
    return { seed: deterministicTestSeed(options.profile), mode: 'test' }
  }

  const filePath = join(dataDir, SEED_FILE_NAME)
  const encryptionAvailable = safeStorage.isEncryptionAvailable()

  if (existsSync(filePath)) {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown
    if (!isStoredIdentitySeed(parsed)) {
      throw new Error(`Stored identity seed at ${filePath} is invalid`)
    }
    const bytes = parsed.plaintext
      ? Buffer.from(parsed.payload, 'base64')
      : Buffer.from(safeStorage.decryptString(Buffer.from(parsed.payload, 'base64')), 'base64')
    if (bytes.length !== 32) {
      throw new Error(`Stored identity seed at ${filePath} has length ${bytes.length}, expected 32`)
    }
    return { seed: new Uint8Array(bytes), mode: parsed.plaintext ? 'plaintext' : 'secure' }
  }

  const seed = randomBytes(32)
  const seedB64 = Buffer.from(seed).toString('base64')
  mkdirSync(dataDir, { recursive: true })

  if (encryptionAvailable) {
    const record: StoredIdentitySeed = {
      version: 1,
      payload: safeStorage.encryptString(seedB64).toString('base64'),
      updatedAt: Date.now()
    }
    writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
    return { seed: new Uint8Array(seed), mode: 'secure' }
  }

  // No platform keystore (e.g. headless Linux without a keyring). A random
  // seed in a mode-0600 file is still categorically better than a seed
  // derivable from public source; say so loudly rather than failing to boot.
  console.warn(
    '[identity-seed] platform secure storage unavailable — storing the signing seed unencrypted at',
    filePath
  )
  const record: StoredIdentitySeed = {
    version: 1,
    payload: seedB64,
    plaintext: true,
    updatedAt: Date.now()
  }
  writeFileSync(filePath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
  return { seed: new Uint8Array(seed), mode: 'plaintext' }
}
