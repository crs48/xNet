/**
 * @xnetjs/hub - In-memory storage adapter.
 */

import type {
  AwarenessEntry,
  BlobMeta,
  DocMeta,
  FileMeta,
  FederationPeerRecord,
  FederationQueryLog,
  HubStorage,
  PeerRecord,
  CrawlerProfile,
  CrawlQueueEntry,
  CrawlHistoryEntry,
  CrawlDomainState,
  ShardAssignmentRecord,
  ShardHostRecord,
  ShardPosting,
  ShardStats,
  ShardTermStat,
  SchemaRecord,
  SearchOptions,
  SearchResult,
  SerializedNodeChange,
  GrantIndexRecord,
  DatabaseRowRecord,
  DatabaseRowQueryOptions,
  DatabaseRowQueryResult,
  DatabaseFilterGroup,
  DatabaseFilterCondition
} from './interface'

export const createMemoryStorage = (): HubStorage => {
  const docStates = new Map<string, Uint8Array>()
  const docMetas = new Map<string, DocMeta>()
  const blobs = new Map<string, { data: Uint8Array; meta: BlobMeta }>()
  const searchBodies = new Map<string, string>()
  const docRecipients = new Map<string, Set<string>>()
  const grantsById = new Map<string, GrantIndexRecord>()
  const nodeChangesByHash = new Map<string, SerializedNodeChange>()
  const nodeChangesByRoom = new Map<string, SerializedNodeChange[]>()
  const files = new Map<string, { data: Uint8Array; meta: FileMeta }>()
  const schemasByIri = new Map<string, Map<number, SchemaRecord>>()
  const awarenessByRoom = new Map<string, Map<string, AwarenessEntry>>()
  const peersByDid = new Map<string, PeerRecord>()
  const federationPeers = new Map<string, FederationPeerRecord>()
  const federationLogs: FederationQueryLog[] = []
  const shardAssignments = new Map<number, ShardAssignmentRecord>()
  const shardHosts = new Map<string, ShardHostRecord>()
  const shardPostings = new Map<string, ShardPosting>()
  const shardTermStats = new Map<string, ShardTermStat>()
  const crawlersByDid = new Map<string, CrawlerProfile>()
  const crawlQueue = new Map<string, CrawlQueueEntry>()
  const crawlHistory = new Map<string, CrawlHistoryEntry>()
  const crawlDomains = new Map<string, CrawlDomainState>()
  const databaseRows = new Map<string, DatabaseRowRecord>()

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object')

  const getLatestSchema = (versions: Map<number, SchemaRecord>): SchemaRecord | null => {
    let latest: SchemaRecord | null = null
    for (const schema of versions.values()) {
      if (!latest || schema.version > latest.version) {
        latest = schema
      }
    }
    return latest
  }

  const getLatestSchemas = (): SchemaRecord[] =>
    Array.from(schemasByIri.values())
      .map(getLatestSchema)
      .filter((schema): schema is SchemaRecord => schema !== null)

  const getSchemaPropertyNames = (schema: SchemaRecord): string[] => {
    const definition = schema.definition as { properties?: unknown }
    const properties = definition.properties
    if (Array.isArray(properties)) {
      return properties
        .map((prop) => (isRecord(prop) && typeof prop.name === 'string' ? prop.name : ''))
        .filter((name) => name.length > 0)
    }
    if (isRecord(properties)) {
      return Object.keys(properties)
    }
    return []
  }

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
    const maybeRecipients = meta.properties?.recipients
    const recipients = new Set<string>()
    if (Array.isArray(maybeRecipients)) {
      for (const value of maybeRecipients) {
        if (typeof value === 'string') {
          recipients.add(value)
        }
      }
    }
    docRecipients.set(docId, recipients)
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

  const listDocRecipients = async (docId: string): Promise<string[]> =>
    Array.from(docRecipients.get(docId) ?? [])

  const upsertGrantIndex = async (record: GrantIndexRecord): Promise<void> => {
    grantsById.set(record.grantId, record)
  }

  const removeGrantIndex = async (grantId: string): Promise<void> => {
    grantsById.delete(grantId)
  }

  const listGrantedDocIds = async (granteeDid: string, now = Date.now()): Promise<string[]> => {
    const resources = new Set<string>()

    for (const grant of grantsById.values()) {
      if (grant.granteeDid !== granteeDid) continue
      if (grant.revokedAt > 0) continue
      if (grant.expiresAt > 0 && grant.expiresAt <= now) continue
      resources.add(grant.resourceDocId)
    }

    return Array.from(resources)
  }

  const getFileMeta = async (cid: string): Promise<FileMeta | null> => files.get(cid)?.meta ?? null

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

  const setAwareness = async (entry: AwarenessEntry): Promise<void> => {
    const roomEntries = awarenessByRoom.get(entry.room) ?? new Map<string, AwarenessEntry>()
    roomEntries.set(entry.userDid, entry)
    awarenessByRoom.set(entry.room, roomEntries)
  }

  const getAwareness = async (room: string): Promise<AwarenessEntry[]> => {
    const entries = awarenessByRoom.get(room)
    if (!entries) return []
    return Array.from(entries.values()).sort((a, b) => b.lastSeen - a.lastSeen)
  }

  const removeAwareness = async (room: string, userDid: string): Promise<void> => {
    const entries = awarenessByRoom.get(room)
    if (!entries) return
    entries.delete(userDid)
    if (entries.size === 0) {
      awarenessByRoom.delete(room)
    }
  }

  const cleanStaleAwareness = async (olderThanMs: number): Promise<number> => {
    const cutoff = Date.now() - olderThanMs
    let removed = 0

    for (const [room, entries] of awarenessByRoom.entries()) {
      for (const [userDid, entry] of entries.entries()) {
        if (entry.lastSeen < cutoff) {
          entries.delete(userDid)
          removed++
        }
      }
      if (entries.size === 0) {
        awarenessByRoom.delete(room)
      }
    }

    return removed
  }

  const upsertPeer = async (peer: PeerRecord): Promise<void> => {
    peersByDid.set(peer.did, peer)
  }

  const getPeer = async (did: string): Promise<PeerRecord | null> => peersByDid.get(did) ?? null

  const listRecentPeers = async (limit = 50): Promise<PeerRecord[]> =>
    Array.from(peersByDid.values())
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit)

  const searchPeers = async (query: string): Promise<PeerRecord[]> => {
    const q = query.toLowerCase()
    return Array.from(peersByDid.values()).filter((peer) => {
      const name = peer.displayName?.toLowerCase() ?? ''
      return peer.did.toLowerCase().includes(q) || name.includes(q)
    })
  }

  const removeStalePeers = async (olderThanMs: number): Promise<number> => {
    const cutoff = Date.now() - olderThanMs
    let removed = 0
    for (const [did, peer] of peersByDid.entries()) {
      if (peer.lastSeen < cutoff) {
        peersByDid.delete(did)
        removed++
      }
    }
    return removed
  }

  const getPeerCount = async (): Promise<number> => peersByDid.size

  const listFederationPeers = async (): Promise<FederationPeerRecord[]> =>
    Array.from(federationPeers.values()).sort((a, b) => b.registeredAt - a.registeredAt)

  const upsertFederationPeer = async (peer: FederationPeerRecord): Promise<void> => {
    federationPeers.set(peer.hubDid, peer)
  }

  const updateFederationPeerHealth = async (
    hubDid: string,
    healthy: boolean,
    lastSuccessAt?: number | null
  ): Promise<void> => {
    const existing = federationPeers.get(hubDid)
    if (!existing) return
    federationPeers.set(hubDid, {
      ...existing,
      healthy,
      lastSuccessAt: lastSuccessAt ?? existing.lastSuccessAt
    })
  }

  const logFederationQuery = async (entry: FederationQueryLog): Promise<void> => {
    federationLogs.push(entry)
  }

  const listShardAssignments = async (): Promise<ShardAssignmentRecord[]> =>
    Array.from(shardAssignments.values()).sort((a, b) => a.shardId - b.shardId)

  const replaceShardAssignments = async (assignments: ShardAssignmentRecord[]): Promise<void> => {
    shardAssignments.clear()
    for (const assignment of assignments) {
      shardAssignments.set(assignment.shardId, assignment)
    }
  }

  const upsertShardHost = async (host: ShardHostRecord): Promise<void> => {
    shardHosts.set(host.hubDid, host)
  }

  const listShardHosts = async (): Promise<ShardHostRecord[]> =>
    Array.from(shardHosts.values()).sort((a, b) => a.registeredAt - b.registeredAt)

  const removeShardHost = async (hubDid: string): Promise<void> => {
    shardHosts.delete(hubDid)
  }

  const insertShardPosting = async (posting: ShardPosting): Promise<void> => {
    const key = `${posting.shardId}:${posting.term}:${posting.cid}`
    shardPostings.set(key, posting)
  }

  const listShardPostings = async (shardId: number, terms: string[]): Promise<ShardPosting[]> => {
    const termSet = new Set(terms)
    return Array.from(shardPostings.values()).filter(
      (posting) => posting.shardId === shardId && termSet.has(posting.term)
    )
  }

  const recomputeShardTermStats = async (shardId: number, terms: string[]): Promise<void> => {
    const termSet = new Set(terms)
    const byTerm = new Map<string, Set<string>>()
    for (const posting of shardPostings.values()) {
      if (posting.shardId !== shardId) continue
      if (!termSet.has(posting.term)) continue
      const existing = byTerm.get(posting.term) ?? new Set<string>()
      existing.add(posting.cid)
      byTerm.set(posting.term, existing)
    }
    for (const [term, cids] of byTerm.entries()) {
      shardTermStats.set(`${shardId}:${term}`, { shardId, term, docFreq: cids.size })
    }
  }

  const getShardTermStats = async (shardId: number, terms: string[]): Promise<ShardTermStat[]> =>
    terms
      .map((term) => shardTermStats.get(`${shardId}:${term}`))
      .filter((stat): stat is ShardTermStat => Boolean(stat))

  const getShardStats = async (shardId: number): Promise<ShardStats> => {
    const byCid = new Map<string, number>()
    for (const posting of shardPostings.values()) {
      if (posting.shardId !== shardId) continue
      const existing = byCid.get(posting.cid) ?? posting.docLen
      byCid.set(posting.cid, existing)
    }
    const totalDocs = byCid.size
    const avgDocLen =
      totalDocs === 0
        ? 0
        : Array.from(byCid.values()).reduce((sum, len) => sum + len, 0) / totalDocs
    return { shardId, totalDocs, avgDocLen }
  }

  const updateShardDocCount = async (shardId: number, docCount: number): Promise<void> => {
    const assignment = shardAssignments.get(shardId)
    if (!assignment) return
    shardAssignments.set(shardId, { ...assignment, docCount, updatedAt: Date.now() })
  }

  const upsertCrawler = async (profile: CrawlerProfile): Promise<void> => {
    crawlersByDid.set(profile.did, profile)
  }

  const getCrawler = async (did: string): Promise<CrawlerProfile | null> =>
    crawlersByDid.get(did) ?? null

  const listCrawlers = async (): Promise<CrawlerProfile[]> =>
    Array.from(crawlersByDid.values()).sort((a, b) => b.registeredAt - a.registeredAt)

  const updateCrawlerStats = async (
    did: string,
    updates: { reputation?: number; totalCrawled?: number }
  ): Promise<void> => {
    const crawler = crawlersByDid.get(did)
    if (!crawler) return
    crawlersByDid.set(did, {
      ...crawler,
      reputation: updates.reputation ?? crawler.reputation,
      totalCrawled: updates.totalCrawled ?? crawler.totalCrawled
    })
  }

  const upsertCrawlQueue = async (entry: CrawlQueueEntry): Promise<void> => {
    crawlQueue.set(entry.url, entry)
  }

  const getQueuedUrls = async (options: {
    limit: number
    languages?: string[]
    domains?: string[]
  }): Promise<CrawlQueueEntry[]> => {
    const langSet = options.languages ? new Set(options.languages) : null
    const domainSet = options.domains ? new Set(options.domains) : null
    return Array.from(crawlQueue.values())
      .filter((entry) => (langSet ? !entry.language || langSet.has(entry.language) : true))
      .filter((entry) => (domainSet ? domainSet.has(entry.domain) : true))
      .sort((a, b) =>
        a.priority === b.priority ? a.enqueuedAt - b.enqueuedAt : b.priority - a.priority
      )
      .slice(0, options.limit)
  }

  const getCrawlHistory = async (url: string): Promise<CrawlHistoryEntry | null> =>
    crawlHistory.get(url) ?? null

  const appendCrawlHistory = async (entry: CrawlHistoryEntry): Promise<void> => {
    crawlHistory.set(entry.url, entry)
  }

  const upsertCrawlDomainState = async (state: CrawlDomainState): Promise<void> => {
    crawlDomains.set(state.domain, state)
  }

  const getCrawlDomainState = async (domain: string): Promise<CrawlDomainState | null> =>
    crawlDomains.get(domain) ?? null

  const putSchema = async (schema: SchemaRecord): Promise<void> => {
    const versions = schemasByIri.get(schema.iri) ?? new Map<number, SchemaRecord>()
    versions.set(schema.version, schema)
    schemasByIri.set(schema.iri, versions)
  }

  const getSchema = async (iri: string, version?: number): Promise<SchemaRecord | null> => {
    const versions = schemasByIri.get(iri)
    if (!versions) return null
    if (version !== undefined) {
      return versions.get(version) ?? null
    }
    return getLatestSchema(versions)
  }

  const listSchemasByAuthor = async (authorDid: string): Promise<SchemaRecord[]> =>
    getLatestSchemas()
      .filter((schema) => schema.authorDid === authorDid)
      .sort((a, b) => b.createdAt - a.createdAt)

  const searchSchemas = async (
    query: string,
    options?: { limit?: number; offset?: number }
  ): Promise<SchemaRecord[]> => {
    const q = query.toLowerCase()
    const results = getLatestSchemas().filter((schema) => {
      const propertyNames = getSchemaPropertyNames(schema).join(' ').toLowerCase()
      return (
        schema.name.toLowerCase().includes(q) ||
        schema.description.toLowerCase().includes(q) ||
        propertyNames.includes(q)
      )
    })

    const offset = options?.offset ?? 0
    const limit = options?.limit ?? 20
    return results.slice(offset, offset + limit)
  }

  const listPopularSchemas = async (limit = 20): Promise<SchemaRecord[]> =>
    getLatestSchemas()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)

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

  // ─── Database Row Operations ─────────────────────────────────────────────────

  const insertDatabaseRow = async (row: DatabaseRowRecord): Promise<void> => {
    databaseRows.set(row.id, row)
  }

  const updateDatabaseRow = async (
    rowId: string,
    updates: Partial<Omit<DatabaseRowRecord, 'id' | 'databaseId' | 'createdAt' | 'createdBy'>>
  ): Promise<void> => {
    const existing = databaseRows.get(rowId)
    if (!existing) return
    databaseRows.set(rowId, {
      ...existing,
      ...updates,
      updatedAt: updates.updatedAt ?? Date.now()
    })
  }

  const deleteDatabaseRow = async (rowId: string): Promise<void> => {
    databaseRows.delete(rowId)
  }

  const getDatabaseRow = async (rowId: string): Promise<DatabaseRowRecord | null> => {
    return databaseRows.get(rowId) ?? null
  }

  const getDatabaseRowCount = async (databaseId: string): Promise<number> => {
    let count = 0
    for (const row of databaseRows.values()) {
      if (row.databaseId === databaseId) count++
    }
    return count
  }

  const batchInsertDatabaseRows = async (rows: DatabaseRowRecord[]): Promise<void> => {
    for (const row of rows) {
      databaseRows.set(row.id, row)
    }
  }

  const rebuildDatabaseRowsFts = async (_databaseId: string): Promise<void> => {
    // No-op for memory storage (no FTS index)
  }

  const queryDatabaseRows = async (
    options: DatabaseRowQueryOptions
  ): Promise<DatabaseRowQueryResult> => {
    const startTime = performance.now()
    const { databaseId, filters, sorts, search, limit = 50, cursor } = options

    // Get all rows for this database
    let rows = Array.from(databaseRows.values()).filter((row) => row.databaseId === databaseId)

    // Apply filters
    if (filters) {
      rows = rows.filter((row) => evaluateFilterGroup(row, filters))
    }

    // Apply full-text search
    if (search) {
      const searchLower = search.toLowerCase()
      rows = rows.filter((row) => row.searchable.toLowerCase().includes(searchLower))
    }

    // Apply sorting
    if (sorts && sorts.length > 0) {
      rows.sort((a, b) => {
        for (const sort of sorts) {
          const aVal = sort.columnId === 'sortKey' ? a.sortKey : (a.data[sort.columnId] as string)
          const bVal = sort.columnId === 'sortKey' ? b.sortKey : (b.data[sort.columnId] as string)
          const cmp = String(aVal ?? '').localeCompare(String(bVal ?? ''))
          if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp
        }
        return a.id.localeCompare(b.id)
      })
    } else {
      rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey) || a.id.localeCompare(b.id))
    }

    const total = rows.length

    // Apply cursor pagination
    if (cursor) {
      try {
        const { sortKey, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
        const idx = rows.findIndex(
          (r) => r.sortKey > sortKey || (r.sortKey === sortKey && r.id > id)
        )
        if (idx > 0) rows = rows.slice(idx)
      } catch {
        // Invalid cursor, ignore
      }
    }

    // Apply limit
    const hasMore = rows.length > limit
    const resultRows = rows.slice(0, limit)

    // Build next cursor
    let nextCursor: string | undefined
    if (hasMore && resultRows.length > 0) {
      const lastRow = resultRows[resultRows.length - 1]
      nextCursor = Buffer.from(
        JSON.stringify({ sortKey: lastRow.sortKey, id: lastRow.id })
      ).toString('base64url')
    }

    const queryTime = performance.now() - startTime

    return {
      rows: resultRows,
      total,
      cursor: nextCursor,
      hasMore,
      queryTime
    }
  }

  // Helper: Evaluate filter group
  function evaluateFilterGroup(row: DatabaseRowRecord, group: DatabaseFilterGroup): boolean {
    const results = group.conditions.map((condition) => {
      if ('conditions' in condition) {
        return evaluateFilterGroup(row, condition as DatabaseFilterGroup)
      }
      return evaluateFilterCondition(row, condition as DatabaseFilterCondition)
    })

    return group.operator === 'and' ? results.every(Boolean) : results.some(Boolean)
  }

  // Helper: Evaluate single filter condition
  function evaluateFilterCondition(
    row: DatabaseRowRecord,
    condition: DatabaseFilterCondition
  ): boolean {
    const { columnId, operator, value } = condition
    const cellValue = row.data[columnId]

    switch (operator) {
      case 'equals':
        return cellValue === value
      case 'notEquals':
        return cellValue !== value
      case 'contains':
        return String(cellValue ?? '').includes(String(value))
      case 'notContains':
        return !String(cellValue ?? '').includes(String(value))
      case 'startsWith':
        return String(cellValue ?? '').startsWith(String(value))
      case 'endsWith':
        return String(cellValue ?? '').endsWith(String(value))
      case 'isEmpty':
        return cellValue == null || cellValue === ''
      case 'isNotEmpty':
        return cellValue != null && cellValue !== ''
      case 'greaterThan':
        return Number(cellValue) > Number(value)
      case 'lessThan':
        return Number(cellValue) < Number(value)
      case 'greaterOrEqual':
        return Number(cellValue) >= Number(value)
      case 'lessOrEqual':
        return Number(cellValue) <= Number(value)
      case 'before':
        return String(cellValue ?? '') < String(value)
      case 'after':
        return String(cellValue ?? '') > String(value)
      case 'between': {
        const [start, end] = value as [unknown, unknown]
        const cv = cellValue as string | number
        return cv >= (start as string | number) && cv <= (end as string | number)
      }
      case 'hasAny': {
        const arr = Array.isArray(cellValue) ? cellValue : []
        const vals = value as unknown[]
        return vals.some((v) => arr.includes(v))
      }
      case 'hasAll': {
        const arr = Array.isArray(cellValue) ? cellValue : []
        const vals = value as unknown[]
        return vals.every((v) => arr.includes(v))
      }
      case 'hasNone': {
        const arr = Array.isArray(cellValue) ? cellValue : []
        const vals = value as unknown[]
        return !vals.some((v) => arr.includes(v))
      }
      default:
        return true
    }
  }

  const close = async (): Promise<void> => {
    docStates.clear()
    docMetas.clear()
    docRecipients.clear()
    blobs.clear()
    searchBodies.clear()
    nodeChangesByHash.clear()
    nodeChangesByRoom.clear()
    files.clear()
    schemasByIri.clear()
    awarenessByRoom.clear()
    peersByDid.clear()
    federationPeers.clear()
    federationLogs.length = 0
    shardAssignments.clear()
    shardHosts.clear()
    shardPostings.clear()
    shardTermStats.clear()
    crawlersByDid.clear()
    crawlQueue.clear()
    crawlHistory.clear()
    crawlDomains.clear()
    databaseRows.clear()
    grantsById.clear()
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
    listDocRecipients,
    upsertGrantIndex,
    removeGrantIndex,
    listGrantedDocIds,
    getFileMeta,
    putFile,
    getFileData,
    deleteFile,
    listFiles,
    getFilesUsage,
    setAwareness,
    getAwareness,
    removeAwareness,
    cleanStaleAwareness,
    upsertPeer,
    getPeer,
    listRecentPeers,
    searchPeers,
    removeStalePeers,
    getPeerCount,
    listFederationPeers,
    upsertFederationPeer,
    updateFederationPeerHealth,
    logFederationQuery,
    listShardAssignments,
    replaceShardAssignments,
    upsertShardHost,
    listShardHosts,
    removeShardHost,
    insertShardPosting,
    listShardPostings,
    recomputeShardTermStats,
    getShardTermStats,
    getShardStats,
    updateShardDocCount,
    upsertCrawler,
    getCrawler,
    listCrawlers,
    updateCrawlerStats,
    upsertCrawlQueue,
    getQueuedUrls,
    getCrawlHistory,
    appendCrawlHistory,
    upsertCrawlDomainState,
    getCrawlDomainState,
    putSchema,
    getSchema,
    listSchemasByAuthor,
    searchSchemas,
    listPopularSchemas,
    hasNodeChange,
    appendNodeChange,
    getNodeChangesSince,
    getNodeChangesForNode,
    getHighWaterMark,
    insertDatabaseRow,
    updateDatabaseRow,
    deleteDatabaseRow,
    getDatabaseRow,
    queryDatabaseRows,
    getDatabaseRowCount,
    batchInsertDatabaseRows,
    rebuildDatabaseRowsFts,
    close
  }
}
