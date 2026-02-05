/**
 * Document synchronization protocol
 */
import type { NetworkNode, SyncMessage } from '../types'
import type { XDocument } from '@xnet/data'
import { encode, decode } from '@msgpack/msgpack'
import { getDocumentState, getStateVector } from '@xnet/data'
import * as lp from 'it-length-prefixed'
import { pipe } from 'it-pipe'
import * as Y from 'yjs'

const SYNC_PROTOCOL = '/xnet/sync/1.0.0'

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
 * Create a sync protocol handler for the node
 */
export function createSyncProtocol(node: NetworkNode): SyncProtocol {
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
          const msg = decode(data.subarray()) as SyncMessage
          if (msg.type === 'sync-response') {
            Y.applyUpdate(doc.ydoc, msg.payload)
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
