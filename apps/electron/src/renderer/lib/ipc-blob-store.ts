/**
 * IPC-based Blob Store for Electron renderer
 *
 * Routes all blob operations through IPC to the main process's SQLite storage.
 * This ensures blobs are available for the main process BSM to sync with peers.
 */

// Use string type for CIDs to avoid import issues
// ContentId is just a branded string in @xnetjs/core
type ContentId = string

// Debug logging - controlled by localStorage flag (same as sync debug)
function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[IPCBlobStore]', ...args)
  }
}

/**
 * Minimal blob store interface for sync (matches BlobStoreForSync from @xnetjs/react)
 */
export interface IPCBlobStore {
  get(cid: ContentId): Promise<Uint8Array | null>
  put(data: Uint8Array): Promise<ContentId>
  has(cid: ContentId): Promise<boolean>
}

/**
 * Creates a blob store that uses IPC to the main process.
 * Automatically announces new blobs to peers and requests missing blobs.
 */
export function createIPCBlobStore(): IPCBlobStore {
  return {
    async get(cid: ContentId): Promise<Uint8Array | null> {
      log('get() called for CID:', cid)

      // First check if we have it locally
      const data = await window.xnetBSM.getBlob(cid)
      if (data) {
        log('Found blob locally, size:', data.length)
        return new Uint8Array(data)
      }

      // We don't have it - request from peers
      log('Blob not found locally, requesting from peers:', cid)
      await window.xnetBSM.requestBlobs([cid])

      // TODO: Could wait for blob-received event, but for now return null
      // The UI should retry or show loading state
      return null
    },

    async put(data: Uint8Array): Promise<ContentId> {
      log('put() called, size:', data.length)
      const cid = await window.xnetBSM.putBlob(Array.from(data))
      log('Stored blob with CID:', cid)

      // Announce the new blob to peers
      log('Announcing new blob to peers:', cid)
      await window.xnetBSM.announceBlobs([cid])

      return cid
    },

    async has(cid: ContentId): Promise<boolean> {
      const result = await window.xnetBSM.hasBlob(cid)
      log('has() called for CID:', cid, 'result:', result)
      return result
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
