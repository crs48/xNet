/**
 * @xnetjs/hub - File storage service.
 */
import type { FileMeta, HubStorage } from '../storage/interface'
import { hashHex } from '@xnetjs/crypto'

export type FileConfig = {
  maxFileSize: number
  /**
   * Ceiling for video payloads (exploration 0414). A ten-minute 1080p
   * screencast is 150–400 MB, so the general 100 MB cap would reject every
   * recording with a flat 413. Media gets its own, larger limit rather than
   * raising the cap for all uploads — a 2 GB JSON blob is still a mistake.
   */
  maxMediaFileSize: number
  maxStoragePerUser: number
  allowedMimeTypes: string[]
}

const DEFAULT_CONFIG: FileConfig = {
  maxFileSize: 100 * 1024 * 1024,
  maxMediaFileSize: 2 * 1024 * 1024 * 1024,
  maxStoragePerUser: 5 * 1024 * 1024 * 1024,
  allowedMimeTypes: []
}

/** Whether a MIME type gets the larger media ceiling. */
export const isMediaMimeType = (mimeType: string): boolean =>
  mimeType.startsWith('video/') || mimeType.startsWith('audio/')

export class FileService {
  private config: FileConfig

  constructor(
    private storage: HubStorage,
    config?: Partial<FileConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * The ceiling that applies to a given upload. Callers that know the MIME
   * type should pass it — the route uses it to size its own `content-length`
   * pre-check so a large recording is rejected (or accepted) consistently at
   * both gates.
   */
  getMaxFileSize(mimeType?: string): number {
    return mimeType && isMediaMimeType(mimeType)
      ? this.config.maxMediaFileSize
      : this.config.maxFileSize
  }

  async upload(
    declaredCid: string,
    data: Uint8Array,
    name: string,
    mimeType: string,
    uploaderDid: string
  ): Promise<FileMeta> {
    const limit = this.getMaxFileSize(mimeType)
    if (data.length > limit) {
      throw new FileError('FILE_TOO_LARGE', `File exceeds max size of ${limit} bytes`)
    }

    if (this.config.allowedMimeTypes.length > 0) {
      if (!this.config.allowedMimeTypes.includes(mimeType)) {
        throw new FileError('INVALID_MIME_TYPE', `MIME type ${mimeType} is not allowed`)
      }
    }

    const usage = await this.storage.getFilesUsage(uploaderDid)
    if (usage.totalBytes + data.length > this.config.maxStoragePerUser) {
      throw new FileError(
        'QUOTA_EXCEEDED',
        `Would exceed storage quota of ${this.config.maxStoragePerUser} bytes`
      )
    }

    const computedCid = `cid:blake3:${hashHex(data)}`
    if (computedCid !== declaredCid) {
      throw new FileError('CID_MISMATCH', 'Declared CID does not match content hash')
    }

    const existing = await this.storage.getFileMeta(declaredCid)
    if (existing) return existing

    const createdAt = Date.now()
    const meta: FileMeta = {
      cid: declaredCid,
      name,
      mimeType,
      sizeBytes: data.length,
      uploaderDid,
      referenceCount: 1,
      createdAt
    }

    await this.storage.putFile(declaredCid, data, {
      cid: meta.cid,
      name: meta.name,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      uploaderDid: meta.uploaderDid
    })

    return meta
  }

  async download(cid: string): Promise<{ data: Uint8Array; meta: FileMeta } | null> {
    const meta = await this.storage.getFileMeta(cid)
    if (!meta) return null

    const data = await this.storage.getFileData(cid)
    if (!data) return null

    return { data, meta }
  }

  async getMeta(cid: string): Promise<FileMeta | null> {
    return this.storage.getFileMeta(cid)
  }

  async listByUploader(uploaderDid: string): Promise<FileMeta[]> {
    return this.storage.listFiles(uploaderDid)
  }

  async getUsage(
    uploaderDid: string
  ): Promise<{ totalBytes: number; fileCount: number; quota: number }> {
    const usage = await this.storage.getFilesUsage(uploaderDid)
    return { ...usage, quota: this.config.maxStoragePerUser }
  }
}

export class FileError extends Error {
  constructor(
    public code:
      | 'FILE_TOO_LARGE'
      | 'INVALID_MIME_TYPE'
      | 'QUOTA_EXCEEDED'
      | 'CID_MISMATCH'
      | 'NOT_FOUND',
    message: string
  ) {
    super(message)
    this.name = 'FileError'
  }
}
