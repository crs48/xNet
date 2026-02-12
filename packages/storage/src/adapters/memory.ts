import type { StorageAdapter, StorageTelemetry } from '../types'
import type { ContentId } from '@xnet/core'

export class MemoryAdapter implements StorageAdapter {
  private blobs = new Map<string, Uint8Array>()
  private telemetry?: StorageTelemetry

  constructor(options?: { telemetry?: StorageTelemetry }) {
    this.telemetry = options?.telemetry
  }

  async open(): Promise<void> {}
  async close(): Promise<void> {}

  async clear(): Promise<void> {
    this.blobs.clear()
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    const start = this.telemetry ? Date.now() : 0
    try {
      const result = this.blobs.get(cid) ?? null

      if (this.telemetry) {
        this.telemetry.reportPerformance('storage.getBlob', Date.now() - start)
        this.telemetry.reportUsage('storage.read', 1)
      }

      return result
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'storage.MemoryAdapter.getBlob'
      })
      throw err
    }
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    const start = this.telemetry ? Date.now() : 0
    try {
      this.blobs.set(cid, data)

      if (this.telemetry) {
        this.telemetry.reportPerformance('storage.setBlob', Date.now() - start)
        this.telemetry.reportUsage('storage.write', 1)
      }
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'storage.MemoryAdapter.setBlob'
      })
      throw err
    }
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    const start = this.telemetry ? Date.now() : 0
    try {
      const result = this.blobs.has(cid)

      if (this.telemetry) {
        this.telemetry.reportPerformance('storage.hasBlob', Date.now() - start)
      }

      return result
    } catch (err) {
      this.telemetry?.reportCrash(err as Error, {
        codeNamespace: 'storage.MemoryAdapter.hasBlob'
      })
      throw err
    }
  }
}
