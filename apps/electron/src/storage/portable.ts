import type { SafeStorageLike } from '../main/secure-seed'
import type { DesktopSettings } from '../shared/desktop-settings'
import type { CheckpointManifest } from '../shared/recovery'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scrypt
} from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { getOrCreateIdentitySeed } from '../main/identity-seed'
import { loadSeedPhrase, storeSeedPhrase } from '../main/secure-seed'
import { validateDesktopSettings } from '../shared/desktop-settings'
import { verifyCheckpoint } from './checkpoints'
import { readDesktopSettings, SETTINGS_FILE, writeDesktopSettings } from './desktop-settings'

const FORMAT = 'xnet-desktop-portable/2'
const LEGACY_FORMAT = 'xnet-desktop-portable/1'
const NONCE_SIZE = 12
const TAG_SIZE = 16
const CHUNK_BYTES = 4 * 1024 * 1024
const MANIFEST_LIMIT = 64 * 1024 * 1024
const KDF = 'scrypt-N131072-r8-p1'
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

type PortableManifest = {
  format: typeof FORMAT | typeof LEGACY_FORMAT
  checkpoint: CheckpointManifest
  seedB64: string
  mnemonic: string | null
  desktopSettings?: DesktopSettings | null
  chunks: Record<string, string[]>
}

function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 1024)
    throw new Error(
      'Use a recovery password of at least 12 characters, preferably several random words.'
    )
}

async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  validatePassword(password)
  return new Promise((resolveKey, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolveKey(key))
    )
  )
}

function seal(bytes: Uint8Array, key: Uint8Array): Buffer {
  const nonce = randomBytes(NONCE_SIZE)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(FORMAT))
  return Buffer.concat([nonce, cipher.update(bytes), cipher.final(), cipher.getAuthTag()])
}

function unseal(bytes: Uint8Array, key: Uint8Array, format: string): Uint8Array {
  if (bytes.length < NONCE_SIZE + TAG_SIZE) throw new Error('Incomplete encrypted recovery object')
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, NONCE_SIZE))
  decipher.setAAD(Buffer.from(format))
  decipher.setAuthTag(bytes.subarray(bytes.length - TAG_SIZE))
  return Buffer.concat([decipher.update(bytes.subarray(NONCE_SIZE, -TAG_SIZE)), decipher.final()])
}

function safePath(root: string, path: string): string {
  if (
    !path ||
    path.includes('\\') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid portable recovery path')
  const target = resolve(root, path)
  if (!target.startsWith(resolve(root) + sep))
    throw new Error('Portable recovery path escapes its directory')
  return target
}

async function sync(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readBounded(path: string, limit: number): Promise<Buffer> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit)
    throw new Error('Invalid or oversized portable recovery object')
  const bytes = await readFile(path)
  if (bytes.length !== info.size || bytes.length > limit)
    throw new Error('Portable recovery object changed during reading')
  return bytes
}

async function writePrivate(path: string, bytes: Uint8Array): Promise<void> {
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
}

