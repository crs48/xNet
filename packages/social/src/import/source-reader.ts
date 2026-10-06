/** A ZIP export or a supported JSON snapshot, exposed through the same entry readers. */
import type { ArchiveManifest, JsonArchiveEntryReader, TextArchiveEntryReader } from './types'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import {
  createZipJsonEntryReader,
  createZipTextEntryReader,
  readZipArchiveManifest
} from './archive-reader'

export async function openSocialImportSource(path: string): Promise<{
  manifest: ArchiveManifest
  readJsonEntry: JsonArchiveEntryReader
  readTextEntry: TextArchiveEntryReader
}> {
  if (extname(path).toLowerCase() === '.zip') {
    return {
      manifest: await readZipArchiveManifest(path, { hashEntries: false }),
      readJsonEntry: await createZipJsonEntryReader(path),
      readTextEntry: await createZipTextEntryReader(path)
    }
  }
  if (extname(path).toLowerCase() !== '.json')
    throw new Error('Select a ZIP export, GitHub stars snapshot, or garden JSON file')
  const before = await stat(path)
  if (!before.isFile() || before.size > 128 * 1024 * 1024)
    throw new Error('JSON snapshots must be regular files smaller than 128 MiB')
  const bytes = await readFile(path)
  const after = await stat(path)
  if (
    before.size !== bytes.byteLength ||
    before.ino !== after.ino ||
    before.mtimeMs !== after.mtimeMs ||
    before.ctimeMs !== after.ctimeMs
  )
    throw new Error('The snapshot changed while reading it; retry after the export finishes')
  const json: unknown = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''))
  const object =
    json && typeof json === 'object' && !Array.isArray(json)
      ? (json as Record<string, unknown>)
      : undefined
  const isGarden =
    object?.version === 1 &&
    typeof object.profile === 'object' &&
    object.profile !== null &&
    Array.isArray(object.entries)
  if (!Array.isArray(json) && object?.format !== 'xnet-github-stars/1' && !isGarden)
    throw new Error('Unsupported standalone JSON snapshot')
  // A standalone file is a one-entry virtual archive. Preserve its actual filename on the manifest.
  const entryPath = isGarden ? 'garden.json' : 'github-stars.json'
  const hash = createHash('sha256').update(bytes).digest('hex')
  const manifest: ArchiveManifest = {
    archivePath: path,
    filename: basename(path),
    byteSize: bytes.byteLength,
    archiveHash: hash,
    entries: [{ path: entryPath, byteSize: bytes.byteLength, sha256: hash }]
  }
  const requireEntry = (requested: string) => {
    if (requested !== entryPath) throw new Error(`Snapshot entry not found: ${requested}`)
  }
  return {
    manifest,
    readJsonEntry: async <T = unknown>(requested: string): Promise<T> => {
      requireEntry(requested)
      return json as T
    },
    readTextEntry: async (requested: string): Promise<string> => {
      requireEntry(requested)
      return bytes.toString('utf8').replace(/^\uFEFF/, '')
    }
  }
}
