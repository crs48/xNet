/**
 * @xnetjs/sdk - Unified SDK bundle for xNet
 */

// Re-export commonly used types from packages
export type { ContentId, Snapshot, SignedUpdate, VectorClock } from '@xnetjs/core'
export type { Identity, KeyBundle, UCANToken } from '@xnetjs/identity'
export type { Query, QueryResult, Filter, Sort, SearchQuery } from '@xnetjs/query'
export type { StorageAdapter } from '@xnetjs/storage'
export type { NetworkNode, NetworkConfig, ConnectionStatus, PeerInfo } from '@xnetjs/network'

// Re-export utilities
export { generateKeyBundle, generateIdentity, createDID, parseDID } from '@xnetjs/identity'
export { createSearchIndex, createLocalQueryEngine } from '@xnetjs/query'
export { MemoryAdapter } from '@xnetjs/storage'
export { hashContent, createContentId, verifyContent } from '@xnetjs/core'

// Client initialization with telemetry
export { createClient } from './client'
export type { XNetClient, CreateClientOptions, SdkTelemetry } from './client'
