import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerBridge } from '../worker-bridge'

const remote = {
  initialize: vi.fn(async () => {}),
  onStatusChange: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  reloadQuery: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  restore: vi.fn(),
  acquireDoc: vi.fn(async () => ({
    nodeId: 'page-1',
    state: new Uint8Array(),
    clientId: 1
  })),
  releaseDoc: vi.fn(),
  applyLocalUpdate: vi.fn(),
  destroy: vi.fn(async () => {})
}

vi.mock('comlink', () => ({
  wrap: vi.fn(() => remote),
  proxy: vi.fn((value) => value)
}))

class MockWorker {
  terminate = vi.fn()
}

describe('WorkerBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('Worker', MockWorker)
  })

  it('retains a shared mirror doc until the final release', async () => {
    const bridge = new WorkerBridge('worker.js')
    await bridge.initialize({
      authorDID: 'did:key:test',
      signingKey: new Uint8Array([1, 2, 3])
    })

    const first = await bridge.acquireDoc('page-1')
    const destroySpy = vi.spyOn(first.doc, 'destroy')
    const second = await bridge.acquireDoc('page-1')

    expect(second.doc).toBe(first.doc)
    expect(remote.acquireDoc).toHaveBeenCalledTimes(1)

    bridge.releaseDoc('page-1')

    expect(remote.releaseDoc).not.toHaveBeenCalled()
    expect(destroySpy).not.toHaveBeenCalled()

    bridge.releaseDoc('page-1')

    expect(remote.releaseDoc).toHaveBeenCalledWith('page-1')
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })
})
