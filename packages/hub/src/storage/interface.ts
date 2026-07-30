/**
 * @xnetjs/hub - Storage interface for hub persistence.
 */

import type { ContentFingerprint } from '@xnetjs/abuse'

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

export type GrantIndexRecord = {
  grantId: string
  granteeDid: string
  resourceDocId: string
  actions: string[]
  expiresAt: number
  revokedAt: number
  createdAt: number
}

export type ShareLinkRole = 'read' | 'comment' | 'write'

export type ShareLinkRecord = {
  linkId: string
  docId: string
  docType: string
  role: ShareLinkRole
  /** sha256 (base64url) of the bearer secret carried in the URL fragment. */
  secretHash: string
  createdByDid: string
  label: string | null
  /** 0 = never expires. */
  expiresAt: number
  /** 0 = unlimited uses. */
  maxUses: number
  useCount: number
  disabled: boolean
  createdAt: number
}

/**
 * Owner-published preview snapshot for a share link (exploration 0295).
 * Sanitized display fields only — never node content.
 */
export type ShareLinkPreviewRecord = {
  linkId: string
  title: string
  icon: string | null
  updatedAt: number
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
  contentFingerprint?: ContentFingerprint | null
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
  protocolVersion?: number
  batchId?: string
  batchIndex?: number
  batchSize?: number
}

/** Largest node-change page the pull path will assemble in one response. */
export const NODE_SYNC_PAGE_SIZE = 1000

/**
 * One page of a room's node-change log.
 *
 * `highWaterMark` is the cursor the client persists, so it may never run ahead
 * of the last change in `changes` — the client only re-requests `lamport >
 * cursor`, so anything between the page and a further-ahead mark is skipped for
 * good. When the page is short the mark IS the room-wide max (nothing was left
 * behind, and the client's rollback guard needs the room-wide value to detect a
 * hub that lost history). `hasMore` tells the client to come straight back for
 * the next page instead of waiting for the next reconnect.
 */
export type NodeChangePage = {
  changes: SerializedNodeChange[]
  highWaterMark: number
  hasMore: boolean
}

// ─── Database Row Types ──────────────────────────────────────────────────────

export type DatabaseRowRecord = {
  id: string
  databaseId: string
  sortKey: string
  data: Record<string, unknown>
  searchable: string
  createdAt: number
  createdBy: string
  updatedAt: number
}

export type DatabaseRowQueryOptions = {
  databaseId: string
  filters?: DatabaseFilterGroup
  sorts?: DatabaseSortConfig[]
  search?: string
  limit?: number
  cursor?: string
  select?: string[]
}

export type DatabaseFilterGroup = {
  operator: 'and' | 'or'
  conditions: (DatabaseFilterCondition | DatabaseFilterGroup)[]
}

export type DatabaseFilterCondition = {
  columnId: string
  operator: DatabaseFilterOperator
  value: unknown
}

export type DatabaseFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'before'
  | 'after'
  | 'between'
  | 'hasAny'
  | 'hasAll'
  | 'hasNone'

export type DatabaseSortConfig = {
  columnId: string
  direction: 'asc' | 'desc'
}

