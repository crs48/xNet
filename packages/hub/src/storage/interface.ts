/**
 * @xnet/hub - Storage interface for hub persistence.
 */

export type BlobMeta = {
  key: string
  docId: string
  ownerDid: string
  sizeBytes: number
  contentType: string
  createdAt: number
}

export type DocMeta = {
  docId: string
  ownerDid: string
  schemaIri: string
  title: string
  properties?: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export type SearchOptions = {
  schemaIri?: string
  ownerDid?: string
  limit?: number
  offset?: number
}

export type SearchResult = {
  docId: string
  title: string
  schemaIri: string
  snippet: string
  rank: number
}

export type HubStorage = {
  getDocState: (docId: string) => Promise<Uint8Array | null>
  setDocState: (docId: string, state: Uint8Array) => Promise<void>
  getStateVector: (docId: string) => Promise<Uint8Array | null>

  putBlob: (key: string, data: Uint8Array, meta: BlobMeta) => Promise<void>
  getBlob: (key: string) => Promise<Uint8Array | null>
  listBlobs: (ownerDid: string) => Promise<BlobMeta[]>
  deleteBlob: (key: string) => Promise<void>

  setDocMeta: (docId: string, meta: DocMeta) => Promise<void>
  getDocMeta: (docId: string) => Promise<DocMeta | null>
  search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>

  close: () => Promise<void>
}
