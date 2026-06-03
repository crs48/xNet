import type { ConnectionManager } from './connection-manager'
import type { ContentId, DID } from '@xnetjs/core'
import type { NodeChange, NodeStore, SchemaIRI } from '@xnetjs/data'
import { describe, expect, it, vi } from 'vitest'
import { NodeStoreSyncProvider } from './node-store-sync-provider'

function createSchemaDefinitionChange(): NodeChange {
  return {
    id: 'change-schema-definition',
    type: 'node-change',
    payload: {
      nodeId: 'schema-definition-node',
      schemaId: 'xnet://xnet.fyi/SchemaDefinition@1.0.0' as SchemaIRI,
      properties: {
        schemaIri: 'xnet://example.app/Task@1.0.0',
        version: '1.0.0'
      }
    },
    hash: 'cid:blake3:schema-definition-change' as ContentId,
    parentHash: null,
    authorDID: 'did:key:z6MkAuthor' as DID,
    signature: new Uint8Array([1, 2, 3]),
    wallTime: 1710000000000,
    lamport: {
      time: 1,
      author: 'did:key:z6MkAuthor'
    }
  }
}

describe('NodeStoreSyncProvider', () => {
  it('publishes SchemaDefinition node changes to the node relay room', () => {
    let storeListener: ((event: { change: NodeChange; isRemote: boolean }) => void) | null = null
    const store = {
      subscribe: vi.fn((listener: (event: { change: NodeChange; isRemote: boolean }) => void) => {
        storeListener = listener
        return vi.fn()
      }),
      getChangesSince: vi.fn(async () => []),
      applyRemoteChange: vi.fn(async () => undefined),
      applyRemoteChanges: vi.fn(async () => undefined)
    } as unknown as NodeStore
    const connection = {
      status: 'connected',
      joinRoom: vi.fn(() => vi.fn()),
      onMessage: vi.fn(() => vi.fn()),
      onStatus: vi.fn(() => vi.fn()),
      publish: vi.fn(),
      sendRaw: vi.fn(),
      joinRoomAsync: vi.fn(),
      leaveRoom: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      roomCount: 0
    } as unknown as ConnectionManager
    const provider = new NodeStoreSyncProvider(store, 'did:key:z6MkAuthor')
    const change = createSchemaDefinitionChange()
    const emitStoreEvent = (event: { change: NodeChange; isRemote: boolean }): void => {
      if (!storeListener) {
        throw new Error('Store listener was not registered')
      }
      storeListener(event)
    }

    provider.attach(connection)
    emitStoreEvent({ change, isRemote: false })

    expect(connection.publish).toHaveBeenCalledWith('did:key:z6MkAuthor', {
      type: 'node-change',
      room: 'did:key:z6MkAuthor',
      change: expect.objectContaining({
        id: 'change-schema-definition',
        type: 'node-change',
        nodeId: 'schema-definition-node',
        schemaId: 'xnet://xnet.fyi/SchemaDefinition@1.0.0',
        lamportTime: 1
      })
    })
  })
})
