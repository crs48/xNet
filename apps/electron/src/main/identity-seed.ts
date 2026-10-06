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
import { randomBytes, randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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
    Number.isFinite(candidate.updatedAt) &&
    (candidate.plaintext === undefined || typeof candidate.plaintext === 'boolean')
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

  let stored: string | undefined
  try {
    stored = readFileSync(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (stored !== undefined) {
    const parsed = JSON.parse(stored) as unknown
    if (!isStoredIdentitySeed(parsed)) {
      throw new Error(`Stored identity seed at ${filePath} is invalid`)
    }
    if (!parsed.plaintext && !encryptionAvailable)
      throw new Error(
        'The platform key store is unavailable. Unlock it before opening this workspace.'
      )
    const encoded = parsed.plaintext
      ? parsed.payload
      : safeStorage.decryptString(Buffer.from(parsed.payload, 'base64'))
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.toString('base64') !== encoded)
      throw new Error('Stored identity seed encoding is invalid')
    if (bytes.length !== 32) {
      throw new Error(`Stored identity seed at ${filePath} has length ${bytes.length}, expected 32`)
    }
    return { seed: new Uint8Array(bytes), mode: parsed.plaintext ? 'plaintext' : 'secure' }
  }

  for (const name of ['data.db', 'xnet.db']) {
    try {
      lstatSync(join(dataDir, name))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    throw new Error(
      'The workspace identity is missing. Restore its identity and data together; a new identity was not created.'
    )
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
    persistNewIdentity(filePath, dataDir, record)
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
  persistNewIdentity(filePath, dataDir, record)
  return { seed: new Uint8Array(seed), mode: 'plaintext' }
}

function persistNewIdentity(path: string, directory: string, record: StoredIdentitySeed): void {
  const temporary = `${path}.incomplete-${randomUUID()}`
  try {
    const file = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(file, JSON.stringify(record), 'utf8')
      fsyncSync(file)
    } finally {
      closeSync(file)
    }
    // Exclusive promotion cannot replace a seed created by another writer.
    linkSync(temporary, path)
    const parent = openSync(directory, 'r')
    try {
      fsyncSync(parent)
    } finally {
      closeSync(parent)
    }
  } finally {
    rmSync(temporary, { force: true })
  }
}