export type DatabaseRowQueryResult = {
  rows: DatabaseRowRecord[]
  total: number
  cursor?: string
  hasMore: boolean
  queryTime: number
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
  listDocRecipients: (docId: string) => Promise<string[]>
  upsertGrantIndex: (record: GrantIndexRecord) => Promise<void>
  removeGrantIndex: (grantId: string) => Promise<void>
  listGrantedDocIds: (granteeDid: string, now?: number) => Promise<string[]>
  listGrantsForDoc: (docId: string) => Promise<GrantIndexRecord[]>
  getActiveGrant: (
    granteeDid: string,
    docId: string,
    now?: number
  ) => Promise<GrantIndexRecord | null>
  revokeGrant: (grantId: string, revokedAt?: number) => Promise<void>

  // ─── Space containment index (exploration 0179) ─────────────────────────────
  // A uniform parent pointer per node: a content node points to its Space; a
  // Space points to its parent Space. Walking it from any node yields exactly
  // that node's ancestor Spaces, which is how container (subtree) grants are
  // resolved — a grant whose resource is a Space id covers every node beneath it.
  /** Set (or clear, with null) a node's container. */
  setNodeContainer: (nodeId: string, containerId: string | null) => Promise<void>
  /** A node's immediate container id, or null. */
  getNodeContainer: (nodeId: string) => Promise<string | null>
  /** Ancestor container ids, nearest-first; cycle- and depth-bounded. */
  ancestorContainers: (nodeId: string, maxDepth?: number) => Promise<string[]>
  /** Direct children of a container (nodes whose immediate container is this id). */
  listContainedNodes: (containerId: string) => Promise<string[]>

  // ─── Node visibility index (exploration 0179) ───────────────────────────────
  // The private→public dial. `inherit` (or absent) defers to the node's Space.
  /** Set (or clear, with null) a node's own visibility. */
  setNodeVisibility: (nodeId: string, visibility: string | null) => Promise<void>
  /** A node's own visibility, or null when unset/inherited. */
  getNodeVisibility: (nodeId: string) => Promise<string | null>

  // ─── Node ownership (exploration 0358 security follow-up) ──────────────────
  // Learned from the authenticated `node-change` relay, NOT from `doc_meta`:
  // `doc_meta.ownerDid` is written only by the optional `index-update` message
  // (`enableSearchIndex`, off by default and set by no shipped app), so relying
  // on it meant every Space was ownerless. Authorization must not depend on a
  // best-effort search-index publisher having run.
  /**
   * Record `ownerDid` as the node's owner IFF no owner is recorded yet.
   * Returns whether this call was the one that recorded it.
   *
   * FIRST WRITER WINS, deliberately: the creator is always the first DID to
   * relay a node, so an existing owner is never overwritten and a DID that
   * merely learns a node id cannot seize ownership. There is no update path.
   */
  setNodeOwnerIfAbsent: (nodeId: string, ownerDid: string) => Promise<boolean>
  /** The recorded owner DID, or null when ownership was never observed. */
  getNodeOwner: (nodeId: string) => Promise<string | null>
  /**
   * The author of the node's EARLIEST recorded change — i.e. whoever created
   * it. Signatures are verified on ingest (`NodeRelayService.handleNodeChange`
   * → `verifyChangeFast`), so this is attested, not self-declared.
   *
   * Covers nodes that synced before ownership was recorded, so the fix for
   * ownerless Spaces needs no backfill migration.
   */
  getNodeCreatorDid: (nodeId: string) => Promise<string | null>

  insertShareLink: (record: ShareLinkRecord) => Promise<void>
  getShareLink: (linkId: string) => Promise<ShareLinkRecord | null>
  listShareLinks: (docId: string) => Promise<ShareLinkRecord[]>
  setShareLinkDisabled: (linkId: string, disabled: boolean) => Promise<void>
  incrementShareLinkUse: (linkId: string) => Promise<void>
  /** Also removes the link's preview snapshot, if any. */
  deleteShareLink: (linkId: string) => Promise<void>

  // ─── Share-link preview snapshots (exploration 0295) ────────────────────────
  // Owner-published `{ title, icon }` served to holders of the linkId so a
  // pasted share URL can up-res into a titled card. The hub never reads node
  // content to produce these; presence of a row is the owner's opt-in.
  upsertShareLinkPreview: (record: ShareLinkPreviewRecord) => Promise<void>
  getShareLinkPreview: (linkId: string) => Promise<ShareLinkPreviewRecord | null>
  deleteShareLinkPreview: (linkId: string) => Promise<void>

  getFileMeta: (cid: string) => Promise<FileMeta | null>
  putFile: (
    cid: string,
    data: Uint8Array,
    meta: Omit<FileMeta, 'referenceCount' | 'createdAt'>
  ) => Promise<void>
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
  listRecentCrawlHistory: (options?: { limit?: number }) => Promise<CrawlHistoryEntry[]>
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
  /**
   * One page of a room's log after `sinceLamport`, for the WS pull path.
   * Pages on the author lamport; see {@link NodeChangePage} for why the
   * returned mark is page-relative rather than room-wide.
   */
  getNodeChangesSince: (
    room: string,
    sinceLamport: number,
    limit?: number
  ) => Promise<NodeChangePage>
  getNodeChangesForNode: (room: string, nodeId: string) => Promise<SerializedNodeChange[]>
  /**
   * Agent audit trail (exploration 0337): an author's changes across all
   * rooms, paged on the per-author lamport cursor. Backed by
   * `idx_node_changes_author_lamport` — never a scan.
   */
  getNodeChangesByAuthor: (
    authorDid: string,
    sinceLamport: number,
    limit?: number
  ) => Promise<SerializedNodeChange[]>
  getHighWaterMark: (room: string) => Promise<number>

  // ─── Share rooms (exploration 0298) ─────────────────────────────────────────
  // A node change physically lives in exactly one room (`node_changes.hash` is a
  // global PK). To deliver a channel's nodes to a share-link grantee without
  // duplicating content, we INDEX an existing change into extra "share rooms"
  // (`xnet-channel-<id>`) via a mapping keyed by a per-mapping monotonic `seq`.
  // Share-room sync cursors on that `seq` — NOT the author lamport — because a
  // channel room aggregates changes from many authors whose lamports are not
  // mutually ordered.
  /** Index an existing change (by hash) into a share room. Idempotent. */
  addChangeToRoom: (room: string, hash: string) => Promise<void>
  /**
   * Share-room changes with `seq > sinceSeq`, oldest-first, plus the highest
   * `seq` in the returned batch (the client's next cursor). Bounded by `limit`.
   */
  /**
   * One page of a share room, cursored on the per-room `seq`. `seq` is unique
   * per mapping, so unlike the lamport path there is no tie group to keep whole.
   */
  getRoomChangesSince: (room: string, sinceSeq: number, limit?: number) => Promise<NodeChangePage>
  /** Latest Profile node-change hash authored by a DID, or null. */
  getLatestProfileHash: (did: string) => Promise<string | null>
  /**
   * Bytes of node-change data attributed to a DID (payload + signature),
   * summed on demand. Backs the demo-mode per-user storage cap
   * (exploration 0291) — the append-only `node_changes` log is the primary
   * grower and, unlike backups/files, had no quota gate.
   */
  getUsageBytesByDid: (did: string) => Promise<number>
  /**
   * Delete every stored node-change for a room and return how many were
   * removed. Used by the "reset my data" dev tool — clearing a room is gated
   * on `hub/relay` for that room (you can only wipe rooms you can write to).
   */
  clearNodeChanges: (room: string) => Promise<number>
  /**
   * Delete every stored node-change authored by a DID across all rooms and
   * return how many were removed. The Right-to-Leave hub-purge port
   * (explorations 0234/0344): a departing identity's `DELETE
   * /export/changes` removes its authored content from this hub.
   */
  deleteNodeChangesByAuthor: (authorDid: string) => Promise<number>
  /**
   * Wipe all user-content data (node changes, doc state, doc meta, database
   * rows, blobs, files, grants, share links, containment/visibility, awareness)
   * and return per-table counts. Backs the demo hub's scheduled daily reset
   * (exploration 0291); leaves infrastructure (schemas, keys, peers,
   * federation, shards) intact.
   */
  resetAllUserData: () => Promise<{ nodeChanges: number; docStates: number }>

  // Database row operations
  insertDatabaseRow: (row: DatabaseRowRecord) => Promise<void>
  updateDatabaseRow: (
    rowId: string,
    updates: Partial<Omit<DatabaseRowRecord, 'id' | 'databaseId' | 'createdAt' | 'createdBy'>>
  ) => Promise<void>
  deleteDatabaseRow: (rowId: string) => Promise<void>
  getDatabaseRow: (rowId: string) => Promise<DatabaseRowRecord | null>
  queryDatabaseRows: (options: DatabaseRowQueryOptions) => Promise<DatabaseRowQueryResult>
  getDatabaseRowCount: (databaseId: string) => Promise<number>
  batchInsertDatabaseRows: (rows: DatabaseRowRecord[]) => Promise<void>
  rebuildDatabaseRowsFts: (databaseId: string) => Promise<void>

  close: () => Promise<void>
}
