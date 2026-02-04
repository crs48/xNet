/**
 * @xnet/hub - In-memory storage adapter.
 */

import type {
  BlobMeta,
  DocMeta,
  FileMeta,
  HubStorage,
  SearchOptions,
  SearchResult,
  SerializedNodeChange
} from './interface'

export const createMemoryStorage = (): HubStorage => {
  const docStates = new Map<string, Uint8Array>()
  const docMetas = new Map<string, DocMeta>()
  const blobs = new Map<string, { data: Uint8Array; meta: BlobMeta }>()
  const searchBodies = new Map<string, string>()
  const nodeChangesByHash = new Map<string, SerializedNodeChange>()
  const nodeChangesByRoom = new Map<string, SerializedNodeChange[]>()
  const files = new Map<string, { data: Uint8Array; meta: FileMeta }>()

  const getDocState = async (docId: string): Promise<Uint8Array | null> =>
    docStates.get(docId) ?? null

  const setDocState = async (docId: string, state: Uint8Array): Promise<void> => {
    docStates.set(docId, new Uint8Array(state))
  }

  const getStateVector = async (_docId: string): Promise<Uint8Array | null> => null

  const putBlob = async (key: string, data: Uint8Array, meta: BlobMeta): Promise<void> => {
    blobs.set(key, { data: new Uint8Array(data), meta })
  }

  const getBlob = async (key: string): Promise<Uint8Array | null> => blobs.get(key)?.data ?? null

  const listBlobs = async (ownerDid: string): Promise<BlobMeta[]> =>
    Array.from(blobs.values())
      .map((entry) => entry.meta)
      .filter((meta) => meta.ownerDid === ownerDid)
      .sort((a, b) => b.createdAt - a.createdAt)

  const deleteBlob = async (key: string): Promise<void> => {
    blobs.delete(key)
  }

  const setDocMeta = async (docId: string, meta: DocMeta): Promise<void> => {
    docMetas.set(docId, meta)
  }

  const getDocMeta = async (docId: string): Promise<DocMeta | null> => docMetas.get(docId) ?? null

  const search = async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
    const q = query.toLowerCase()
    const results: SearchResult[] = []

    for (const meta of docMetas.values()) {
      if (options?.schemaIri && meta.schemaIri !== options.schemaIri) continue
      if (options?.ownerDid && meta.ownerDid !== options.ownerDid) continue

      const body = searchBodies.get(meta.docId)?.toLowerCase() ?? ''
      if (meta.title.toLowerCase().includes(q) || body.includes(q)) {
        results.push({
          docId: meta.docId,
          title: meta.title,
          schemaIri: meta.schemaIri,
          snippet: meta.title,
          rank: -1
        })
      }
    }

    const offset = options?.offset ?? 0
    const limit = options?.limit ?? 20
    return results.slice(offset, offset + limit)
  }

  const updateSearchBody = async (docId: string, text: string): Promise<void> => {
    searchBodies.set(docId, text)
  }

  const getFileMeta = async (cid: string): Promise<FileMeta | null> =>
    files.get(cid)?.meta ?? null

  const putFile = async (
    cid: string,
    data: Uint8Array,
    meta: Omit<FileMeta, 'referenceCount' | 'createdAt'>
  ): Promise<void> => {
    const entry: FileMeta = {
      ...meta,
      cid,
      referenceCount: 1,
      createdAt: Date.now()
    }
    files.set(cid, { data: new Uint8Array(data), meta: entry })
  }

  const getFileData = async (cid: string): Promise<Uint8Array | null> =>
    files.get(cid)?.data ?? null

  const deleteFile = async (cid: string): Promise<void> => {
    files.delete(cid)
  }

  const listFiles = async (uploaderDid: string): Promise<FileMeta[]> =>
    Array.from(files.values())
      .map((entry) => entry.meta)
      .filter((meta) => meta.uploaderDid === uploaderDid)
      .sort((a, b) => b.createdAt - a.createdAt)

  const getFilesUsage = async (
    uploaderDid: string
  ): Promise<{ totalBytes: number; fileCount: number }> => {
    const uploaded = await listFiles(uploaderDid)
    return {
      totalBytes: uploaded.reduce((sum, file) => sum + file.sizeBytes, 0),
      fileCount: uploaded.length
    }
  }

  const hasNodeChange = async (hash: string): Promise<boolean> => nodeChangesByHash.has(hash)

  const appendNodeChange = async (room: string, change: SerializedNodeChange): Promise<void> => {
    if (nodeChangesByHash.has(change.hash)) return
    nodeChangesByHash.set(change.hash, change)
    const existing = nodeChangesByRoom.get(room) ?? []
    existing.push(change)
    nodeChangesByRoom.set(room, existing)
  }

  const getNodeChangesSince = async (
    room: string,
    sinceLamport: number
  ): Promise<SerializedNodeChange[]> => {
    const changes = nodeChangesByRoom.get(room) ?? []
    return changes
      .filter((change) => change.lamportTime > sinceLamport)
      .sort((a, b) =>
        a.lamportTime === b.lamportTime
          ? a.lamportAuthor.localeCompare(b.lamportAuthor)
          : a.lamportTime - b.lamportTime
      )
  }

  const getNodeChangesForNode = async (
    room: string,
    nodeId: string
  ): Promise<SerializedNodeChange[]> => {
    const changes = nodeChangesByRoom.get(room) ?? []
    return changes
      .filter((change) => change.nodeId === nodeId)
      .sort((a, b) => a.lamportTime - b.lamportTime)
  }

  const getHighWaterMark = async (room: string): Promise<number> => {
    const changes = nodeChangesByRoom.get(room) ?? []
    return changes.reduce((max, change) => Math.max(max, change.lamportTime), 0)
  }

  const close = async (): Promise<void> => {
    docStates.clear()
    docMetas.clear()
    blobs.clear()
    searchBodies.clear()
    nodeChangesByHash.clear()
    nodeChangesByRoom.clear()
    files.clear()
  }

  return {
    getDocState,
    setDocState,
    getStateVector,
    putBlob,
    getBlob,
    listBlobs,
    deleteBlob,
    setDocMeta,
    getDocMeta,
    search,
    updateSearchBody,
    getFileMeta,
    putFile,
    getFileData,
    deleteFile,
    listFiles,
    getFilesUsage,
    hasNodeChange,
    appendNodeChange,
    getNodeChangesSince,
    getNodeChangesForNode,
    getHighWaterMark,
    close
  }
}
