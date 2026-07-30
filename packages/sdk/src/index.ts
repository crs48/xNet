/**
 * @xnetjs/sdk - Unified SDK bundle for xNet
 */

// Re-export commonly used types from packages
export type { ContentId, Snapshot, SignedUpdate, VectorClock } from '@xnetjs/core'
export type { Identity, KeyBundle, UCANToken } from '@xnetjs/identity'
export type {
  Query,
  QueryResult,
  Filter,
  Sort,
  SearchQuery,
  SearchResult,
  DocumentLinkMatch,
  SearchDocumentContent
} from '@xnetjs/query'
export type { StorageAdapter } from '@xnetjs/storage'
export type { NetworkNode, NetworkConfig, ConnectionStatus, PeerInfo } from '@xnetjs/network'

// Re-export utilities
export { generateKeyBundle, generateIdentity, createDID, parseDID } from '@xnetjs/identity'
export {
  createSearchIndex,
  createLocalQueryEngine,
  createSearchSnippet,
  extractBacklinks,
  extractDocumentLinks,
  extractDocumentText,
  extractSearchDocument
} from '@xnetjs/query'
export { MemoryAdapter } from '@xnetjs/storage'
export { hashContent, createContentId, verifyContent } from '@xnetjs/core'

// Client initialization with telemetry
// Framework-agnostic runtime client (the headless engine — exploration 0185).
// @xnetjs/sdk is the friendly umbrella over @xnetjs/runtime.
export {
  createXNetClient,
  type XNetClient,
  type CreateXNetClientOptions,
  type XNetClientSyncOptions,
  type XNetClientPluginOptions,
  type XNetClientUndoOptions,
  type XNetClientTelemetry,
  type XNetClientRuntimeStatus
} from '@xnetjs/runtime'

// The umbrella xNet Protocol Version — the negotiable identity of the wire
// protocol this SDK speaks. The normative spec lives in docs/specs/protocol/.
export {
  XNET_PROTOCOL_VERSION,
  XNET_SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
  isProtocolCompatible,
  type XNetProtocolBundle
} from '@xnetjs/runtime'

// Lightweight identity initialization with telemetry.
// (`createClient` returns an identity; for the full runtime use `createXNetClient`.)
export { createClient } from './client'
export type { XNetIdentity, CreateClientOptions, SdkTelemetry } from './client'

// Node-native schema discovery
export { createSchemaDiscovery } from './discovery'
export type { SchemaDiscovery, SchemaDiscoveryOptions } from './discovery'
