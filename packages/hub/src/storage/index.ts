/**
 * @xnet/hub - Storage factory.
 */

import type { HubStorage } from './interface'
import { createMemoryStorage } from './memory'
import { createSQLiteStorage } from './sqlite'

export type {
  HubStorage,
  BlobMeta,
  DocMeta,
  AwarenessEntry,
  FederationPeerRecord,
  FederationQueryLog,
  ShardAssignmentRecord,
  ShardHostRecord,
  ShardPosting,
  ShardTermStat,
  ShardStats,
  CrawlerProfile,
  CrawlQueueEntry,
  CrawlHistoryEntry,
  CrawlDomainState,
  PeerEndpoint,
  PeerRecord,
  FileMeta,
  SchemaRecord,
  SearchOptions,
  SearchResult,
  SerializedNodeChange
} from './interface'
export type StorageType = 'sqlite' | 'memory'

export const createStorage = (type: StorageType, dataDir: string): HubStorage => {
  switch (type) {
    case 'sqlite':
      return createSQLiteStorage(dataDir)
    case 'memory':
      return createMemoryStorage()
    default:
      throw new Error(`Unknown storage type: ${type}`)
  }
}

export { createSQLiteStorage } from './sqlite'
export { createMemoryStorage } from './memory'
