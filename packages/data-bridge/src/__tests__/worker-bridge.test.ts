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
  bulkWrite: vi.fn(),
  transaction: vi.fn(),
  acquireDoc: vi.fn(async () => ({
    nodeId: 'page-1',
    state: new Uint8Array(),
    clientId: 1
  })),
  releaseDoc: vi.fn(),
  applyLocalUpdate: vi.fn(),
  destroy: vi.fn(async () => {})
}

const transferSpy = vi.fn((value: unknown, _transferables: unknown[]) => value)

vi.mock('comlink', () => ({
  wrap: vi.fn(() => remote),
  proxy: vi.fn((value) => value),
  transfer: vi.fn((value: unknown, transferables: unknown[]) => transferSpy(value, transferables))
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

  it('delegates bulk writes to the worker API', async () => {
    remote.bulkWrite.mockResolvedValueOnce({
      batchId: 'batch-worker',
      created: 1,
      updated: 0,
      nodeIds: ['worker-bulk-node'],
      schemaIds: ['xnet://test.local/Task'],
      changeCount: 1,
      timings: {
        preflightMs: 0,
        materializeMs: 1,
        applyMs: 2,
        notifyMs: 0,
        totalMs: 3
      }
    })
    const bridge = new WorkerBridge('worker.js')
    await bridge.initialize({
      authorDID: 'did:key:test',
      signingKey: new Uint8Array([1, 2, 3])
    })

    const input = {
      kind: 'deterministic-import' as const,
      drafts: [
        {
          id: 'worker-bulk-node',
          schemaId: 'xnet://test.local/Task',
          properties: { title: 'Worker bulk' }
        }
      ]
    }
    const result = await bridge.bulkWrite(input)

    expect(remote.bulkWrite).toHaveBeenCalledWith(input)
    expect(result.batchId).toBe('batch-worker')
  })

  it('delegates transactions to the worker API', async () => {
    remote.transaction.mockResolvedValueOnce({
      batchId: 'batch-tx',
      results: [null],
      tempIds: { '~task': 'real-id' }
    })
    const bridge = new WorkerBridge('worker.js')
    await bridge.initialize({
      authorDID: 'did:key:test',
      signingKey: new Uint8Array([1, 2, 3])
    })

    const operations = [{ type: 'delete' as const, nodeId: 'node-1' }]
    const result = await bridge.transaction(operations)

    expect(remote.transaction).toHaveBeenCalledWith(operations)
    expect(result.batchId).toBe('batch-tx')
    expect(result.tempIds['~task']).toBe('real-id')
  })

  it('rejects transactions before initialization', async () => {
    const bridge = new WorkerBridge('worker.js')

    await expect(bridge.transaction([{ type: 'delete', nodeId: 'node-1' }])).rejects.toThrow(
      'WorkerBridge not initialized'
    )
  })

  it('transfers the storage port to the worker on initialize', async () => {
    const { port2 } = new MessageChannel()
    const bridge = new WorkerBridge('worker.js')
    await bridge.initialize({
      authorDID: 'did:key:test',
      signingKey: new Uint8Array([1, 2, 3]),
      storagePort: port2
    })

    expect(transferSpy).toHaveBeenCalledTimes(1)
    expect(transferSpy.mock.calls[0][1]).toEqual([port2])
    expect(remote.initialize).toHaveBeenCalledWith(expect.objectContaining({ storagePort: port2 }))
    port2.close()
  })

  it('skips transfer when no storage port is configured', async () => {
    const bridge = new WorkerBridge('worker.js')
    await bridge.initialize({
      authorDID: 'did:key:test',
      signingKey: new Uint8Array([1, 2, 3])
    })

    expect(transferSpy).not.toHaveBeenCalled()
    expect(remote.initialize).toHaveBeenCalledWith(
      expect.not.objectContaining({ storagePort: expect.anything() })
    )
  })
})
