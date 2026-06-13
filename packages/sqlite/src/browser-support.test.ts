import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkPersistentStorage,
  isSilentPersistRequestSafe,
  requestPersistentStorage,
  watchPersistentStoragePermission
} from './browser-support'

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
      requested: true,
      requestable: false,
      state: 'unsupported'
    })
  })

  it('checks current durable storage without requesting persistence', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const persisted = vi.fn().mockResolvedValue(false)

    stubNavigator({
      estimate: vi.fn().mockResolvedValue({ usage: 256, quota: 2048 }),
      persist,
      persisted
    })

    const status = await checkPersistentStorage()

    expect(status).toMatchObject({
      supported: true,
      persisted: false,
      granted: null,
      requested: false,
      requestable: true,
      state: 'not-granted',
      usageBytes: 256,
      quotaBytes: 2048
    })
    expect(persist).not.toHaveBeenCalled()
    expect(persisted).toHaveBeenCalledTimes(2)
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
      requested: true,
      requestable: false,
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
      requested: true,
      requestable: true,
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
      requested: true,
      requestable: true,
      state: 'error',
      usageBytes: 2048,
      quotaBytes: 16384
    })
    expect(status.message).toContain('permission denied')
  })
})

describe('isSilentPersistRequestSafe', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats Chromium as silent-request safe', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    })
    expect(isSilentPersistRequestSafe()).toBe(true)
  })

  it('treats Safari as silent-request safe', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'
    })
    expect(isSilentPersistRequestSafe()).toBe(true)
  })

  it('treats Firefox as prompt-capable', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0'
    })
    expect(isSilentPersistRequestSafe()).toBe(false)
  })

  it('is false without a navigator', () => {
    vi.stubGlobal('navigator', undefined)
    expect(isSilentPersistRequestSafe()).toBe(false)
  })
})

describe('watchPersistentStoragePermission', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports permission changes and detaches on unsubscribe', async () => {
    const listeners = new Set<() => void>()
    const status = {
      state: 'prompt' as PermissionState,
      addEventListener: vi.fn((_: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_: string, listener: () => void) => listeners.delete(listener))
    }
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockResolvedValue(status) }
    })

    const onChange = vi.fn()
    const unsubscribe = watchPersistentStoragePermission(onChange)
    await vi.waitFor(() => expect(status.addEventListener).toHaveBeenCalled())

    status.state = 'granted'
    for (const listener of listeners) listener()
    expect(onChange).toHaveBeenCalledWith('granted')

    unsubscribe()
    expect(status.removeEventListener).toHaveBeenCalled()
    expect(listeners.size).toBe(0)
  })

  it('is a no-op when the Permissions API is unavailable', async () => {
    vi.stubGlobal('navigator', {})

    const onChange = vi.fn()
    const unsubscribe = watchPersistentStoragePermission(onChange)
    await Promise.resolve()

    unsubscribe()
    expect(onChange).not.toHaveBeenCalled()
  })
})
