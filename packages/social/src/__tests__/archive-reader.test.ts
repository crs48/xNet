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
})

function createSingleFileZip(input: { path: string; payload: string }): Buffer {
  const fileName = Buffer.from(input.path, 'utf8')
  const payload = Buffer.from(input.payload, 'utf8')
  const compressed = deflateRawSync(payload)
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
  centralDirectory.writeUInt32LE(compressed.length, 20)
  centralDirectory.writeUInt32LE(payload.length, 24)
  centralDirectory.writeUInt16LE(fileName.length, 28)
  centralDirectory.writeUInt16LE(0, 30)
  centralDirectory.writeUInt16LE(0, 32)
  centralDirectory.writeUInt16LE(0, 34)
  centralDirectory.writeUInt16LE(0, 36)
  centralDirectory.writeUInt32LE(0, 38)
  centralDirectory.writeUInt32LE(0, 42)

  const centralDirectorySize = centralDirectory.length + fileName.length
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
    endOfCentralDirectory
  ])
}
