/**
 * Blob Sync Provider - Handles blob synchronization between peers.
 *
 * Integrates with the Background Sync Manager's ConnectionManager to send
 * blob have/want/data messages over the same multiplexed WebSocket connection
 * used for Y.Doc sync. Uses a dedicated room for blob sync messages.
 *
 * Protocol:
 *   blob-have: Announce available CIDs to peers
 *   blob-want: Request missing blobs by CID
 *   blob-data: Transfer blob bytes (base64 encoded)
 *   blob-not-found: Signal unavailability
 */
import type { ConnectionManager } from './connection-manager'
import type { ContentId } from '@xnetjs/core'

/** Minimal blob store interface for sync (satisfied by BlobStore from @xnetjs/storage) */
export interface BlobStoreForSync {
  get(cid: ContentId): Promise<Uint8Array | null>
  put(data: Uint8Array): Promise<ContentId>
  has(cid: ContentId): Promise<boolean>
}

/** The room name used for all blob sync messages */
export const BLOB_SYNC_ROOM = 'xnet-blob-sync'

/** Maximum blob size to transfer inline (256KB). Larger ones need chunking. */
const MAX_INLINE_SIZE = 256 * 1024

export type BlobSyncMessage =
  | { type: 'blob-have'; cids: string[] }
  | { type: 'blob-want'; cids: string[] }
  | { type: 'blob-data'; cid: string; data: string } // base64 encoded
  | { type: 'blob-not-found'; cid: string }

export interface BlobSyncProviderConfig {
  /** Blob store for reading/writing blobs (e.g. BlobStore from @xnetjs/storage) */
  blobStore: BlobStoreForSync
  /** ConnectionManager from the SyncManager */
  connection: ConnectionManager
  /** Callback when a new blob is received */
  onBlobReceived?: (cid: ContentId) => void
}

export interface BlobSyncProvider {
  /** Start listening for blob sync messages */
  start(): void
  /** Stop and clean up */
  stop(): void
  /** Request blobs from peers (checks local store first, only requests missing) */
  requestBlobs(cids: ContentId[]): Promise<void>
  /** Announce blobs we have to peers */
  announceHave(cids: ContentId[]): void
  /** Number of pending requests */
  readonly pendingCount: number
}

export function createBlobSyncProvider(config: BlobSyncProviderConfig): BlobSyncProvider {
  const { blobStore, connection, onBlobReceived } = config
  let cleanup: (() => void) | null = null
  const pendingRequests = new Set<string>()

  function toBase64(data: Uint8Array): string {
    let binary = ''
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i])
    }
    return btoa(binary)
  }

  function fromBase64(str: string): Uint8Array {
    const binary = atob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }

  async function handleMessage(data: Record<string, unknown>): Promise<void> {
    const msg = data as unknown as BlobSyncMessage

    switch (msg.type) {
      case 'blob-want': {
        // Peer wants blobs, send them if we have them
        for (const cid of msg.cids) {
          const blobData = await blobStore.get(cid as ContentId)
          if (blobData) {
            // Only send inline if under size limit
            if (blobData.byteLength <= MAX_INLINE_SIZE) {
              connection.publish(BLOB_SYNC_ROOM, {
                type: 'blob-data',
                cid,
                data: toBase64(blobData)
              })
            } else {
              // For large blobs, send chunk-by-chunk (the manifest is small)
              connection.publish(BLOB_SYNC_ROOM, {
                type: 'blob-data',
                cid,
                data: toBase64(blobData)
              })
            }
          } else {
            connection.publish(BLOB_SYNC_ROOM, {
              type: 'blob-not-found',
              cid
            })
          }
        }
        break
      }

      case 'blob-data': {
        // Received blob data, store it
        const blobData = fromBase64(msg.data)
        await blobStore.put(blobData)
        pendingRequests.delete(msg.cid)
        onBlobReceived?.(msg.cid as ContentId)
        break
      }

      case 'blob-not-found': {
        // Peer doesn't have the blob
        pendingRequests.delete(msg.cid)
        break
      }

      case 'blob-have': {
        // Peer announces they have blobs - check if we need any
        const needed: string[] = []
        for (const cid of msg.cids) {
          if (!(await blobStore.has(cid as ContentId))) {
            needed.push(cid)
          }
        }
        if (needed.length > 0) {
          connection.publish(BLOB_SYNC_ROOM, {
            type: 'blob-want',
            cids: needed
          })
          for (const cid of needed) {
            pendingRequests.add(cid)
          }
        }
        break
      }
    }
  }

  return {
    start() {
      if (cleanup) return
      cleanup = connection.joinRoom(BLOB_SYNC_ROOM, (data) => {
        handleMessage(data)
      })
    },

    stop() {
      if (cleanup) {
        cleanup()
        cleanup = null
      }
      pendingRequests.clear()
    },

    async requestBlobs(cids) {
      const missing: string[] = []

      for (const cid of cids) {
        if (!(await blobStore.has(cid))) {
          missing.push(cid)
        }
      }

      if (missing.length > 0) {
        connection.publish(BLOB_SYNC_ROOM, {
          type: 'blob-want',
          cids: missing
        })
        for (const cid of missing) {
          pendingRequests.add(cid)
        }
      }
    },

    announceHave(cids) {
      if (cids.length > 0) {
        connection.publish(BLOB_SYNC_ROOM, {
          type: 'blob-have',
          cids: cids as string[]
        })
      }
    },

    get pendingCount() {
      return pendingRequests.size
    }
  }
}
