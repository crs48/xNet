/**
 * @xnet/hub - Storage factory.
 */

import type { HubStorage } from './interface'
import { createMemoryStorage } from './memory'

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

export const createStorage = async (type: StorageType, dataDir: string): Promise<HubStorage> => {
  switch (type) {
    case 'sqlite': {
      // Dynamic import to avoid loading better-sqlite3 native module when using memory storage
      const { createSQLiteStorage } = await import('./sqlite.js')
      return createSQLiteStorage(dataDir)
    }
    case 'memory':
      return createMemoryStorage()
    default:
      throw new Error(`Unknown storage type: ${type}`)
  }
}

export { createMemoryStorage } from './memory'
