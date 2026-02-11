/**
 * @xnet/sdk - Unified SDK bundle for xNet
 */

// Re-export commonly used types from packages
export type { ContentId, Snapshot, SignedUpdate, VectorClock } from '@xnet/core'
export type { Identity, KeyBundle, UCANToken } from '@xnet/identity'
export type { Query, QueryResult, Filter, Sort, SearchQuery } from '@xnet/query'
export type { StorageAdapter } from '@xnet/storage'
export type { NetworkNode, NetworkConfig, ConnectionStatus, PeerInfo } from '@xnet/network'

// Re-export utilities
export { generateKeyBundle, generateIdentity, createDID, parseDID } from '@xnet/identity'
export { createSearchIndex, createLocalQueryEngine } from '@xnet/query'
export { MemoryAdapter } from '@xnet/storage'
export { hashContent, createContentId, verifyContent } from '@xnet/core'
