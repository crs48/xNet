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
  cid?: string
  sourceHub?: string
  author?: string
  updatedAt?: number
}

export type FileMeta = {
  cid: string
  name: string
  mimeType: string
  sizeBytes: number
  uploaderDid: string
  referenceCount: number
  createdAt: number
}

export type AwarenessEntry = {
  room: string
  userDid: string
  state: {
    user?: {
      name?: string
      color?: string
      avatar?: string
      did?: string
    }
    cursor?: {
      anchor: number
      head: number
    }
    selection?: unknown
    online?: boolean
    [key: string]: unknown
  }
  lastSeen: number
}

export type PeerEndpoint = {
  type: 'websocket' | 'webrtc-signaling' | 'libp2p' | 'http'
  address: string
  priority: number
}

export type PeerRecord = {
  did: string
  publicKeyB64: string
  displayName?: string
  endpoints: PeerEndpoint[]
  hubUrl?: string
  capabilities: string[]
  lastSeen: number
  registeredAt: number
  version: number
}

export type FederationPeerRecord = {
  hubDid: string
  url: string
  schemas: string[] | '*'
  trustLevel: 'full' | 'metadata'
  maxLatencyMs: number
  rateLimit: number
  healthy: boolean
  lastSuccessAt: number | null
  registeredAt: number
  registeredBy?: string | null
}

export type FederationQueryLog = {
  queryId: string
  fromHub: string
  queryText: string
  schemaFilter: string | null
  resultCount: number
  executionMs: number
  timestamp: number
}

export type ShardAssignmentRecord = {
  shardId: number
  rangeStart: number
  rangeEnd: number
  primaryUrl: string
  primaryDid: string
  replicaUrl?: string | null
  replicaDid?: string | null
  docCount: number
  updatedAt: number
}

export type ShardHostRecord = {
  hubDid: string
  url: string
  capacity: number
  registeredAt: number
  lastSeen: number
}

export type ShardPosting = {
  shardId: number
  term: string
  cid: string
  tf: number
  title: string
  url?: string
  schema?: string
  author?: string
  language?: string
  indexedAt: number
  docLen: number
}

export type ShardTermStat = {
  shardId: number
  term: string
  docFreq: number
}

export type ShardStats = {
  shardId: number
  totalDocs: number
  avgDocLen: number
}

export type CrawlerProfile = {
  did: string
  type: 'browser' | 'desktop' | 'server'
  capacity: number
  languages: string[]
  domains?: string[]
  reputation: number
  totalCrawled: number
  registeredAt: number
}

export type CrawlQueueEntry = {
  url: string
  domain: string
  priority: number
  language?: string | null
  crawlCount: number
  lastCid?: string | null
  lastCrawledAt?: number | null
  enqueuedAt: number
}

export type CrawlHistoryEntry = {
  url: string
  cid: string
  title: string
  statusCode: number
  contentType: string
  language: string
  crawlerDid: string
  crawlTimeMs: number
  crawledAt: number
}

export type CrawlDomainState = {
  domain: string
  lastCrawledAt: number
  cooldownMs: number
  blocked: boolean
}

export type SchemaRecord = {
  iri: string
  version: number
  definition: Record<string, unknown>
  authorDid: string
  name: string
  description: string
  propertiesCount: number
  createdAt: number
}

