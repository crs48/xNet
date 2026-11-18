import type { DesktopRequest } from './extension-surface-policy'
import type { FileHandle } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, extname } from 'node:path'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const writeText = async (file: FileHandle, text: string) => {
  const content = Buffer.from(text, 'utf8')
  try {
    let position = 0
    while (position < content.length) {
      const { bytesWritten } = await file.write(
        content,
        position,
        content.length - position,
        position
      )
      if (!bytesWritten) throw new Error('File write made no progress.')
      position += bytesWritten
    }
    await file.truncate(content.length)
    await file.sync()
  } catch (cause) {
    throw Object.assign(
      new Error(
        'Could not confirm the save. The file may have changed; read it again before retrying.',
        { cause }
      ),
      { code: 'unavailable' }
    )
  }
}

const mimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf'
}
/** Paths never cross into the guest. An open descriptor pins the chosen inode. */
export function createExtensionFiles(ui: {
  choose(): Promise<string | null>
  save(name: string): Promise<string | null>
  confirmWrite(name: string): Promise<boolean>
  active(): boolean
}) {
  const grants = new Map<
    string,
    {
      path: string
      file: FileHandle
      dev: number
      ino: number
      revision: string | null
      writable: boolean
    }
  >()
  let closed = false
  const check = () => {
    if (closed || !ui.active()) throw new Error('File access was revoked.')
  }
  const bytes = async (file: FileHandle) => {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size > 2_000_000)
      throw new Error('Choose a regular file up to two megabytes.')
    const buffer = Buffer.alloc(stat.size + 1)
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
    if (bytesRead > 2_000_000 || bytesRead !== stat.size)
      throw new Error('The file changed while reading. Try again.')
    return buffer.subarray(0, bytesRead)
  }
  return {
    async request(request: DesktopRequest): Promise<unknown> {
      check()
      if (request.operation === 'files.open') {
        if (grants.size >= 20)
          throw new Error('Close this preview to release its twenty file handles.')
        const path = await ui.choose()
        check()
        if (!path) return null
        const file = await open(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
        )
        try {
          const content = await bytes(file),
            stat = await file.stat()
          check()
          const id = randomUUID()
          grants.set(id, {
            path,
            file,
            dev: stat.dev,
            ino: stat.ino,
            revision: digest(content),
            writable: false
          })
          return { id, name: basename(path), size: stat.size }
        } catch (error) {
          await file.close()
          throw error
        }
      }
      if (request.operation === 'files.saveText') {
        const path = await ui.save(request.name ?? 'extension.txt')
        check()
        if (!path) return null
        // O_NOFOLLOW prevents a selected final symlink from redirecting the write.
        const file = await open(
          path,
          constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          0o600
        )
        try {
          const stat = await file.stat()
          check()
          if (!stat.isFile() || stat.nlink !== 1)
            throw new Error('Export requires a regular file with one link.')
          await writeText(file, request.text!)
          return { name: basename(path), size: Buffer.byteLength(request.text!) }
        } finally {
          await file.close()
        }
      }
      const grant = grants.get(request.handle!)
      if (!grant) throw new Error('This file was not chosen for this extension session.')
      if (request.operation === 'files.readText' || request.operation === 'files.readDataURL') {
        const content = await bytes(grant.file)
        check()
        grant.revision = digest(content)
        return request.operation === 'files.readText'
          ? new TextDecoder('utf-8', { fatal: true }).decode(content)
          : `data:${mimeTypes[extname(grant.path).toLowerCase()] ?? 'application/octet-stream'};base64,${content.toString('base64')}`
      }
      if (!grant.writable) {
        if (!(await ui.confirmWrite(basename(grant.path))))
          throw new Error('Writing this file was not allowed.')
        check()
        grant.writable = true
      }
      const file = await open(
        grant.path,
        constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      try {
        const stat = await file.stat()
        if (stat.dev !== grant.dev || stat.ino !== grant.ino || stat.nlink !== 1)
          throw new Error('The chosen file was replaced or linked elsewhere. Choose it again.')
        const before = await bytes(file)
        check()
        if (digest(before) !== grant.revision)
          throw new Error('The file changed outside this extension. Read it again before saving.')
        const content = Buffer.from(request.text!, 'utf8')
        await writeText(file, request.text!)
        grant.revision = digest(content)
        return { saved: true, size: content.length }
      } finally {
        await file.close()
      }
    },
    async close() {
      closed = true
      const files = [...grants.values()]
      grants.clear()
      await Promise.all(files.map((grant) => grant.file.close()))
    }
  }
}
