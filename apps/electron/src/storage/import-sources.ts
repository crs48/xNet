import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, open, rename, rm } from 'node:fs/promises'
import { extname, join } from 'node:path'

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function sync(path: string): Promise<void> {
  const handle = await open(path, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function requireDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Import source storage must be a local directory, not a symbolic link')
}

async function verify(path: string, expectedHash: string): Promise<void> {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || (await hashFile(path)) !== expectedHash)
    throw new Error('Import source differs from the reviewed archive. Select and review it again.')
}

/** Retain exact input bytes before the first database write. Never move the user's original. */
export async function retainImportSource(options: {
  dataPath: string
  sourcePath: string
  expectedHash: string
}): Promise<string> {
  const extension = extname(options.sourcePath).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(options.expectedHash) || !['.zip', '.json'].includes(extension))
    throw new Error('Invalid import source fingerprint or file type')
  const root = join(options.dataPath, 'import-sources')
  await requireDirectory(root)
  const destination = join(root, options.expectedHash)
  const filename = `source${extension}`
  const retained = join(destination, filename)
  try {
    const info = await lstat(destination)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Invalid retained import source directory')
    await verify(retained, options.expectedHash)
    return retained
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const sourceInfo = await lstat(options.sourcePath)
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink())
    throw new Error('Import source must be a regular file')
  const temporary = join(root, `.incomplete-${randomUUID()}`)
  await mkdir(temporary, { mode: 0o700 })
  try {
    const candidate = join(temporary, filename)
    await copyFile(options.sourcePath, candidate, constants.COPYFILE_FICLONE)
    await chmod(candidate, 0o600)
    await verify(candidate, options.expectedHash)
    await sync(candidate)
    await sync(temporary)
    try {
      await rename(temporary, destination)
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? ''))
        throw error
      // Another import may have retained these same bytes while this copy was in progress.
      const info = await lstat(destination)
      if (!info.isDirectory() || info.isSymbolicLink()) throw error
      await verify(retained, options.expectedHash)
    }
    await sync(root)
    await sync(options.dataPath)
    return retained
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
