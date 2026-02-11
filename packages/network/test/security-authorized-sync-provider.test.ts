import { describe, expect, it } from 'vitest'
import { AuthorizedSyncProvider } from '../src/security/authorized-sync-provider'

type Change = {
  payload: {
    nodeId: string
  }
}

describe('AuthorizedSyncProvider', () => {
  it('filters changes by recipients and PUBLIC sentinel', () => {
    const provider = new AuthorizedSyncProvider<Change>(
      {
        subscribe: () => () => {}
      },
      {
        getEnvelope: (nodeId) => {
          if (nodeId === 'node-private') {
            return { recipients: ['did:key:alice'] }
          }

          if (nodeId === 'node-public') {
            return { recipients: ['PUBLIC'] }
          }

          return { recipients: ['did:key:bob'] }
        }
      }
    )

    const changes: Change[] = [
      { payload: { nodeId: 'node-private' } },
      { payload: { nodeId: 'node-public' } },
      { payload: { nodeId: 'node-secret' } }
    ]

    const filtered = provider.filterChangesForPeer(changes, 'did:key:alice')
    expect(filtered).toEqual([
      { payload: { nodeId: 'node-private' } },
      { payload: { nodeId: 'node-public' } }
    ])
  })

  it('subscribes with a global listener and forwards only authorized changes', () => {
    const listeners: Array<(event: { change?: Change }) => void> = []

    const provider = new AuthorizedSyncProvider<Change>(
      {
        subscribe: (listener) => {
          listeners.push(listener)
          return () => {
            const idx = listeners.indexOf(listener)
            if (idx >= 0) listeners.splice(idx, 1)
          }
        }
      },
      {
        getEnvelope: (nodeId) => ({
          recipients: nodeId === 'shared' ? ['did:key:alice'] : ['did:key:bob']
        })
      }
    )

    const received: string[] = []
    const unsubscribe = provider.subscribeForPeer('did:key:alice', (change) => {
      received.push(change.payload.nodeId)
    })

    listeners[0]?.({ change: { payload: { nodeId: 'shared' } } })
    listeners[0]?.({ change: { payload: { nodeId: 'private' } } })
    expect(received).toEqual(['shared'])

    unsubscribe()
    expect(listeners).toHaveLength(0)
  })
})
