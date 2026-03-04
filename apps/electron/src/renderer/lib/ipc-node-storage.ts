/**
 * IPC-based Node Storage Adapter for Electron renderer
 *
 * Routes all NodeStore operations through IPC to the data process's SQLite database.
 * This ensures nodes persist locally and are available for sync.
 *
 * @see docs/explorations/0074_ELECTRON_IPC_NODE_STORAGE.md
 */

import type { ContentId, DID } from '@xnetjs/core'
import type {
  NodeStorageAdapter,
  NodeState,
  NodeChange,
  NodeId,
  ListNodesOptions,
  CountNodesOptions,
  SchemaIRI
} from '@xnetjs/data'
import type { LamportTimestamp } from '@xnetjs/sync'

// Debug logging - controlled by localStorage flag (same as sync debug)
function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[IPCNodeStorage]', ...args)
  }
}

/**
 * IPC-based implementation of NodeStorageAdapter.
 *
 * Routes all operations via window.xnetNodes to the data process SQLite.
 * This adapter is used in the Electron renderer to persist nodes.
 */
export class IPCNodeStorageAdapter implements NodeStorageAdapter {
  // ==========================================================================
  // Lifecycle (optional)
  // ==========================================================================

  async open(): Promise<void> {
    log('open() - IPC adapter ready')
    // No-op: IPC channel is always available via preload
  }

  async close(): Promise<void> {
    log('close() - IPC adapter closed')
    // No-op: IPC channel managed by Electron
  }

  // ==========================================================================
  // Change Log Operations
  // ==========================================================================

  async appendChange(change: NodeChange): Promise<void> {
    log('appendChange()', change.payload.nodeId)
    await window.xnetNodes.appendChange(serializeChange(change))
  }

  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    log('getChanges()', nodeId)
    const changes = await window.xnetNodes.getChanges(nodeId)
    return changes.map(deserializeChange)
  }

  async getAllChanges(): Promise<NodeChange[]> {
    log('getAllChanges()')
    const changes = await window.xnetNodes.getAllChanges()
    return changes.map(deserializeChange)
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    log('getChangesSince()', sinceLamport)
    const changes = await window.xnetNodes.getChangesSince(sinceLamport)
    return changes.map(deserializeChange)
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    log('getChangeByHash()', hash)
    const change = await window.xnetNodes.getChangeByHash(hash)
    return change ? deserializeChange(change) : null
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    log('getLastChange()', nodeId)
    const change = await window.xnetNodes.getLastChange(nodeId)
    return change ? deserializeChange(change) : null
  }

  // ==========================================================================
  // Materialized State Operations
  // ==========================================================================

  async getNode(id: NodeId): Promise<NodeState | null> {
    log('getNode()', id)
    const node = await window.xnetNodes.getNode(id)
    return node ? deserializeNodeState(node) : null
  }

  async setNode(node: NodeState): Promise<void> {
    log('setNode()', node.id)
    await window.xnetNodes.setNode(serializeNodeState(node))
  }

  async deleteNode(id: NodeId): Promise<void> {
    log('deleteNode()', id)
    await window.xnetNodes.deleteNode(id)
  }

  async listNodes(options?: ListNodesOptions): Promise<NodeState[]> {
    log('listNodes()', options)
    const nodes = await window.xnetNodes.listNodes(options)
    return nodes.map(deserializeNodeState)
  }

  async countNodes(options?: CountNodesOptions): Promise<number> {
    log('countNodes()', options)
    return window.xnetNodes.countNodes(options)
  }

  // ==========================================================================
  // Sync State
  // ==========================================================================

  async getLastLamportTime(): Promise<number> {
    log('getLastLamportTime()')
    return window.xnetNodes.getLastLamportTime()
  }

  async setLastLamportTime(time: number): Promise<void> {
    log('setLastLamportTime()', time)
    await window.xnetNodes.setLastLamportTime(time)
  }

  // ==========================================================================
  // Document Content Operations
  // ==========================================================================

  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    log('getDocumentContent()', nodeId)
    const data = await window.xnetNodes.getDocumentContent(nodeId)
    return data ? new Uint8Array(data) : null
  }

  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    log('setDocumentContent()', nodeId, 'size:', content.length)
    await window.xnetNodes.setDocumentContent(nodeId, Array.from(content))
  }
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Serialized format for IPC transport.
 * Uint8Array fields are converted to number[] for JSON serialization.
 */
interface SerializedNodeChange {
  protocolVersion?: number
  id: string
  type: string
  hash: string
  payload: {
    nodeId: string
    schemaId?: string
    properties: Record<string, unknown>
    deleted?: boolean
  }
  lamport: {
    time: number
    author: string
  }
  wallTime: number
  authorDID: string
  parentHash: string | null
  batchId?: string
  batchIndex?: number
  batchSize?: number
  signature: number[]
}

interface SerializedLamportTimestamp {
  time: number
  author: string
}

interface SerializedPropertyTimestamp {
  lamport: SerializedLamportTimestamp
  wallTime: number
}

interface SerializedNodeState {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  timestamps: Record<string, SerializedPropertyTimestamp>
  deleted: boolean
  deletedAt?: SerializedPropertyTimestamp
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
  documentContent?: number[]
  _unknown?: Record<string, unknown>
  _schemaVersion?: string
}

