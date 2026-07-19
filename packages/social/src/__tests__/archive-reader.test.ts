import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  createZipJsonEntryReader,
  createZipTextEntryReader,
  readZipArchiveManifest
} from '../import'
import {
  createBrowserZipJsonEntryReader,
  createBrowserZipTextEntryReader,
  readBrowserZipArchiveManifest
} from '../import/browser'

describe('ZIP archive reader', () => {
  it('reads central-directory metadata and parses compressed JSON entries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xnet-social-zip-'))
    const archivePath = join(dir, 'sample.zip')

    try {
      await writeFile(
        archivePath,
        createSingleFileZip({
          path: 'nested/export.json',
          payload: JSON.stringify({ ok: true, count: 3 })
        })
      )

      const manifest = await readZipArchiveManifest(archivePath, { hashEntries: false })
      const readJsonEntry = await createZipJsonEntryReader(archivePath)
      const readTextEntry = await createZipTextEntryReader(archivePath)

      expect(manifest.filename).toBe('sample.zip')
      expect(manifest.entries).toHaveLength(1)
      expect(manifest.entries[0].path).toBe('nested/export.json')
      await expect(readTextEntry('nested/export.json')).resolves.toBe('{"ok":true,"count":3}')
      await expect(readJsonEntry('nested/export.json')).resolves.toEqual({ ok: true, count: 3 })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('resolves ZIP64 per-entry central-directory metadata', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'xnet-social-zip64-'))
    const archivePath = join(dir, 'sample.zip')
    const payload = 'window.__data = [{"account":{"username":"xnet"}}]'

    try {
      await writeFile(
        archivePath,
        createSingleFileZip({
          path: 'data/account.js',
          payload,
          zip64CentralDirectory: true
        })
      )

      const manifest = await readZipArchiveManifest(archivePath, { hashEntries: false })
      const readTextEntry = await createZipTextEntryReader(archivePath)

      expect(manifest.entries).toHaveLength(1)
      expect(manifest.entries[0]).toMatchObject({
        path: 'data/account.js',
        byteSize: Buffer.byteLength(payload)
      })
      await expect(readTextEntry('data/account.js')).resolves.toBe(payload)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('browser ZIP archive reader', () => {
  it('reads File-backed central-directory metadata and parses compressed JSON entries', async () => {
    const archive = createSingleFileZip({
      path: 'nested/export.json',
      payload: JSON.stringify({ ok: true, count: 3 })
    })
    const file = new File([toArrayBuffer(archive)], 'sample.zip', { type: 'application/zip' })

    const manifest = await readBrowserZipArchiveManifest(file, { hashEntries: false })
    const readJsonEntry = await createBrowserZipJsonEntryReader(file)
    const readTextEntry = await createBrowserZipTextEntryReader(file)

    expect(manifest.filename).toBe('sample.zip')
    expect(manifest.entries).toHaveLength(1)
    expect(manifest.entries[0].path).toBe('nested/export.json')
    await expect(readTextEntry('nested/export.json')).resolves.toBe('{"ok":true,"count":3}')
    await expect(readJsonEntry('nested/export.json')).resolves.toEqual({ ok: true, count: 3 })
  })

  it('resolves File-backed ZIP64 per-entry central-directory metadata', async () => {
    const payload = 'window.__data = [{"account":{"username":"xnet"}}]'
    const archive = createSingleFileZip({
      path: 'data/account.js',
      payload,
      zip64CentralDirectory: true
    })
    const file = new File([toArrayBuffer(archive)], 'sample.zip', { type: 'application/zip' })

    const manifest = await readBrowserZipArchiveManifest(file, { hashEntries: false })
    const readTextEntry = await createBrowserZipTextEntryReader(file)

    expect(manifest.entries).toHaveLength(1)
    expect(manifest.entries[0]).toMatchObject({
      path: 'data/account.js',
      byteSize: Buffer.byteLength(payload)
    })
    await expect(readTextEntry('data/account.js')).resolves.toBe(payload)
  })
})

function createSingleFileZip(input: {
  path: string
  payload: string
  zip64CentralDirectory?: boolean
}): Buffer {
  const fileName = Buffer.from(input.path, 'utf8')
  const payload = Buffer.from(input.payload, 'utf8')
  const compressed = deflateRawSync(payload)
  const zip64Extra = input.zip64CentralDirectory
    ? createZip64CentralDirectoryExtra({
        byteSize: payload.length,
        compressedByteSize: compressed.length,
        localHeaderOffset: 0
      })
    : Buffer.alloc(0)
  const localHeader = Buffer.alloc(30)
  localHeader.writeUInt32LE(0x04034b50, 0)
  localHeader.writeUInt16LE(20, 4)
  localHeader.writeUInt16LE(0, 6)
  localHeader.writeUInt16LE(8, 8)
  localHeader.writeUInt16LE(0, 10)
  localHeader.writeUInt16LE(0, 12)
  localHeader.writeUInt32LE(0, 14)
  localHeader.writeUInt32LE(compressed.length, 18)
  localHeader.writeUInt32LE(payload.length, 22)
  localHeader.writeUInt16LE(fileName.length, 26)
  localHeader.writeUInt16LE(0, 28)

  const centralDirectoryOffset = localHeader.length + fileName.length + compressed.length
  const centralDirectory = Buffer.alloc(46)
  centralDirectory.writeUInt32LE(0x02014b50, 0)
  centralDirectory.writeUInt16LE(20, 4)
  centralDirectory.writeUInt16LE(20, 6)
  centralDirectory.writeUInt16LE(0, 8)
  centralDirectory.writeUInt16LE(8, 10)
  centralDirectory.writeUInt16LE(0, 12)
  centralDirectory.writeUInt16LE(0, 14)
  centralDirectory.writeUInt32LE(0, 16)
  centralDirectory.writeUInt32LE(input.zip64CentralDirectory ? 0xffffffff : compressed.length, 20)
  centralDirectory.writeUInt32LE(input.zip64CentralDirectory ? 0xffffffff : payload.length, 24)
  centralDirectory.writeUInt16LE(fileName.length, 28)
  centralDirectory.writeUInt16LE(zip64Extra.length, 30)
  centralDirectory.writeUInt16LE(0, 32)
  centralDirectory.writeUInt16LE(0, 34)
  centralDirectory.writeUInt16LE(0, 36)
  centralDirectory.writeUInt32LE(0, 38)
  centralDirectory.writeUInt32LE(input.zip64CentralDirectory ? 0xffffffff : 0, 42)

  const centralDirectorySize = centralDirectory.length + fileName.length + zip64Extra.length
  const endOfCentralDirectory = Buffer.alloc(22)
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0)
  endOfCentralDirectory.writeUInt16LE(0, 4)
  endOfCentralDirectory.writeUInt16LE(0, 6)
  endOfCentralDirectory.writeUInt16LE(1, 8)
  endOfCentralDirectory.writeUInt16LE(1, 10)
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12)
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16)
  endOfCentralDirectory.writeUInt16LE(0, 20)

  return Buffer.concat([
    localHeader,
    fileName,
    compressed,
    centralDirectory,
    fileName,
    zip64Extra,
    endOfCentralDirectory
  ])
}

function createZip64CentralDirectoryExtra(input: {
  byteSize: number
  compressedByteSize: number
  localHeaderOffset: number
}): Buffer {
  const extra = Buffer.alloc(28)
  extra.writeUInt16LE(0x0001, 0)
  extra.writeUInt16LE(24, 2)
  extra.writeBigUInt64LE(BigInt(input.byteSize), 4)
  extra.writeBigUInt64LE(BigInt(input.compressedByteSize), 12)
  extra.writeBigUInt64LE(BigInt(input.localHeaderOffset), 20)
  return extra
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
