/**
 * Offline Queue - Persistent queue for Y.Doc updates made while disconnected
 *
 * When the network is unavailable, local Y.Doc updates are queued in persistent
 * storage. On reconnect, the queue is drained (replayed in order). This ensures
 * no local changes are lost, even across app restarts.
 */

import type { NodeStorageAdapter } from '@xnet/data'

export interface QueueEntry {
  /** Node ID this update belongs to */
  nodeId: string
  /** Serialized Y.Doc update (base64 encoded) */
  update: string
  /** Timestamp when queued */
  queuedAt: number
}

export interface OfflineQueueConfig {
  /** Storage adapter for persistence */
  storage: NodeStorageAdapter
  /** Storage key for the queue (default: '_xnet_offline_queue') */
  storageKey?: string
  /** Max queue size before dropping oldest entries (default: 1000) */
  maxSize?: number
}

export interface OfflineQueue {
  /** Enqueue an update for later broadcast */
  enqueue(nodeId: string, update: Uint8Array): Promise<void>
  /** Drain the queue, calling handler for each entry. Returns count drained. */
  drain(handler: (entry: QueueEntry) => Promise<void>): Promise<number>
  /** Number of entries in the queue */
  readonly size: number
  /** Load queue from storage */
  load(): Promise<void>
  /** Persist queue to storage */
  save(): Promise<void>
  /** Clear all entries */
  clear(): Promise<void>
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

export function createOfflineQueue(config: OfflineQueueConfig): OfflineQueue {
  const storageKey = config.storageKey ?? '_xnet_offline_queue'
  const maxSize = config.maxSize ?? 1000
  let entries: QueueEntry[] = []

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  return {
    async enqueue(nodeId, update) {
      entries.push({
        nodeId,
        update: toBase64(update),
        queuedAt: Date.now()
      })

      // Trim if over max size (drop oldest)
      if (entries.length > maxSize) {
        entries = entries.slice(entries.length - maxSize)
      }

      // Persist immediately (critical for crash resilience)
      await this.save()
    },

    async drain(handler) {
      let drained = 0
      while (entries.length > 0) {
        const entry = entries[0]
        try {
          await handler(entry)
          entries.shift()
          drained++
        } catch {
          // Failed to process — stop draining, entry stays at front
          break
        }
      }
      if (drained > 0) {
        await this.save()
      }
      return drained
    },

    get size() {
      return entries.length
    },

    async load() {
      try {
        const content = await config.storage.getDocumentContent(storageKey)
        if (content && content.length > 0) {
          const json = decoder.decode(content)
          const parsed = JSON.parse(json)
          if (Array.isArray(parsed)) {
            entries = parsed
          }
        }
      } catch {
        // No stored queue or parse error — start fresh
        entries = []
      }
    },

    async save() {
      try {
        const json = JSON.stringify(entries)
        const bytes = encoder.encode(json)
        await config.storage.setDocumentContent(storageKey, bytes)
      } catch (err) {
        console.warn('[OfflineQueue] Failed to persist:', err)
      }
    },

    async clear() {
      entries = []
      await this.save()
    }
  }
}