/** Encrypt a verified native point. No plaintext keys or filenames enter the destination. */
export async function exportPortableCheckpoint(options: {
  checkpointPath: string
  destination: string
  password: string
  safeStorage: SafeStorageLike
  allowTestIdentity?: boolean
}): Promise<{ path: string; createdAt: string; files: number; bytes: number }> {
  const checkpoint = await verifyCheckpoint(options.checkpointPath, options)
  const workspace = join(options.checkpointPath, 'workspace')
  const destination = resolve(options.destination)
  if (
    destination === resolve(options.checkpointPath) ||
    destination.startsWith(resolve(options.checkpointPath) + sep)
  )
    throw new Error('Choose a backup destination outside the recovery point')
  const targetInfo = await lstat(destination)
  if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink())
    throw new Error('Choose a regular backup directory')
  const salt = randomBytes(32)
  const key = await deriveKey(options.password, salt)
  const id = `xnet-${Date.now()}-${randomUUID()}.xnetbackup`
  const temporary = join(destination, `.${id}.incomplete`)
  const finalPath = join(destination, id)
  let sourceIdentity: ReturnType<typeof getOrCreateIdentitySeed> | undefined
  try {
    sourceIdentity = getOrCreateIdentitySeed(workspace, options.safeStorage, {
      profile: checkpoint.profile,
      testMode: checkpoint.identity === 'test'
    })
    const mnemonic = loadSeedPhrase(workspace, options.safeStorage)
    const desktopSettings = await readDesktopSettings(workspace, options.safeStorage)
    await mkdir(join(temporary, 'objects'), { recursive: true, mode: 0o700 })
    const chunks: Record<string, string[]> = Object.create(null) as Record<string, string[]>
    for (const file of checkpoint.files) {
      const objects: string[] = []
      for await (const bytes of createReadStream(safePath(workspace, file.path), {
        highWaterMark: CHUNK_BYTES
      })) {
        const encrypted = seal(bytes as Buffer, key)
        const objectId = hash(encrypted)
        await writePrivate(join(temporary, 'objects', objectId), encrypted)
        objects.push(objectId)
      }
      chunks[file.path] = objects
    }
    const manifest: PortableManifest = {
      format: FORMAT,
      checkpoint,
      seedB64: Buffer.from(sourceIdentity.seed).toString('base64'),
      mnemonic,
      desktopSettings,
      chunks
    }
    const encodedManifest = Buffer.from(JSON.stringify(manifest))
    if (encodedManifest.length > MANIFEST_LIMIT)
      throw new Error('Recovery manifest exceeds its supported size')
    await writePrivate(join(temporary, 'manifest.enc'), seal(encodedManifest, key))
    encodedManifest.fill(0)
    await writePrivate(
      join(temporary, 'header.json'),
      Buffer.from(JSON.stringify({ format: FORMAT, kdf: KDF, salt: salt.toString('base64') }))
    )
    // Authentication and every plaintext hash must pass before publishing the encrypted folder.
    const verified = await readManifest(temporary, options.password)
    try {
      await verifyObjects(temporary, verified.manifest, verified.key)
    } finally {
      verified.key.fill(0)
    }
    await sync(join(temporary, 'objects'))
    await sync(temporary)
    await rename(temporary, finalPath)
    await sync(destination)
    return {
      path: finalPath,
      createdAt: checkpoint.createdAt,
      files: checkpoint.files.length,
      bytes: checkpoint.files.reduce((sum, file) => sum + file.size, 0)
    }
  } finally {
    key.fill(0)
    sourceIdentity?.seed.fill(0)
    await rm(temporary, { recursive: true, force: true })
  }
}

async function readManifest(
  path: string,
  password: string
): Promise<{ manifest: PortableManifest; key: Buffer }> {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Choose a regular encrypted backup directory')
  const header: unknown = JSON.parse(
    (await readBounded(join(path, 'header.json'), 4096)).toString('utf8')
  )
  if (
    !isRecord(header) ||
    (header.format !== FORMAT && header.format !== LEGACY_FORMAT) ||
    header.kdf !== KDF ||
    typeof header.salt !== 'string'
  )
    throw new Error('Unsupported portable recovery format')
  const salt = Buffer.from(header.salt, 'base64')
  if (salt.length !== 32 || salt.toString('base64') !== header.salt)
    throw new Error('Invalid recovery salt')
  const key = await deriveKey(password, salt)
  try {
    const encoded = await readBounded(
      join(path, 'manifest.enc'),
      MANIFEST_LIMIT + NONCE_SIZE + TAG_SIZE
    )
    const bytes = unseal(encoded, key, header.format)
    const value: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'))
    bytes.fill(0)
    if (
      !isRecord(value) ||
      value.format !== header.format ||
      !isRecord(value.checkpoint) ||
      !Array.isArray(value.checkpoint.files) ||
      !isRecord(value.chunks) ||
      typeof value.seedB64 !== 'string' ||
      (value.mnemonic !== null && typeof value.mnemonic !== 'string')
    )
      throw new Error('Invalid portable recovery manifest')
    const seed = Buffer.from(value.seedB64, 'base64')
    if (seed.length !== 32 || seed.toString('base64') !== value.seedB64)
      throw new Error('Invalid portable identity')
    seed.fill(0)
    const manifest = value as unknown as PortableManifest
    const hasSettings = manifest.checkpoint.files.some((file) => file?.path === SETTINGS_FILE)
    if (manifest.format === FORMAT) {
      if (manifest.desktopSettings !== null) validateDesktopSettings(manifest.desktopSettings)
      if (hasSettings !== (manifest.desktopSettings !== null))
        throw new Error('Portable desktop settings do not match the checkpoint inventory')
    } else if (hasSettings) {
      throw new Error('This legacy backup cannot rewrap desktop settings')
    }
    const paths = new Set<string>()
    for (const file of manifest.checkpoint.files) {
      if (
        !file ||
        typeof file.path !== 'string' ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
      )
        throw new Error('Invalid portable file inventory')
      safePath('/workspace', file.path)
      if (paths.has(file.path)) throw new Error('Duplicate portable file path')
      paths.add(file.path)
      const objects = manifest.chunks[file.path]
      if (
        !Array.isArray(objects) ||
        objects.some((id) => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))
      )
        throw new Error('Invalid encrypted recovery object list')
    }
    if (paths.size !== Object.keys(manifest.chunks).length)
      throw new Error('Portable inventory does not match')
    return { manifest, key }
  } catch (error) {
    key.fill(0)
    throw new Error(
      'Could not unlock this backup. Check the password and that the copy is complete.',
      { cause: error }
    )
  }
}

