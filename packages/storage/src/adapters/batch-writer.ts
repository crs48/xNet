import type { StorageAdapter } from '../types'
import type { ContentId } from '@xnetjs/core'

type Operation = { type: 'setBlob'; cid: ContentId; data: Uint8Array }

interface BatchWriterOptions {
  maxBatchSize?: number
  maxWaitMs?: number
  debug?: boolean
}

export class BatchWriter implements StorageAdapter {
  private adapter: StorageAdapter
  private pending: Operation[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<void> | null = null
  private maxBatchSize: number
  private maxWaitMs: number
  private debug: boolean

  constructor(adapter: StorageAdapter, options: BatchWriterOptions = {}) {
    this.adapter = adapter
    this.maxBatchSize = options.maxBatchSize ?? 50
    this.maxWaitMs = options.maxWaitMs ?? 16
    this.debug = options.debug ?? false
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[BatchWriter]', ...args)
    }
  }

  async open(): Promise<void> {
    await this.adapter.open()
  }

  async close(): Promise<void> {
    await this.flush()
    await this.adapter.close()
  }

  async clear(): Promise<void> {
    await this.flush()
    await this.adapter.clear()
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const op = this.pending[i]
      if (op.cid === cid) {
        return op.data
      }
    }
    return this.adapter.getBlob(cid)
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    for (const op of this.pending) {
      if (op.cid === cid) {
        return true
      }
    }
    return this.adapter.hasBlob(cid)
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    const exists = this.pending.some((op) => op.cid === cid)
    if (!exists) {
      this.pending.push({ type: 'setBlob', cid, data })
    }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.pending.length >= this.maxBatchSize) {
      this.flush()
      return
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, this.maxWaitMs)
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.flushPromise) {
      await this.flushPromise
    }

    if (this.pending.length === 0) {
      return
    }

    const operations = this.pending
    this.pending = []

    this.log('Flushing', operations.length, 'operations')

    this.flushPromise = this.executeFlush(operations)
    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
    }
  }

  private async executeFlush(operations: Operation[]): Promise<void> {
    const promises: Promise<void>[] = []
    for (const { cid, data } of operations) {
      promises.push(this.adapter.setBlob(cid, data))
    }
    await Promise.all(promises)
  }

  get pendingCount(): number {
    return this.pending.length
  }
}

export function createBatchWriter(
  adapter: StorageAdapter,
  options?: BatchWriterOptions
): BatchWriter {
  return new BatchWriter(adapter, options)
}