function serializeChange(change: NodeChange): SerializedNodeChange {
  return {
    protocolVersion: change.protocolVersion,
    id: change.id,
    type: change.type,
    hash: change.hash,
    payload: {
      nodeId: change.payload.nodeId,
      schemaId: change.payload.schemaId,
      properties: change.payload.properties,
      deleted: change.payload.deleted
    },
    lamport: {
      time: change.lamport.time,
      author: change.lamport.author
    },
    wallTime: change.wallTime,
    authorDID: change.authorDID,
    parentHash: change.parentHash,
    batchId: change.batchId,
    batchIndex: change.batchIndex,
    batchSize: change.batchSize,
    signature: Array.from(change.signature)
  }
}

function deserializeChange(data: SerializedNodeChange): NodeChange {
  return {
    protocolVersion: data.protocolVersion,
    id: data.id,
    type: data.type,
    hash: data.hash as ContentId,
    payload: {
      nodeId: data.payload.nodeId,
      schemaId: data.payload.schemaId as SchemaIRI | undefined,
      properties: data.payload.properties,
      deleted: data.payload.deleted
    },
    lamport: {
      time: data.lamport.time,
      author: data.lamport.author as DID
    } as LamportTimestamp,
    wallTime: data.wallTime,
    authorDID: data.authorDID as DID,
    parentHash: data.parentHash as ContentId | null,
    batchId: data.batchId,
    batchIndex: data.batchIndex,
    batchSize: data.batchSize,
    signature: new Uint8Array(data.signature)
  }
}

function serializeNodeState(node: NodeState): SerializedNodeState {
  const timestamps: Record<string, SerializedPropertyTimestamp> = {}
  for (const [key, ts] of Object.entries(node.timestamps)) {
    timestamps[key] = {
      lamport: {
        time: ts.lamport.time,
        author: ts.lamport.author
      },
      wallTime: ts.wallTime
    }
  }

  return {
    id: node.id,
    schemaId: node.schemaId,
    properties: node.properties,
    timestamps,
    deleted: node.deleted,
    deletedAt: node.deletedAt
      ? {
          lamport: {
            time: node.deletedAt.lamport.time,
            author: node.deletedAt.lamport.author
          },
          wallTime: node.deletedAt.wallTime
        }
      : undefined,
    createdAt: node.createdAt,
    createdBy: node.createdBy,
    updatedAt: node.updatedAt,
    updatedBy: node.updatedBy,
    documentContent: node.documentContent ? Array.from(node.documentContent) : undefined,
    _unknown: node._unknown,
    _schemaVersion: node._schemaVersion
  }
}

function deserializeNodeState(data: SerializedNodeState): NodeState {
  const timestamps: Record<string, { lamport: LamportTimestamp; wallTime: number }> = {}
  for (const [key, ts] of Object.entries(data.timestamps)) {
    timestamps[key] = {
      lamport: {
        time: ts.lamport.time,
        author: ts.lamport.author as DID
      },
      wallTime: ts.wallTime
    }
  }

  return {
    id: data.id,
    schemaId: data.schemaId as SchemaIRI,
    properties: data.properties,
    timestamps,
    deleted: data.deleted,
    deletedAt: data.deletedAt
      ? {
          lamport: {
            time: data.deletedAt.lamport.time,
            author: data.deletedAt.lamport.author as DID
          },
          wallTime: data.deletedAt.wallTime
        }
      : undefined,
    createdAt: data.createdAt,
    createdBy: data.createdBy as DID,
    updatedAt: data.updatedAt,
    updatedBy: data.updatedBy as DID,
    documentContent: data.documentContent ? new Uint8Array(data.documentContent) : undefined,
    _unknown: data._unknown,
    _schemaVersion: data._schemaVersion
  }
}

// =============================================================================
// Type Declarations for window.xnetNodes
// =============================================================================

declare global {
  interface Window {
    xnetNodes: XNetNodesAPI
  }
}

export interface XNetNodesAPI {
  // Change log operations
  appendChange(change: SerializedNodeChange): Promise<void>
  getChanges(nodeId: string): Promise<SerializedNodeChange[]>
  getAllChanges(): Promise<SerializedNodeChange[]>
  getChangesSince(sinceLamport: number): Promise<SerializedNodeChange[]>
  getChangeByHash(hash: string): Promise<SerializedNodeChange | null>
  getLastChange(nodeId: string): Promise<SerializedNodeChange | null>

  // Materialized state operations
  getNode(id: string): Promise<SerializedNodeState | null>
  setNode(node: SerializedNodeState): Promise<void>
  deleteNode(id: string): Promise<void>
  listNodes(options?: ListNodesOptions): Promise<SerializedNodeState[]>
  countNodes(options?: CountNodesOptions): Promise<number>

  // Sync state
  getLastLamportTime(): Promise<number>
  setLastLamportTime(time: number): Promise<void>

  // Document content operations
  getDocumentContent(nodeId: string): Promise<number[] | null>
  setDocumentContent(nodeId: string, content: number[]): Promise<void>

  // Change subscription
  onChange(callback: (event: { changes: SerializedNodeChange[] }) => void): () => void
}
