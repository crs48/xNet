import type { NodeStore } from '@xnetjs/data'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const fakes = vi.hoisted(() => ({
  providers: [] as Array<{
    room: string
    receiveOnly: boolean
    attach: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
  }>,
  connections: [] as Array<{
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }>
}))
vi.mock('@xnetjs/react', () => ({
  createConnectionManager: vi.fn(() => {
    const connection = { connect: vi.fn(), disconnect: vi.fn() }
    fakes.connections.push(connection)
    return connection
  }),
  NodeStoreSyncProvider: class {
    attach = vi.fn()
    detach = vi.fn()
    constructor(
      _store: unknown,
      public room: string,
      public receiveOnly: boolean
    ) {
      fakes.providers.push(this)
    }
  }
}))
import { createIPCSyncManager } from './ipc-sync-manager'
beforeEach(() => {
  fakes.providers.length = 0
  fakes.connections.length = 0
})
const store = { isDraftPrivate: () => false } as unknown as NodeStore
const auth = async () => 'test-only-token'
describe('desktop structured conversation sync', () => {
  it('attaches pending share subscriptions when the store becomes ready and refcounts views', () => {
    const manager = createIPCSyncManager()
    manager.setIdentity('did:key:ztest', new Uint8Array(32))
    manager.subscribeShareRoom('xnet-channel-one')
    manager.subscribeShareRoom('xnet-channel-one')
    const detach = manager.attachNodeStore(store, auth)
    expect(fakes.providers.map((provider) => [provider.room, provider.receiveOnly])).toEqual([
      ['did:key:ztest', false],
      ['xnet-channel-one', true]
    ])
    const share = fakes.providers[1]
    manager.unsubscribeShareRoom('xnet-channel-one')
    expect(share.detach).not.toHaveBeenCalled()
    manager.unsubscribeShareRoom('xnet-channel-one')
    expect(share.detach).toHaveBeenCalledTimes(1)
    detach()
    expect(fakes.connections[0].disconnect).toHaveBeenCalledTimes(1)
    expect(fakes.providers[0].detach).toHaveBeenCalledTimes(1)
  })
  it('waits for identity instead of opening an anonymous publishing room', () => {
    const manager = createIPCSyncManager()
    const detach = manager.attachNodeStore(store, auth)
    expect(fakes.connections).toHaveLength(0)
    manager.setIdentity('did:key:ztest', new Uint8Array(32))
    expect(fakes.connections).toHaveLength(1)
    detach()
  })
})
