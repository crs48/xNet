import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorage } from './browser-support'

type StorageEstimate = {
  usage?: number
  quota?: number
}

type MockStorageManager = {
  estimate?: () => Promise<StorageEstimate>
  persist?: () => Promise<boolean>
  persisted?: () => Promise<boolean>
  getDirectory?: () => Promise<void>
}

function stubNavigator(storage: MockStorageManager | undefined): void {
  vi.stubGlobal('navigator', storage ? { storage } : undefined)
}

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports unsupported when the browser has no storage manager', async () => {
    stubNavigator(undefined)

    const status = await requestPersistentStorage()

    expect(status).toMatchObject({
      supported: false,
      persisted: null,
      granted: null,
      state: 'unsupported'
    })
  })

  it('reports granted durable storage when persistence is enabled', async () => {
    stubNavigator({
      estimate: vi.fn().mockResolvedValue({ usage: 512, quota: 4096 }),
      persist: vi.fn().mockResolvedValue(true),
      persisted: vi.fn().mockResolvedValue(false)
    })

    const status = await requestPersistentStorage()

    expect(status).toMatchObject({
      supported: true,
      persisted: true,
      granted: true,
      state: 'granted',
      usageBytes: 512,
      quotaBytes: 4096
    })
  })

  it('reports non-granted storage when the browser declines persistence', async () => {
    const persisted = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    stubNavigator({
      estimate: vi.fn().mockResolvedValue({ usage: 1024, quota: 8192 }),
      persist: vi.fn().mockResolvedValue(false),
      persisted
    })

    const status = await requestPersistentStorage()

    expect(status).toMatchObject({
      supported: true,
      persisted: false,
      granted: false,
      state: 'not-granted',
      usageBytes: 1024,
      quotaBytes: 8192
    })
    expect(persisted).toHaveBeenCalledTimes(2)
  })

  it('reports errors when persistence checks throw', async () => {
    stubNavigator({
      estimate: vi.fn().mockResolvedValue({ usage: 2048, quota: 16384 }),
      persist: vi.fn().mockRejectedValue(new Error('permission denied')),
      persisted: vi.fn().mockResolvedValue(false)
    })

    const status = await requestPersistentStorage()

    expect(status).toMatchObject({
      supported: true,
      persisted: null,
      granted: null,
      state: 'error',
      usageBytes: 2048,
      quotaBytes: 16384
    })
    expect(status.message).toContain('permission denied')
  })
})
