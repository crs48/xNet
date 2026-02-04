/**
 * @xnet/hub - In-memory storage adapter.
 */

import type { BlobMeta, DocMeta, HubStorage, SearchOptions, SearchResult } from './interface'

export const createMemoryStorage = (): HubStorage => {
  const docStates = new Map<string, Uint8Array>()
  const docMetas = new Map<string, DocMeta>()
  const blobs = new Map<string, { data: Uint8Array; meta: BlobMeta }>()

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

      if (meta.title.toLowerCase().includes(q)) {
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

  const close = async (): Promise<void> => {
    docStates.clear()
    docMetas.clear()
    blobs.clear()
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
    close
  }
}
