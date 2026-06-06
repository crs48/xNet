/**
 * ZIP archive manifest reader.
 *
 * This intentionally reads central-directory metadata and hashes entry streams without
 * extracting archive contents into the repository.
 */

import type { ArchiveEntryRef, ArchiveManifest, JsonArchiveEntryReader } from './types'
import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw } from 'node:zlib'

export type ZipArchiveManifestOptions = {
  hashEntries?: boolean
}

export type ZipCentralDirectoryEntry = ArchiveEntryRef & {
  crc32: number
  localHeaderOffset: number
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP64_SENTINEL = 0xffffffff

export async function readZipArchiveManifest(
  archivePath: string,
  options: ZipArchiveManifestOptions = {}
): Promise<ArchiveManifest> {
  const stat = await fs.stat(archivePath)
  const archiveHash = await hashFile(archivePath)
  const entries = await readCentralDirectory(archivePath, stat.size)
  const hashEntries = options.hashEntries ?? true
  const hashedEntries = hashEntries
    ? await Promise.all(entries.map((entry) => hashZipEntry(archivePath, entry)))
    : entries

  return {
    archivePath,
    filename: basename(archivePath),
    byteSize: stat.size,
    archiveHash,
    entries: hashedEntries.map(
      ({ localHeaderOffset: _localHeaderOffset, crc32: _crc32, ...entry }) => entry
    )
  }
}

export async function createZipJsonEntryReader(
  archivePath: string
): Promise<JsonArchiveEntryReader> {
  const stat = await fs.stat(archivePath)
  const entries = await readCentralDirectory(archivePath, stat.size)
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]))

  return async <T = unknown>(path: string): Promise<T> => {
    const entry = entriesByPath.get(path)
    if (!entry) throw new Error(`ZIP entry not found: ${path}`)

    const payload = await readZipEntryBuffer(archivePath, entry)
    return JSON.parse(stripJsonBom(payload.toString('utf8'))) as T
  }
}

export async function readZipJsonEntry<T = unknown>(archivePath: string, path: string): Promise<T> {
  const reader = await createZipJsonEntryReader(archivePath)
  return reader<T>(path)
}

async function readCentralDirectory(
  archivePath: string,
  archiveByteSize: number
): Promise<ZipCentralDirectoryEntry[]> {
  const tailLength = Math.min(archiveByteSize, 66_000)
  const handle = await fs.open(archivePath, 'r')
  try {
    const tail = Buffer.alloc(tailLength)
    await handle.read(tail, 0, tailLength, archiveByteSize - tailLength)
    const eocdOffsetInTail = findEndOfCentralDirectory(tail)
    if (eocdOffsetInTail < 0)
      throw new Error(`Could not find ZIP central directory: ${archivePath}`)

    const centralDirectorySize = tail.readUInt32LE(eocdOffsetInTail + 12)
    const centralDirectoryOffset = tail.readUInt32LE(eocdOffsetInTail + 16)
    if (centralDirectorySize === ZIP64_SENTINEL || centralDirectoryOffset === ZIP64_SENTINEL) {
      throw new Error('ZIP64 archives are not supported by the current social manifest reader')
    }

    const directory = Buffer.alloc(centralDirectorySize)
    await handle.read(directory, 0, centralDirectorySize, centralDirectoryOffset)
    return parseCentralDirectory(directory)
  } finally {
    await handle.close()
  }
}

function findEndOfCentralDirectory(tail: Buffer): number {
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tail.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  return -1
}

function parseCentralDirectory(directory: Buffer): ZipCentralDirectoryEntry[] {
  const entries: ZipCentralDirectoryEntry[] = []
  let offset = 0

  while (offset < directory.length) {
    if (directory.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) break

    const compressionMethod = directory.readUInt16LE(offset + 10)
    const modifiedDate = directory.readUInt16LE(offset + 14)
    const crc32 = directory.readUInt32LE(offset + 16)
    const compressedByteSize = directory.readUInt32LE(offset + 20)
    const byteSize = directory.readUInt32LE(offset + 24)
    const fileNameLength = directory.readUInt16LE(offset + 28)
    const extraLength = directory.readUInt16LE(offset + 30)
    const commentLength = directory.readUInt16LE(offset + 32)
    const localHeaderOffset = directory.readUInt32LE(offset + 42)
    const path = directory.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')

    if (!path.endsWith('/')) {
      entries.push({
        path,
        byteSize,
        compressedByteSize,
        compressionMethod,
        modifiedAt: dosDateToIso(modifiedDate),
        crc32,
        localHeaderOffset
      })
    }

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

async function hashZipEntry(
  archivePath: string,
  entry: ZipCentralDirectoryEntry
): Promise<ZipCentralDirectoryEntry> {
  const dataStart = await getEntryDataStart(archivePath, entry.localHeaderOffset)
  const hash = createHash('sha256')
  const compressed = createReadStream(archivePath, {
    start: dataStart,
    end: dataStart + (entry.compressedByteSize ?? 0) - 1
  })

  if (entry.compressionMethod === 0) {
    await pipeline(compressed, hash)
  } else if (entry.compressionMethod === 8) {
    await pipeline(compressed, createInflateRaw(), hash)
  } else {
    return {
      ...entry,
      sha256: undefined
    }
  }

  return { ...entry, sha256: hash.digest('hex') }
}

async function readZipEntryBuffer(
  archivePath: string,
  entry: ZipCentralDirectoryEntry
): Promise<Buffer> {
  const dataStart = await getEntryDataStart(archivePath, entry.localHeaderOffset)
  const compressedByteSize = entry.compressedByteSize ?? 0
  if (compressedByteSize <= 0) return Buffer.alloc(0)

  const chunks: Buffer[] = []
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    }
  })
  const compressed = createReadStream(archivePath, {
    start: dataStart,
    end: compressedByteSize > 0 ? dataStart + compressedByteSize - 1 : dataStart
  })

  if (entry.compressionMethod === 0) {
    await pipeline(compressed, sink)
  } else if (entry.compressionMethod === 8) {
    await pipeline(compressed, createInflateRaw(), sink)
  } else {
    throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}`)
  }

  return Buffer.concat(chunks)
}

async function getEntryDataStart(archivePath: string, localHeaderOffset: number): Promise<number> {
  const handle = await fs.open(archivePath, 'r')
  try {
    const header = Buffer.alloc(30)
    await handle.read(header, 0, 30, localHeaderOffset)
    if (header.readUInt32LE(0) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw new Error(`Invalid ZIP local file header at offset ${localHeaderOffset}`)
    }
    const fileNameLength = header.readUInt16LE(26)
    const extraLength = header.readUInt16LE(28)
    return localHeaderOffset + 30 + fileNameLength + extraLength
  } finally {
    await handle.close()
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(path), hash)
  return hash.digest('hex')
}

function dosDateToIso(date: number): string | undefined {
  if (!date) return undefined
  const day = date & 0x1f
  const month = (date >> 5) & 0x0f
  const year = ((date >> 9) & 0x7f) + 1980
  return new Date(Date.UTC(year, month - 1, day)).toISOString()
}

function stripJsonBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}
