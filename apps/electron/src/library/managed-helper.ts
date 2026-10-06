import type { LibraryHelperStatus } from '../shared/library'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { TaggedError } from '@xnetjs/core'

const exec = promisify(execFile)
export const TESTED_EXTRACTOR_VERSION = '2026.07.04'
// Official immutable release asset; the digest is pinned in source, never trusted from a download.
export const MAC_VIDEO_HELPER = {
  version: TESTED_EXTRACTOR_VERSION,
  filename: `yt-dlp-${TESTED_EXTRACTOR_VERSION}-macos`,
  url: `https://github.com/yt-dlp/yt-dlp/releases/download/${TESTED_EXTRACTOR_VERSION}/yt-dlp_macos`,
  size: 38_256_544,
  sha256: '498bd0dae17855c599d371d68ec5bafc439a9d8640e838be25c765a9792f261b'
} as const

type HelperArtifact = {
  version: string
  filename: string
  url: string
  size: number
  sha256: string
}
export class LibraryHelperError extends TaggedError {
  readonly _tag = 'LibraryHelperError'
}
export class LibraryHelperProbeError extends TaggedError {
  readonly _tag = 'LibraryHelperProbeError'
}
const verified = new Map<string, string>()
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const pathFor = (directory: string, artifact: HelperArtifact) => {
  if (!/^[a-zA-Z0-9._-]+$/.test(artifact.filename) || artifact.filename.startsWith('.'))
    throw new LibraryHelperError('Invalid helper filename')
  return join(directory, artifact.filename)
}

export async function inspectManagedHelper(
  directory: string,
  artifact: HelperArtifact = MAC_VIDEO_HELPER
): Promise<LibraryHelperStatus> {
  const base = { version: artifact.version, bytes: artifact.size }
  try {
    const root = await lstat(directory)
    if (!root.isDirectory() || root.isSymbolicLink())
      throw new LibraryHelperError('Helper storage is not a regular directory.')
    const path = pathFor(directory, artifact)
    const stat = await lstat(path, { bigint: true })
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new LibraryHelperError('The managed helper is not a regular file.')
    if (stat.size !== BigInt(artifact.size) || (stat.mode & 0o100n) === 0n)
      throw new LibraryHelperError('The managed helper is incomplete or not executable.')
    const stamp = `${artifact.sha256}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
    if (verified.get(path) !== stamp) {
      if (digest(await readFile(path)) !== artifact.sha256)
        throw new LibraryHelperError('The managed helper checksum does not match this build.')
      verified.set(path, stamp)
    }
    return { ...base, state: 'ready' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ...base, state: 'missing' }
    return { ...base, state: 'damaged', reason: message(error) }
  }
}

export async function managedHelperPath(directory: string): Promise<string | null> {
  const status = await inspectManagedHelper(directory)
  if (status.state === 'missing') return null
  if (status.state !== 'ready')
    throw new LibraryHelperError(
      status.reason ?? 'Repair the video helper in Library → Coverage & gaps.'
    )
  return pathFor(directory, MAC_VIDEO_HELPER)
}

export async function verifyHelperVersion(
  path: string,
  version = TESTED_EXTRACTOR_VERSION,
  signal?: AbortSignal
): Promise<void> {
  const result = await exec(path, ['--ignore-config', '--no-plugin-dirs', '--version'], {
    timeout: 15_000,
    maxBuffer: 65536,
    signal
  })
  if (!result.stdout.trim())
    throw new LibraryHelperProbeError(
      'The video helper returned no version output. Try again shortly.'
    )
  if (result.stdout.trim() !== version)
    throw new LibraryHelperError(`Expected yt-dlp ${version}; found ${result.stdout.trim()}.`)
}

/** Only the native caller chooses the artifact and download transport; neither comes from IPC. */
export async function installManagedHelper(options: {
  directory: string
  signal: AbortSignal
  download: (url: string, signal: AbortSignal, limit: number) => Promise<Response>
  artifact?: HelperArtifact
  verifyVersion?: (path: string, version: string, signal: AbortSignal) => Promise<void>
}): Promise<LibraryHelperStatus> {
  const artifact = options.artifact ?? MAC_VIDEO_HELPER
  const destination = pathFor(options.directory, artifact)
  const existing = await inspectManagedHelper(options.directory, artifact)
  if (existing.state === 'ready') return existing
  options.signal.throwIfAborted()
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const root = await lstat(options.directory)
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new LibraryHelperError('Helper storage is not a regular directory.')
  const temporary = join(options.directory, `.incomplete-${randomUUID()}`)
  try {
    const response = await options.download(artifact.url, options.signal, artifact.size)
    if (!response.ok || !response.body)
      throw new LibraryHelperError(`Helper download failed (HTTP ${response.status}).`)
    const file = await open(temporary, 'wx', 0o600)
    let size = 0
    const hash = createHash('sha256')
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { value: chunk, done } = await reader.read()
        if (done) break
        options.signal.throwIfAborted()
        size += chunk.byteLength
        if (size > artifact.size)
          throw new LibraryHelperError('Helper download exceeds the expected size.')
        hash.update(chunk)
        await file.writeFile(chunk)
      }
      if (size !== artifact.size || hash.digest('hex') !== artifact.sha256)
        throw new LibraryHelperError('Helper download failed size or checksum verification.')
      await file.chmod(0o500)
      await file.sync()
    } finally {
      reader.releaseLock()
      await file.close()
    }
    options.signal.throwIfAborted()
    await (options.verifyVersion ?? verifyHelperVersion)(
      temporary,
      artifact.version,
      options.signal
    )
    options.signal.throwIfAborted()
    await rename(temporary, destination)
    const parent = await open(options.directory, 'r')
    try {
      await parent.sync()
    } finally {
      await parent.close()
    }
    verified.delete(destination)
    const status = await inspectManagedHelper(options.directory, artifact)
    if (status.state !== 'ready')
      throw new LibraryHelperError(status.reason ?? 'Helper could not be verified.')
    return status
  } finally {
    await rm(temporary, { force: true })
  }
}
