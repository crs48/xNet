import type { NodeChange, NodeStore } from '@xnetjs/data'
import { expect, it, vi } from 'vitest'
import { hubStore } from './peer-sync-policy'

it('rejects peer records in both hub import paths while preserving normal imports and method receivers', async () => {
  const store = {
    applyRemoteChange: vi.fn(async () => {}),
    applyRemoteChanges: vi.fn(async () => {}),
    get() {
      return this
    }
  }
  const guarded = hubStore(store as unknown as NodeStore)
  const peer = { payload: { nodeId: 'iroh-private-message' } } as NodeChange
  const normal = { payload: { nodeId: 'normal-message' } } as NodeChange
  await expect(guarded.applyRemoteChange(peer)).rejects.toThrow('cannot be imported')
  await expect(guarded.applyRemoteChanges([normal, peer])).rejects.toThrow('cannot be imported')
  expect(store.applyRemoteChange).not.toHaveBeenCalled()
  expect(store.applyRemoteChanges).not.toHaveBeenCalled()
  await guarded.applyRemoteChange(normal)
  await guarded.applyRemoteChanges([normal])
  expect(store.applyRemoteChange).toHaveBeenCalledWith(normal)
  expect(store.applyRemoteChanges).toHaveBeenCalledWith([normal])
  expect(guarded.get('normal-message')).toBe(store)
})
