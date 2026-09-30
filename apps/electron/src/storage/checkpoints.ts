import type { CheckpointManifest } from '../shared/recovery'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, open } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import Database from 'better-sqlite3'
import { retainedCheckpointIds } from './checkpoint-policy'

const FORMAT = 'xnet-desktop-checkpoint/1'
const DATABASES = ['data.db', 'xnet.db']
const OPTIONAL_DATABASES = ['library.db']
const REQUIRED = [...DATABASES, 'identity-seed.json']

export type { CheckpointManifest } from '../shared/recovery'

async function digest(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function inventory(root: string, at = root): Promise<{ path: string; stamp: string }[]> {
  if ((await lstat(at)).isSymbolicLink())
    throw new Error('Recovery directory cannot be a symbolic link')
  const entries = await readdir(at, { withFileTypes: true })
  const files: { path: string; stamp: string }[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(at, entry.name)
    if (entry.isSymbolicLink())
      throw new Error(`Recovery copy refuses a symbolic link: ${relative(root, path)}`)
    if (entry.isDirectory()) files.push(...(await inventory(root, path)))
    else if (entry.isFile()) {
      const stat = await lstat(path, { bigint: true })
      files.push({
        path: relative(root, path).split(sep).join('/'),
        stamp: `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
      })
    } else throw new Error(`Unsupported workspace file: ${relative(root, path)}`)
  }
  return files
}

function inventoryFingerprint(files: { path: string; stamp: string }[]): string {
  // Shared-memory reader locks can change without any saved workspace data changing.
  return createHash('sha256')
    .update(JSON.stringify(files.filter((file) => !file.path.endsWith('-shm'))))
    .digest('hex')
}

export async function workspaceFingerprint(dataPath: string): Promise<string> {
  return inventoryFingerprint(await inventory(dataPath))
}

function safePath(root: string, path: string): string {
  if (
    !path ||
    path.includes('\\') ||
    path.split('/').some((part) => part === '..' || part === '.' || part === '')
  )
    throw new Error('Invalid recovery file path')
  const result = resolve(root, path)
  if (!result.startsWith(resolve(root) + sep))
    throw new Error('Recovery file escapes its directory')
  return result
}

async function syncFile(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function normalizeDatabase(path: string): Promise<void> {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  const normalized = `${path}.snapshot`
  try {
    if (db.pragma('quick_check', { simple: true }) !== 'ok')
      throw new Error('Recovery database failed integrity verification')
    await db.backup(normalized)
  } finally {
    db.close()
  }
  const standalone = new Database(normalized)
  try {
    standalone.pragma('journal_mode = DELETE')
  } finally {
    standalone.close()
  }
  await rename(normalized, path)
  for (const suffix of ['-wal', '-shm']) await rm(path + suffix, { force: true })
}

function databaseVersion(path: string): number | undefined {
  const db = new Database(path, { readonly: true, fileMustExist: true })
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = '_schema_version'").get())
      return undefined
    const row = db.prepare('SELECT MAX(version) AS version FROM _schema_version').get() as {
      version: unknown
    }
    if (!Number.isSafeInteger(row.version) || Number(row.version) < 1)
      throw new Error('Recovery source has an invalid storage version')
    return Number(row.version)
  } finally {
    db.close()
  }
}

/** The caller flushes editors first. A changing source fails instead of producing a mixed copy. */
export async function createCheckpoint(options: {
  dataPath: string
  recoveryPath: string
  appVersion: string
  profile: string
  testIdentity?: boolean
  pinned?: boolean
}): Promise<CheckpointManifest> {
  if (
    resolve(options.recoveryPath).startsWith(resolve(options.dataPath) + sep) ||
    resolve(options.recoveryPath) === resolve(options.dataPath)
  )
    throw new Error('Recovery copies must live outside the workspace directory')
  const before = await inventory(options.dataPath)
  for (const name of OPTIONAL_DATABASES) {
    if (
      !before.some((entry) => entry.path === name) &&
      before.some((entry) =>
        ['-wal', '-shm', '-journal'].some((suffix) => entry.path === name + suffix)
      )
    )
      throw new Error(`Recovery copy is missing database with remaining sidecars: ${name}`)
  }
  const required = options.testIdentity ? DATABASES : REQUIRED
  for (const path of required) {
    if (!before.some((entry) => entry.path === path))
      throw new Error(`Recovery copy is missing required content: ${path}`)
  }
  const id = `${Date.now()}-${randomUUID()}`
  const temporary = join(options.recoveryPath, `.incomplete-${id}`)
  const payload = join(temporary, 'workspace')
  await mkdir(payload, { recursive: true, mode: 0o700 })
  try {
    for (const entry of before) {
      const destination = safePath(payload, entry.path)
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
      await copyFile(
        safePath(options.dataPath, entry.path),
        destination,
        constants.COPYFILE_FICLONE
      )
    }
    if (JSON.stringify(before) !== JSON.stringify(await inventory(options.dataPath))) {
      throw new Error(
        'Workspace changed while making a recovery copy. Retry after current work finishes.'
      )
    }
    for (const name of [
      ...DATABASES,
      ...OPTIONAL_DATABASES.filter((name) => before.some((entry) => entry.path === name))
    ])
      await normalizeDatabase(join(payload, name))
    const files: CheckpointManifest['files'] = []
    for (const entry of await inventory(payload)) {
      const path = safePath(payload, entry.path)
      files.push({ path: entry.path, size: (await lstat(path)).size, sha256: await digest(path) })
      await syncFile(path)
      await syncFile(dirname(path))
    }
    const manifest: CheckpointManifest = {
      format: FORMAT,
      id,
      createdAt: new Date().toISOString(),
      appVersion: options.appVersion,
      profile: options.profile,
      identity: options.testIdentity ? 'test' : 'stored',
      sourceFingerprint: inventoryFingerprint(before),
      ...(options.pinned ? { pinned: true } : {}),
      storageVersion: databaseVersion(join(payload, 'data.db')),
      files
    }
    const file = await open(join(temporary, 'manifest.json'), 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(manifest, null, 2))
      await file.sync()
    } finally {
      await file.close()
    }
    await verifyCheckpoint(temporary, { allowTestIdentity: options.testIdentity })
    await syncFile(payload)
    await syncFile(temporary)
    await rename(temporary, join(options.recoveryPath, id))
    await syncFile(options.recoveryPath)
    return manifest
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

async function readManifest(
  path: string,
  options: { allowTestIdentity?: boolean } = {}
): Promise<CheckpointManifest> {
  const parsed: unknown = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'))
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid recovery manifest')
  const manifest = parsed as CheckpointManifest
  if (
    manifest.format !== FORMAT ||
    typeof manifest.id !== 'string' ||
    !/^\d+-[a-f0-9-]{36}$/.test(manifest.id) ||
    !Array.isArray(manifest.files) ||
    typeof manifest.appVersion !== 'string' ||
    typeof manifest.profile !== 'string' ||
    typeof manifest.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !['stored', 'test'].includes(manifest.identity)
  )
    throw new Error('Unsupported recovery manifest')
  if (
    (manifest.sourceFingerprint !== undefined &&
      (typeof manifest.sourceFingerprint !== 'string' ||
        !/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint))) ||
    (manifest.pinned !== undefined && typeof manifest.pinned !== 'boolean') ||
    (manifest.storageVersion !== undefined &&
      (!Number.isSafeInteger(manifest.storageVersion) || manifest.storageVersion < 1))
  )
    throw new Error('Invalid recovery policy metadata')
  if (manifest.identity === 'test' && !options.allowTestIdentity)
    throw new Error('A test identity cannot restore a daily workspace')
  const files = manifest.files
  if (
    files.some(
      (file) =>
        !file ||
        typeof file.path !== 'string' ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        typeof file.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(file.sha256)
    )
  )
    throw new Error('Invalid recovery file inventory')
  if (new Set(files.map((file) => file.path)).size !== files.length)
    throw new Error('Duplicate recovery files')
  const required = manifest.identity === 'test' ? DATABASES : REQUIRED
  for (const name of required)
    if (!files.some((file) => file.path === name))
      throw new Error(`Incomplete recovery copy: ${name}`)
  return manifest
}

export async function verifyCheckpoint(
  path: string,
  options: { allowTestIdentity?: boolean } = {}
): Promise<CheckpointManifest> {
  const manifest = await readManifest(path, options)
  const files = manifest.files
  const payload = join(path, 'workspace')
  const actual = (await inventory(payload)).map((file) => file.path).sort()
  if (JSON.stringify(actual) !== JSON.stringify(files.map((file) => file.path).sort()))
    throw new Error('Recovery file inventory does not match')
  for (const file of files) {
    const stored = safePath(payload, file.path)
    if ((await lstat(stored)).size !== file.size || (await digest(stored)) !== file.sha256)
      throw new Error(`Recovery file verification failed: ${file.path}`)
  }
  for (const name of [
    ...DATABASES,
    ...OPTIONAL_DATABASES.filter((name) => manifest.files.some((entry) => entry.path === name))
  ]) {
    const db = new Database(join(payload, name), { readonly: true, fileMustExist: true })
    try {
      if (db.pragma('quick_check', { simple: true }) !== 'ok')
        throw new Error(`Recovery database is unreadable: ${name}`)
    } finally {
      db.close()
    }
  }
  return manifest
}

export async function listCheckpoints(recoveryPath: string): Promise<CheckpointManifest[]> {
  let names: string[]
  try {
    names = await readdir(recoveryPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const checkpoints: CheckpointManifest[] = []
  for (const name of names
    .filter((name) => /^\d+-[a-f0-9-]{36}$/.test(name))
    .sort()
    .reverse()) {
    // Listing is cheap; Restore always verifies every byte again.
    const value = await readManifest(join(recoveryPath, name), { allowTestIdentity: true })
    if (value.id !== name) throw new Error(`Unreadable recovery point: ${name}`)
    checkpoints.push(value)
  }
  return checkpoints
}

/** Prune only after a new, complete point has passed verification. Preserved originals are separate. */
export async function retainCheckpoints(
  recoveryPath: string,
  verifiedId: string,
  options: { keep?: number; allowTestIdentity?: boolean } = {}
): Promise<void> {
  const keep = options.keep
  if (keep !== undefined && (!Number.isSafeInteger(keep) || keep < 2))
    throw new Error('Keep at least two recovery copies')
  if (!/^\d+-[a-f0-9-]{36}$/.test(verifiedId)) throw new Error('Invalid recovery point')
  await verifyCheckpoint(join(recoveryPath, verifiedId), options)
  const points = await listCheckpoints(recoveryPath)
  const retained =
    keep === undefined
      ? retainedCheckpointIds(points, Date.now())
      : new Set(points.slice(0, keep).map((point) => point.id))
  retained.add(verifiedId)
  for (const point of points) {
    if (point.pinned) retained.add(point.id)
    if (!retained.has(point.id)) await rm(join(recoveryPath, point.id), { recursive: true })
  }
  await syncFile(recoveryPath)
}
