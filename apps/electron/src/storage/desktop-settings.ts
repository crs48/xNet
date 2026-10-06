import type { SafeStorageLike } from '../main/secure-seed'
import type { DesktopSettings } from '../shared/desktop-settings'
import { randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { SETTINGS_LIMIT, validateDesktopSettings } from '../shared/desktop-settings'

export const SETTINGS_FILE = 'desktop-settings.json'

function parseSettingsJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // JSON parser messages may include the input, which can contain a provider key.
    throw new Error('Desktop settings contain invalid JSON. The existing file has been preserved.')
  }
}

export async function readDesktopSettings(
  dataPath: string,
  safeStorage: SafeStorageLike
): Promise<DesktopSettings | null> {
  const path = join(dataPath, SETTINGS_FILE)
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > SETTINGS_LIMIT * 2)
      throw new Error('Invalid desktop settings file')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Unlock the Mac key store to read desktop settings.')
  const file = parseSettingsJson(await readFile(path, 'utf8'))
  if (
    !file ||
    typeof file !== 'object' ||
    !('version' in file) ||
    file.version !== 1 ||
    !('payload' in file) ||
    typeof file.payload !== 'string'
  )
    throw new Error('Unsupported desktop settings file')
  const bytes = Buffer.from(file.payload, 'base64')
  if (!bytes.length || bytes.toString('base64') !== file.payload)
    throw new Error('Invalid desktop settings ciphertext')
  return validateDesktopSettings(parseSettingsJson(safeStorage.decryptString(bytes)))
}

/** Caller serializes writes. Refuse to overwrite an unreadable previous copy. */
export async function writeDesktopSettings(
  dataPath: string,
  settings: DesktopSettings,
  safeStorage: SafeStorageLike,
  options: { rewrap?: boolean } = {}
): Promise<void> {
  const value = validateDesktopSettings(settings)
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Unlock the Mac key store to save desktop settings.')
  // Rewrapping is only for a disposable, already authenticated portable restore.
  const previous = options.rewrap ? null : await readDesktopSettings(dataPath, safeStorage)
  const serialized = JSON.stringify(value)
  if (previous && JSON.stringify(previous) === serialized) return
  const payload = safeStorage.encryptString(serialized).toString('base64')
  await mkdir(dataPath, { recursive: true, mode: 0o700 })
  const temporary = join(dataPath, `.${SETTINGS_FILE}.${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify({ version: 1, payload }))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, join(dataPath, SETTINGS_FILE))
    const directory = await open(dataPath, 'r')
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    await rm(temporary, { force: true })
  }
}
