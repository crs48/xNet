/**
 * Browser social import utilities for File/Blob-backed ZIP archives.
 */

import type {
  ArchiveEntryRef,
  ArchiveManifest,
  JsonArchiveEntryReader,
  TextArchiveEntryReader
} from './types'
import { sha256Hex } from './ids'
export * from './core'

export type BrowserZipArchiveManifestOptions = {
  hashEntries?: boolean
}

export type BrowserZipCentralDirectoryEntry = ArchiveEntryRef & {
  crc32: number
  localHeaderOffset: number
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50
const ZIP64_EXTRA_FIELD_ID = 0x0001
const ZIP64_SENTINEL = 0xffffffff
const TEXT_DECODER = new TextDecoder('utf-8')

type Zip64CentralDirectoryValues = {
  byteSize: number
  compressedByteSize: number
  localHeaderOffset: number
}

export async function readBrowserZipArchiveManifest(
  file: File,
  options: BrowserZipArchiveManifestOptions = {}
): Promise<ArchiveManifest> {
  const archiveHash = sha256Hex(new Uint8Array(await file.arrayBuffer()))
  const entries = await readCentralDirectory(file)
  const hashEntries = options.hashEntries ?? true
  const hashedEntries = hashEntries
    ? await Promise.all(entries.map((entry) => hashZipEntry(file, entry)))
    : entries

  return {
    filename: file.name,
    byteSize: file.size,
    archiveHash,
    entries: hashedEntries.map(
      ({ localHeaderOffset: _localHeaderOffset, crc32: _crc32, ...entry }) => entry
    )
  }
}

export async function createBrowserZipJsonEntryReader(file: File): Promise<JsonArchiveEntryReader> {
  const readTextEntry = await createBrowserZipTextEntryReader(file)

  return async <T = unknown>(path: string): Promise<T> => {
    const payload = await readTextEntry(path)
    return JSON.parse(payload) as T
  }
}

export async function createBrowserZipTextEntryReader(file: File): Promise<TextArchiveEntryReader> {
  const entries = await readCentralDirectory(file)
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]))

  return async (path: string): Promise<string> => {
    const entry = entriesByPath.get(path)
    if (!entry) throw new Error(`ZIP entry not found: ${path}`)

    const payload = await readZipEntryBytes(file, entry)
    return stripTextBom(TEXT_DECODER.decode(payload))
  }
}

export async function readBrowserZipJsonEntry<T = unknown>(file: File, path: string): Promise<T> {
  const reader = await createBrowserZipJsonEntryReader(file)
  return reader<T>(path)
}

export async function readBrowserZipTextEntry(file: File, path: string): Promise<string> {
  const reader = await createBrowserZipTextEntryReader(file)
  return reader(path)
}

async function readCentralDirectory(file: File): Promise<BrowserZipCentralDirectoryEntry[]> {
  const tailLength = Math.min(file.size, 66_000)
  const tail = new Uint8Array(await file.slice(file.size - tailLength).arrayBuffer())
  const eocdOffsetInTail = findEndOfCentralDirectory(tail)
  if (eocdOffsetInTail < 0) throw new Error(`Could not find ZIP central directory: ${file.name}`)

  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  const centralDirectorySize = view.getUint32(eocdOffsetInTail + 12, true)
  const centralDirectoryOffset = view.getUint32(eocdOffsetInTail + 16, true)
  if (centralDirectorySize === ZIP64_SENTINEL || centralDirectoryOffset === ZIP64_SENTINEL) {
    throw new Error('ZIP64 archives are not supported by the current social manifest reader')
  }

  const directory = new Uint8Array(
    await file
      .slice(centralDirectoryOffset, centralDirectoryOffset + centralDirectorySize)
      .arrayBuffer()
  )
  return parseCentralDirectory(directory)
}

function findEndOfCentralDirectory(tail: Uint8Array): number {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  for (let offset = tail.byteLength - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset
  }
  return -1
}

function parseCentralDirectory(directory: Uint8Array): BrowserZipCentralDirectoryEntry[] {
  const entries: BrowserZipCentralDirectoryEntry[] = []
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength)
  let offset = 0

  while (offset < directory.byteLength) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) break

    const compressionMethod = view.getUint16(offset + 10, true)
    const modifiedDate = view.getUint16(offset + 14, true)
    const crc32 = view.getUint32(offset + 16, true)
    const rawCompressedByteSize = view.getUint32(offset + 20, true)
    const rawByteSize = view.getUint32(offset + 24, true)
    const fileNameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const rawLocalHeaderOffset = view.getUint32(offset + 42, true)
    const extraStart = offset + 46 + fileNameLength
    const { byteSize, compressedByteSize, localHeaderOffset } = readZip64CentralDirectoryExtra(
      view,
      extraStart,
      extraLength,
      {
        byteSize: rawByteSize,
        compressedByteSize: rawCompressedByteSize,
        localHeaderOffset: rawLocalHeaderOffset
      }
    )
    const path = TEXT_DECODER.decode(directory.subarray(offset + 46, offset + 46 + fileNameLength))

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

