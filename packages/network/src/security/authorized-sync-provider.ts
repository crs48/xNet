/**
 * Selective sync filtering based on envelope recipients.
 */

import { PUBLIC_RECIPIENT } from '@xnetjs/crypto'

export interface RecipientEnvelope {
  recipients: string[]
}

export interface EnvelopeReader {
  getEnvelope(nodeId: string): RecipientEnvelope | null
}

export interface SyncEventStore<TChange extends { payload?: { nodeId?: string } }> {
  subscribe(listener: (event: { change?: TChange }) => void): () => void
}

export class AuthorizedSyncProvider<TChange extends { payload?: { nodeId?: string } }> {
  constructor(
    private readonly store: SyncEventStore<TChange>,
    private readonly envelopes: EnvelopeReader
  ) {}

  filterChangesForPeer(changes: TChange[], peerDid: string): TChange[] {
    return changes.filter((change) => {
      const nodeId = change.payload?.nodeId
      if (!nodeId) {
        return false
      }

      return this.isPeerAuthorized(nodeId, peerDid)
    })
  }

  subscribeForPeer(peerDid: string, callback: (change: TChange) => void): () => void {
    return this.store.subscribe((event) => {
      const change = event.change
      const nodeId = change?.payload?.nodeId
      if (!change || !nodeId) {
        return
      }

      if (this.isPeerAuthorized(nodeId, peerDid)) {
        callback(change)
      }
    })
  }

  private isPeerAuthorized(nodeId: string, peerDid: string): boolean {
    const envelope = this.envelopes.getEnvelope(nodeId)
    if (!envelope) {
      return false
    }

    return envelope.recipients.includes(peerDid) || envelope.recipients.includes(PUBLIC_RECIPIENT)
  }
}
