/**
 * Document synchronization protocol
 *
 * NW-01: Now includes signature verification for Yjs updates.
 * All updates should be wrapped in signed envelopes for security.
 */
import type { NetworkNode, SyncMessage } from '../types'
import type { XDocument } from '@xnet/data'
import type { SignedYjsEnvelopeV1 } from '@xnet/sync'
import { encode, decode } from '@msgpack/msgpack'
import { getDocumentState, getStateVector } from '@xnet/data'
import { verifyYjsEnvelopeV1 } from '@xnet/sync'
import * as lp from 'it-length-prefixed'
import { pipe } from 'it-pipe'
import * as Y from 'yjs'

const SYNC_PROTOCOL = '/xnet/sync/1.0.0'

// NW-01: Configuration for envelope verification
interface SyncProtocolConfig {
  /** Reject updates without valid signatures (default: true in production) */
  requireSignedEnvelopes?: boolean
  /** Callback when an update fails verification */
  onVerificationFailed?: (reason: string, sender: string, docId: string) => void
}

/**
 * Sync protocol interface
 */
export interface SyncProtocol {
  /** Register document for sync */
  register(doc: XDocument): void

  /** Unregister document */
  unregister(docId: string): void

  /** Request sync with peer */
  requestSync(docId: string, peerId: string): Promise<void>

  /** Handle incoming sync messages */
  onMessage(callback: (msg: SyncMessage) => void): () => void
}

/**
 * Extended sync message with optional signed envelope (NW-01)
 */
interface SyncMessageV2 extends SyncMessage {
  /** Signed envelope containing the update (NW-01) */
  envelope?: SignedYjsEnvelopeV1
}

/**
 * Create a sync protocol handler for the node
 *
 * NW-01: Now verifies signed envelopes before applying updates.
 */
export function createSyncProtocol(
  node: NetworkNode,
  config: SyncProtocolConfig = {}
): SyncProtocol {
  const { requireSignedEnvelopes = false, onVerificationFailed } = config
  const documents = new Map<string, XDocument>()
  const messageCallbacks = new Set<(msg: SyncMessage) => void>()

  // Handle incoming streams
  node.libp2p.handle(SYNC_PROTOCOL, async ({ stream, connection: _connection }) => {
    // TODO: use connection.remotePeer for peer-specific sync logic

    await pipe(
      stream.source,
      lp.decode,
      async function* (source) {
        for await (const data of source) {
          const msg = decode(data.subarray()) as SyncMessage

          // Notify callbacks
          messageCallbacks.forEach((cb) => cb(msg))

          // Handle sync request
          if (msg.type === 'sync-request') {
            const doc = documents.get(msg.docId)
            if (doc) {
              const state = getDocumentState(doc)
              yield encode({
                type: 'sync-response',
                docId: msg.docId,
                payload: state,
                sender: node.did,
                timestamp: Date.now()
              } satisfies SyncMessage)
            }
          }
        }
      },
      lp.encode,
      stream.sink
    )
  })

  return {
    register(doc: XDocument): void {
      documents.set(doc.id, doc)
    },

    unregister(docId: string): void {
      documents.delete(docId)
    },

    async requestSync(docId: string, peerId: string): Promise<void> {
      const doc = documents.get(docId)
      if (!doc) throw new Error(`Document ${docId} not registered`)

      const stream = await node.libp2p.dialProtocol(
        peerId as unknown as Parameters<typeof node.libp2p.dialProtocol>[0],
        SYNC_PROTOCOL
      )

      const stateVector = getStateVector(doc)

      await pipe(
        [
          encode({
            type: 'sync-request',
            docId,
            payload: stateVector,
            sender: node.did,
            timestamp: Date.now()
          } satisfies SyncMessage)
        ],
        lp.encode,
        stream.sink
      )

      // Read response
      await pipe(stream.source, lp.decode, async function (source) {
        for await (const data of source) {
          const msg = decode(data.subarray()) as SyncMessageV2
          if (msg.type === 'sync-response') {
            // NW-01: Verify signed envelope if present
            if (msg.envelope) {
              const result = verifyYjsEnvelopeV1(msg.envelope)
              if (!result.valid) {
                onVerificationFailed?.(result.reason || 'unknown', msg.sender, msg.docId)
                if (requireSignedEnvelopes) {
                  console.warn(
                    `[SyncProtocol] Rejected update from ${msg.sender}: ${result.reason}`
                  )
                  continue
                }
              }
              // Apply verified update
              Y.applyUpdate(doc.ydoc, msg.envelope.update, msg.envelope.authorDID)
            } else if (requireSignedEnvelopes) {
              // NW-01: Reject unsigned updates when signatures required
              onVerificationFailed?.('missing_envelope', msg.sender, msg.docId)
              console.warn(`[SyncProtocol] Rejected unsigned update from ${msg.sender}`)
              continue
            } else {
              // Legacy fallback: apply unsigned update with warning
              console.warn(
                `[SyncProtocol] Applying unsigned update from ${msg.sender} (legacy mode)`
              )
              Y.applyUpdate(doc.ydoc, msg.payload)
            }
          }
        }
      })
    },

    onMessage(callback: (msg: SyncMessage) => void): () => void {
      messageCallbacks.add(callback)
      return () => messageCallbacks.delete(callback)
    }
  }
}
