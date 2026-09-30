import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { verifyCheckpoint } from './checkpoints'

const JOURNAL = 'pending-restore.json'
const validId = (id: string) => /^\d+-[a-f0-9-]{36}$/.test(id)

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function sync(path: string): Promise<void> {
  const file = await open(path, 'r')
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}

/** Finish a recorded restore before normal startup can mistake a rename gap for a new workspace. */
export async function recoverPendingRestore(
  dataPath: string,
  recoveryPath: string,
  options: { allowTestIdentity?: boolean } = {}
): Promise<void> {
  const journal = join(recoveryPath, JOURNAL)
  if (!(await exists(journal))) return
  const value = JSON.parse(await readFile(journal, 'utf8')) as { version?: unknown; id?: unknown }
  if (value.version !== 1 || typeof value.id !== 'string' || !validId(value.id))
    throw new Error('Unreadable restore journal. Workspace copies have been preserved.')
  const container = join(recoveryPath, 'restore', value.id)
  const candidate = join(container, 'workspace')
  const preserved = join(recoveryPath, 'preserved', value.id)
  if (await exists(candidate)) {
    await verifyCheckpoint(container, options)
    if (await exists(dataPath)) {
      if (await exists(preserved))
        throw new Error('Ambiguous restore state. All workspace generations were preserved.')
      await mkdir(dirname(preserved), { recursive: true, mode: 0o700 })
      await rename(dataPath, preserved)
      await sync(dirname(dataPath))
      await sync(dirname(preserved))
    } else if (!(await exists(preserved))) {
      throw new Error('The original workspace is missing during restore. No files were replaced.')
    }
    await rename(candidate, dataPath)
    await sync(dirname(dataPath))
    await sync(dirname(candidate))
  } else if (!(await exists(dataPath)) || !(await exists(preserved))) {
    throw new Error('Incomplete restore state. No workspace was reset.')
  }
  // A restored identity must not reconnect and replay older state before review.
  const review = await open(join(recoveryPath, 'review-required.json'), 'w', 0o600)
  try {
    await review.writeFile(
      JSON.stringify({ version: 1, id: value.id, restoredAt: new Date().toISOString() })
    )
    await review.sync()
  } finally {
    await review.close()
  }
  await rm(journal)
  await sync(recoveryPath)
}

/** Requires stopped workspace writers. The pre-restore generation is retained in full. */
export async function restoreCheckpoint(options: {
  id: string
  dataPath: string
  recoveryPath: string
  profile: string
  allowTestIdentity?: boolean
}): Promise<void> {
  if (!validId(options.id)) throw new Error('Invalid recovery point')
  const source = join(options.recoveryPath, options.id)
  const manifest = await verifyCheckpoint(source, options)
  if (manifest.profile !== options.profile)
    throw new Error('This recovery point belongs to another profile')
  if (await exists(join(options.recoveryPath, JOURNAL)))
    throw new Error('Finish the pending restore before starting another')
  // Repeated restores must preserve each generation rather than overwrite the last one.
  const id = `${Date.now()}-${randomUUID()}`
  const container = join(options.recoveryPath, 'restore', id)
  await mkdir(join(container, 'workspace'), { recursive: true, mode: 0o700 })
  for (const file of manifest.files) {
    const target = join(container, 'workspace', file.path)
    await mkdir(dirname(target), { recursive: true, mode: 0o700 })
    await copyFile(join(source, 'workspace', file.path), target, constants.COPYFILE_FICLONE)
    await sync(target)
    await sync(dirname(target))
  }
  await copyFile(join(source, 'manifest.json'), join(container, 'manifest.json'))
  await verifyCheckpoint(container, options)
  await sync(join(container, 'workspace'))
  await sync(join(container, 'manifest.json'))
  await sync(container)
  await sync(dirname(container))
  const journal = join(options.recoveryPath, JOURNAL)
  const temporary = `${journal}.${id}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    await file.writeFile(JSON.stringify({ version: 1, id }))
    await file.sync()
  } finally {
    await file.close()
  }
  await rename(temporary, journal)
  await sync(options.recoveryPath)
  await recoverPendingRestore(options.dataPath, options.recoveryPath, options)
  await rm(container, { recursive: true })
}
