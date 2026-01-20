/**
 * @xnet/sdk - Unified SDK bundle for xNet
 */

// Main client
export {
  createXNetClient,
  type XNetClient,
  type XNetClientConfig,
  type CreateDocOptions
} from './client'

// Presets
export { createBrowserClient } from './presets/browser'
export { createNodeClient } from './presets/node'

// Re-export commonly used types from packages
export type { ContentId, Snapshot, SignedUpdate, VectorClock } from '@xnet/core'
export type { Identity, KeyBundle, UCANToken } from '@xnet/identity'
export type { XDocument, DocumentType, Block, BlockType } from '@xnet/data'
export type { Query, QueryResult, Filter, Sort, SearchQuery } from '@xnet/query'
export type { StorageAdapter, DocumentData, DocumentMetadata } from '@xnet/storage'
export type { NetworkNode, NetworkConfig, ConnectionStatus, PeerInfo } from '@xnet/network'

// Re-export utilities
export { generateKeyBundle, generateIdentity, createDID, parseDID } from '@xnet/identity'
export { createDocument, loadDocument, getDocumentState } from '@xnet/data'
export { createSearchIndex, createLocalQueryEngine } from '@xnet/query'
export { MemoryAdapter, IndexedDBAdapter } from '@xnet/storage'
export { hashContent, createContentId, verifyContent } from '@xnet/core'

// Re-export React integration
export * from '@xnet/react'
