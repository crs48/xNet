/**
 * IPC-based Blob Store for Electron renderer
 *
 * Routes all blob operations through IPC to the main process's SQLite storage.
 * This ensures blobs are available for the main process BSM to sync with peers.
 */

// Use string type for CIDs to avoid import issues
// ContentId is just a branded string in @xnet/core
type ContentId = string

/**
 * Minimal blob store interface for sync (matches BlobStoreForSync from @xnet/react)
 */
export interface IPCBlobStore {
  get(cid: ContentId): Promise<Uint8Array | null>
  put(data: Uint8Array): Promise<ContentId>
  has(cid: ContentId): Promise<boolean>
}

/**
 * Creates a blob store that uses IPC to the main process.
 */
export function createIPCBlobStore(): IPCBlobStore {
  return {
    async get(cid: ContentId): Promise<Uint8Array | null> {
      const data = await window.xnetBSM.getBlob(cid)
      return data ? new Uint8Array(data) : null
    },

    async put(data: Uint8Array): Promise<ContentId> {
      const cid = await window.xnetBSM.putBlob(Array.from(data))
      return cid
    },

    async has(cid: ContentId): Promise<boolean> {
      return window.xnetBSM.hasBlob(cid)
    }
  }
}

/**
 * Subscribe to blob received events from the main process.
 * Called when a blob is received from a peer via sync.
 */
export function onBlobReceived(callback: (cid: ContentId) => void): () => void {
  return window.xnetBSM.onBlobReceived(callback)
}
