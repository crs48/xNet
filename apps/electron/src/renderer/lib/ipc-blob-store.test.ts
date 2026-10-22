import { afterEach, expect, it, vi } from 'vitest'
import { createIPCBlobStore } from './ipc-blob-store'
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
it('waits for the requested peer blob and removes its subscription', async () => {
  let receive: (cid: string) => void = () => {}
  const unsubscribe = vi.fn()
  const getBlob = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null)
    .mockResolvedValue([4, 8])
  const requestBlobs = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('window', {
    xnetBSM: {
      getBlob,
      requestBlobs,
      onBlobReceived: (handler: typeof receive) => {
        receive = handler
        return unsubscribe
      }
    }
  })
  const result = createIPCBlobStore().get('wanted')
  await vi.waitFor(() => expect(requestBlobs).toHaveBeenCalledWith(['wanted']))
  receive('other')
  expect(getBlob).toHaveBeenCalledTimes(2)
  receive('wanted')
  expect(await result).toEqual(new Uint8Array([4, 8]))
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
it('reports unavailable peers after a bounded wait and cleans up', async () => {
  vi.useFakeTimers()
  const unsubscribe = vi.fn()
  vi.stubGlobal('window', {
    xnetBSM: {
      getBlob: vi.fn().mockResolvedValue(null),
      requestBlobs: vi.fn().mockResolvedValue(undefined),
      onBlobReceived: () => unsubscribe
    }
  })
  const result = createIPCBlobStore().get('missing')
  const rejection = expect(result).rejects.toThrow('No peer supplied this attachment')
  await vi.advanceTimersByTimeAsync(15_001)
  await rejection
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})