export type SerializedNodeChange = {
  id: string
  type: string
  hash: string
  room: string
  nodeId: string
  schemaId?: string
  lamportTime: number
  lamportAuthor: string
  authorDid: string
  wallTime: number
  parentHash: string | null
  payload: {
    nodeId: string
    schemaId?: string
    properties: Record<string, unknown>
    deleted?: boolean
  }
  signatureB64: string
  batchId?: string
  batchIndex?: number
  batchSize?: number
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
  updateSearchBody?: (docId: string, text: string) => Promise<void>

  getFileMeta: (cid: string) => Promise<FileMeta | null>
  putFile: (cid: string, data: Uint8Array, meta: Omit<FileMeta, 'referenceCount' | 'createdAt'>) => Promise<void>
  getFileData: (cid: string) => Promise<Uint8Array | null>
  deleteFile: (cid: string) => Promise<void>
  listFiles: (uploaderDid: string) => Promise<FileMeta[]>
  getFilesUsage: (uploaderDid: string) => Promise<{ totalBytes: number; fileCount: number }>

  setAwareness: (entry: AwarenessEntry) => Promise<void>
  getAwareness: (room: string) => Promise<AwarenessEntry[]>
  removeAwareness: (room: string, userDid: string) => Promise<void>
  cleanStaleAwareness: (olderThanMs: number) => Promise<number>

  upsertPeer: (peer: PeerRecord) => Promise<void>
  getPeer: (did: string) => Promise<PeerRecord | null>
  listRecentPeers: (limit?: number) => Promise<PeerRecord[]>
  searchPeers: (query: string) => Promise<PeerRecord[]>
  removeStalePeers: (olderThanMs: number) => Promise<number>
  getPeerCount: () => Promise<number>

  listFederationPeers: () => Promise<FederationPeerRecord[]>
  upsertFederationPeer: (peer: FederationPeerRecord) => Promise<void>
  updateFederationPeerHealth: (
    hubDid: string,
    healthy: boolean,
    lastSuccessAt?: number | null
  ) => Promise<void>
  logFederationQuery: (entry: FederationQueryLog) => Promise<void>

  listShardAssignments: () => Promise<ShardAssignmentRecord[]>
  replaceShardAssignments: (assignments: ShardAssignmentRecord[]) => Promise<void>
  upsertShardHost: (host: ShardHostRecord) => Promise<void>
  listShardHosts: () => Promise<ShardHostRecord[]>
  removeShardHost: (hubDid: string) => Promise<void>
  insertShardPosting: (posting: ShardPosting) => Promise<void>
  listShardPostings: (shardId: number, terms: string[]) => Promise<ShardPosting[]>
  recomputeShardTermStats: (shardId: number, terms: string[]) => Promise<void>
  getShardTermStats: (shardId: number, terms: string[]) => Promise<ShardTermStat[]>
  getShardStats: (shardId: number) => Promise<ShardStats>
  updateShardDocCount: (shardId: number, docCount: number) => Promise<void>

  upsertCrawler: (profile: CrawlerProfile) => Promise<void>
  getCrawler: (did: string) => Promise<CrawlerProfile | null>
  listCrawlers: () => Promise<CrawlerProfile[]>
  updateCrawlerStats: (
    did: string,
    updates: { reputation?: number; totalCrawled?: number }
  ) => Promise<void>
  upsertCrawlQueue: (entry: CrawlQueueEntry) => Promise<void>
  getQueuedUrls: (options: {
    limit: number
    languages?: string[]
    domains?: string[]
  }) => Promise<CrawlQueueEntry[]>
  getCrawlHistory: (url: string) => Promise<CrawlHistoryEntry | null>
  appendCrawlHistory: (entry: CrawlHistoryEntry) => Promise<void>
  upsertCrawlDomainState: (state: CrawlDomainState) => Promise<void>
  getCrawlDomainState: (domain: string) => Promise<CrawlDomainState | null>

  putSchema: (schema: SchemaRecord) => Promise<void>
  getSchema: (iri: string, version?: number) => Promise<SchemaRecord | null>
  listSchemasByAuthor: (authorDid: string) => Promise<SchemaRecord[]>
  searchSchemas: (
    query: string,
    options?: { limit?: number; offset?: number }
  ) => Promise<SchemaRecord[]>
  listPopularSchemas: (limit?: number) => Promise<SchemaRecord[]>

  hasNodeChange: (hash: string) => Promise<boolean>
  appendNodeChange: (room: string, change: SerializedNodeChange) => Promise<void>
  getNodeChangesSince: (room: string, sinceLamport: number) => Promise<SerializedNodeChange[]>
  getNodeChangesForNode: (room: string, nodeId: string) => Promise<SerializedNodeChange[]>
  getHighWaterMark: (room: string) => Promise<number>

  close: () => Promise<void>
}