async function verifyObjects(
  path: string,
  manifest: PortableManifest,
  key: Buffer,
  output?: string
): Promise<void> {
  const expectedObjects = new Set(Object.values(manifest.chunks).flat())
  const directoryInfo = await lstat(join(path, 'objects'))
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())
    throw new Error('Invalid recovery objects directory')
  const actual = await readdir(join(path, 'objects'))
  if (actual.length !== expectedObjects.size || actual.some((name) => !expectedObjects.has(name)))
    throw new Error('Encrypted recovery objects are missing or unexpected')
  for (const file of manifest.checkpoint.files) {
    const digest = createHash('sha256')
    let size = 0
    const target = output ? safePath(output, file.path) : null
    if (target) await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    const handle = target ? await open(target, 'wx', 0o600) : null
    try {
      for (const id of manifest.chunks[file.path]) {
        const encrypted = await readBounded(
          join(path, 'objects', id),
          CHUNK_BYTES + NONCE_SIZE + TAG_SIZE
        )
        if (hash(encrypted) !== id) throw new Error('Encrypted recovery object is damaged')
        const bytes = unseal(encrypted, key, manifest.format)
        size += bytes.byteLength
        if (size > file.size) throw new Error('Recovered file exceeds the recorded size')
        digest.update(bytes)
        if (handle) await handle.writeFile(bytes)
        bytes.fill(0)
      }
      if (size !== file.size || digest.digest('hex') !== file.sha256)
        throw new Error(`Recovered file is incomplete or damaged: ${file.path}`)
      if (handle) await handle.sync()
    } finally {
      await handle?.close()
    }
  }
}

/** Recover into a NEW private directory only. Live workspace replacement is a separate step. */
export async function unpackPortableCheckpoint(options: {
  path: string
  output: string
  password: string
  safeStorage: SafeStorageLike
  allowTestIdentity?: boolean
}): Promise<{ source: CheckpointManifest; workspace: string }> {
  const { manifest, key } = await readManifest(options.path, options.password)
  let created = false
  try {
    if (!options.safeStorage.isEncryptionAvailable())
      throw new Error('Unlock the destination Mac key store before restoring the identity.')
    await mkdir(options.output, { mode: 0o700 })
    created = true
    const workspace = join(options.output, 'workspace')
    await mkdir(workspace, { mode: 0o700 })
    await verifyObjects(options.path, manifest, key, workspace)
    await writePrivate(
      join(options.output, 'manifest.json'),
      Buffer.from(JSON.stringify(manifest.checkpoint))
    )
    await verifyCheckpoint(options.output, options)
    // The following rewrapping changes native file hashes; the caller creates a fresh local point.
    await rm(join(options.output, 'manifest.json'))
    // The authenticated export carries the actual seed, so the old Mac's key store is unnecessary.
    await writeFile(
      join(workspace, 'identity-seed.json'),
      JSON.stringify({
        version: 1,
        payload: options.safeStorage.encryptString(manifest.seedB64).toString('base64'),
        updatedAt: Date.now()
      }),
      { mode: 0o600 }
    )
    if (manifest.mnemonic !== null)
      storeSeedPhrase(workspace, manifest.mnemonic, options.safeStorage)
    if (manifest.desktopSettings)
      await writeDesktopSettings(workspace, manifest.desktopSettings, options.safeStorage, {
        rewrap: true
      })
    await sync(join(workspace, 'identity-seed.json'))
    if (manifest.mnemonic !== null) await sync(join(workspace, 'seed-recovery.json'))
    await sync(workspace)
    return { source: manifest.checkpoint, workspace }
  } catch (error) {
    if (created) await rm(options.output, { recursive: true, force: true })
    throw error
  } finally {
    key.fill(0)
  }
}
