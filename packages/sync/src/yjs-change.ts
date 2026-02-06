/**
 * YjsChange - Wrap Yjs updates in the Change<T> envelope for hash chain integration
 *
 * This provides the strongest security tier: Yjs updates become entries in the
 * same per-node hash chain as NodeChanges. This gives rich text the same
 * guarantees as structured data — signed, hashed, chain-linked, with a full
 * audit trail of who typed what and when.
 *
 * See: docs/plans/plan03_4_1YjsSecurity/08-hash-chain-integration.md
 */

import type { Change, UnsignedChange } from './change'
import type { LamportTimestamp } from './clock'
import type { ContentId, DID } from '@xnet/core'
import { createUnsignedChange, signChange, createChangeId } from './change'

/**
 * Change type identifier for Yjs changes.
 */
export const YJS_CHANGE_TYPE = 'yjs-update'

/**
 * Payload for a YjsChange - contains the batched Yjs update.
 */
export interface YjsUpdatePayload {
  /** The node this update belongs to */
  nodeId: string

  /** Batched Yjs update bytes (one or more merged updates) */
  update: Uint8Array

  /** Yjs clientID for this author (verified via Step 07) */
  clientId: number

  /** Number of individual Yjs updates batched into this change */
  updateCount: number
}

/**
 * A Yjs update wrapped in the Change<T> envelope.
 * Gets: id, hash, parentHash, signature, authorDID, lamport, wallTime
 */
export type YjsChange = Change<YjsUpdatePayload>

/**
 * Unsigned version of YjsChange (before signing).
 */
export type UnsignedYjsChange = UnsignedChange<YjsUpdatePayload>

/**
 * Options for creating a YjsChange.
 */
export interface CreateYjsChangeOptions {
  /** The node this update belongs to */
  nodeId: string

  /** Batched Yjs update bytes */
  update: Uint8Array

  /** Yjs clientID for this author */
  clientId: number

  /** Number of individual updates in this batch */
  updateCount: number

  /** Author's DID */
  authorDID: string

  /** Author's Ed25519 private key for signing */
  privateKey: Uint8Array

  /** Hash of the previous change in the chain (null for first) */
  parentHash: ContentId | null

  /** Lamport timestamp for ordering */
  lamport: LamportTimestamp

  /** Optional wall time (defaults to Date.now()) */
  wallTime?: number
}

/**
 * Create an unsigned YjsChange.
 *
 * @param options - Change options
 * @returns Unsigned change ready for signing
 */
export function createUnsignedYjsChange(
  options: Omit<CreateYjsChangeOptions, 'privateKey'>
): UnsignedYjsChange {
  const payload: YjsUpdatePayload = {
    nodeId: options.nodeId,
    update: options.update,
    clientId: options.clientId,
    updateCount: options.updateCount
  }

  return createUnsignedChange<YjsUpdatePayload>({
    id: createChangeId(),
    type: YJS_CHANGE_TYPE,
    payload,
    parentHash: options.parentHash,
    authorDID: options.authorDID as DID,
    lamport: options.lamport,
    wallTime: options.wallTime
  })
}

/**
 * Create a signed YjsChange.
 *
 * @param options - Change options including private key
 * @returns Signed YjsChange with hash and signature
 *
 * @example
 * ```typescript
 * const change = createYjsChange({
 *   nodeId: 'page-123',
 *   update: Y.encodeStateAsUpdate(doc),
 *   clientId: doc.clientID,
 *   updateCount: 5,
 *   authorDID: identity.did,
 *   privateKey: identity.privateKey,
 *   parentHash: lastChangeHash,
 *   lamport: { time: 42, did: identity.did }
 * })
 * ```
 */
export function createYjsChange(options: CreateYjsChangeOptions): YjsChange {
  const unsigned = createUnsignedYjsChange(options)
  return signChange(unsigned, options.privateKey)
}

/**
 * Type guard to check if a change is a YjsChange.
 *
 * @param change - Any change object
 * @returns true if the change is a YjsChange
 */
export function isYjsChange(change: Change<unknown>): change is YjsChange {
  return (
    change.type === YJS_CHANGE_TYPE &&
    typeof change.payload === 'object' &&
    change.payload !== null &&
    'update' in change.payload &&
    'clientId' in change.payload &&
    'nodeId' in change.payload
  )
}

/**
 * Type guard to check if a change is a NodeChange (not a YjsChange).
 * NodeChanges have 'properties' and 'schemaId' in their payload.
 */
export function isNodeChange(change: Change<unknown>): boolean {
  return (
    change.type !== YJS_CHANGE_TYPE &&
    typeof change.payload === 'object' &&
    change.payload !== null &&
    'nodeId' in change.payload &&
    !('update' in change.payload)
  )
}

/**
 * Extract the nodeId from any change (works for both NodeChange and YjsChange).
 */
export function getChangeNodeId(change: Change<unknown>): string | undefined {
  if (typeof change.payload === 'object' && change.payload !== null && 'nodeId' in change.payload) {
    return (change.payload as { nodeId: string }).nodeId
  }
  return undefined
}