function readZip64CentralDirectoryExtra(
  view: DataView,
  extraStart: number,
  extraLength: number,
  values: Zip64CentralDirectoryValues
): Zip64CentralDirectoryValues {
  if (!needsZip64CentralDirectoryExtra(values)) return values

  const extraEnd = extraStart + extraLength
  let offset = extraStart

  while (offset + 4 <= extraEnd) {
    const headerId = view.getUint16(offset, true)
    const dataLength = view.getUint16(offset + 2, true)
    const dataStart = offset + 4
    const dataEnd = dataStart + dataLength
    if (dataEnd > extraEnd) throw new Error('Malformed ZIP64 extra field in central directory')

    if (headerId === ZIP64_EXTRA_FIELD_ID) {
      return assertResolvedZip64Values(
        readZip64CentralDirectoryValues(view, dataStart, dataEnd, values)
      )
    }

    offset = dataEnd
  }

  return assertResolvedZip64Values(values)
}

function readZip64CentralDirectoryValues(
  view: DataView,
  dataStart: number,
  dataEnd: number,
  values: Zip64CentralDirectoryValues
): Zip64CentralDirectoryValues {
  let cursor = dataStart
  let byteSize = values.byteSize
  let compressedByteSize = values.compressedByteSize
  let localHeaderOffset = values.localHeaderOffset

  if (byteSize === ZIP64_SENTINEL) {
    const result = readUint64LEAsNumber(view, cursor, dataEnd)
    byteSize = result.value
    cursor = result.nextOffset
  }

  if (compressedByteSize === ZIP64_SENTINEL) {
    const result = readUint64LEAsNumber(view, cursor, dataEnd)
    compressedByteSize = result.value
    cursor = result.nextOffset
  }

  if (localHeaderOffset === ZIP64_SENTINEL) {
    const result = readUint64LEAsNumber(view, cursor, dataEnd)
    localHeaderOffset = result.value
  }

  return { byteSize, compressedByteSize, localHeaderOffset }
}

function readUint64LEAsNumber(
  view: DataView,
  offset: number,
  dataEnd: number
): { value: number; nextOffset: number } {
  if (offset + 8 > dataEnd) throw new Error('Truncated ZIP64 extra field in central directory')

  const value = Number(view.getBigUint64(offset, true))
  if (!Number.isSafeInteger(value)) {
    throw new Error('ZIP64 value exceeds JavaScript safe integer range')
  }

  return { value, nextOffset: offset + 8 }
}

function needsZip64CentralDirectoryExtra(values: Zip64CentralDirectoryValues): boolean {
  return (
    values.byteSize === ZIP64_SENTINEL ||
    values.compressedByteSize === ZIP64_SENTINEL ||
    values.localHeaderOffset === ZIP64_SENTINEL
  )
}

function assertResolvedZip64Values(
  values: Zip64CentralDirectoryValues
): Zip64CentralDirectoryValues {
  if (needsZip64CentralDirectoryExtra(values)) {
    throw new Error('ZIP64 central-directory entry is missing required extended metadata')
  }

  return values
}

async function hashZipEntry(
  file: File,
  entry: BrowserZipCentralDirectoryEntry
): Promise<BrowserZipCentralDirectoryEntry> {
  if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
    return { ...entry, sha256: undefined }
  }

  const payload = await readZipEntryBytes(file, entry)
  return { ...entry, sha256: sha256Hex(payload) }
}

async function readZipEntryBytes(
  file: File,
  entry: BrowserZipCentralDirectoryEntry
): Promise<Uint8Array> {
  const dataStart = await getEntryDataStart(file, entry.localHeaderOffset)
  const compressedByteSize = entry.compressedByteSize ?? 0
  if (compressedByteSize <= 0) return new Uint8Array()

  const compressed = new Uint8Array(
    await file.slice(dataStart, dataStart + compressedByteSize).arrayBuffer()
  )

  if (entry.compressionMethod === 0) return compressed
  if (entry.compressionMethod === 8) return inflateRaw(compressed)

  throw new Error(`Unsupported ZIP compression method ${entry.compressionMethod}`)
}

async function getEntryDataStart(file: File, localHeaderOffset: number): Promise<number> {
  const header = new Uint8Array(
    await file.slice(localHeaderOffset, localHeaderOffset + 30).arrayBuffer()
  )
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  if (view.getUint32(0, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`Invalid ZIP local file header at offset ${localHeaderOffset}`)
  }

  const fileNameLength = view.getUint16(26, true)
  const extraLength = view.getUint16(28, true)
  return localHeaderOffset + 30 + fileNameLength + extraLength
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new Blob([toArrayBuffer(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  } catch (err) {
    const inflated = await inflateRawWithNodeFallback(bytes)
    if (inflated) return inflated
    throw err
  }
}

async function inflateRawWithNodeFallback(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (!isNodeLikeRuntime()) return null

  const moduleName = 'node:zlib'
  const zlib = (await import(/* @vite-ignore */ moduleName)) as {
    inflateRawSync: (value: Uint8Array) => Uint8Array
  }
  return zlib.inflateRawSync(bytes)
}

function isNodeLikeRuntime(): boolean {
  const processLike = (globalThis as { process?: { versions?: { node?: string } } }).process
  return typeof processLike === 'object' && Boolean(processLike.versions?.node)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function dosDateToIso(date: number): string | undefined {
  if (!date) return undefined
  const day = date & 0x1f
  const month = (date >> 5) & 0x0f
  const year = ((date >> 9) & 0x7f) + 1980
  return new Date(Date.UTC(year, month - 1, day)).toISOString()
}

function stripTextBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}
