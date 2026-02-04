/**
 * @xnet/hub - Encrypted backup service.
 */

import type { BlobMeta, HubStorage } from '../storage/interface'
import { hashHex } from '@xnet/crypto'

export type BackupConfig = {
  maxQuotaBytes: number
  maxBlobSize: number
}

const DEFAULT_CONFIG: BackupConfig = {
  maxQuotaBytes: 1024 * 1024 * 1024,
  maxBlobSize: 50 * 1024 * 1024
}

export type BackupResult = {
  key: string
  sizeBytes: number
}

export class BackupService {
  private config: BackupConfig

  constructor(private storage: HubStorage, config?: Partial<BackupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async put(docId: string, ownerDid: string, data: Uint8Array): Promise<BackupResult> {
    if (data.length > this.config.maxBlobSize) {
      throw new BackupError(
        'BLOB_TOO_LARGE',
        `Blob exceeds max size of ${this.config.maxBlobSize} bytes`
      )
    }

    const existing = await this.storage.listBlobs(ownerDid)
    const currentUsage = existing.reduce((sum, b) => sum + b.sizeBytes, 0)
    if (currentUsage + data.length > this.config.maxQuotaBytes) {
      throw new BackupError(
        'QUOTA_EXCEEDED',
        `Would exceed quota of ${this.config.maxQuotaBytes} bytes`
      )
    }

    const key = hashHex(data)
    const meta: BlobMeta = {
      key,
      docId,
      ownerDid,
      sizeBytes: data.length,
      contentType: 'application/octet-stream',
      createdAt: Date.now()
    }

    await this.storage.putBlob(key, data, meta)

    return { key, sizeBytes: data.length }
  }

  async get(docId: string, ownerDid: string): Promise<Uint8Array | null> {
    const blobs = await this.storage.listBlobs(ownerDid)
    const match = blobs.find((blob) => blob.docId === docId)
    if (!match) return null

    return this.storage.getBlob(match.key)
  }

  async list(ownerDid: string): Promise<BlobMeta[]> {
    return this.storage.listBlobs(ownerDid)
  }

  async delete(key: string, ownerDid: string): Promise<boolean> {
    const blobs = await this.storage.listBlobs(ownerDid)
    const match = blobs.find((blob) => blob.key === key)
    if (!match) return false

    await this.storage.deleteBlob(key)
    return true
  }

  async getUsage(ownerDid: string): Promise<{ used: number; limit: number; count: number }> {
    const blobs = await this.storage.listBlobs(ownerDid)
    const used = blobs.reduce((sum, blob) => sum + blob.sizeBytes, 0)
    return { used, limit: this.config.maxQuotaBytes, count: blobs.length }
  }
}

export class BackupError extends Error {
  constructor(
    public code: 'BLOB_TOO_LARGE' | 'QUOTA_EXCEEDED' | 'NOT_FOUND' | 'UNAUTHORIZED',
    message: string
  ) {
    super(message)
    this.name = 'BackupError'
  }
}
