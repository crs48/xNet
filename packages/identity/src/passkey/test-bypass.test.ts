import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestIdentityManager, isTestBypassEnabled } from './test-bypass'

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.get(key) ?? null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    }
  }
}

describe('test bypass identity manager', () => {
  const previousBypass = process.env.XNET_TEST_BYPASS

  beforeEach(() => {
    process.env.XNET_TEST_BYPASS = 'true'
    vi.stubGlobal('localStorage', createMemoryStorage())
  })

  afterEach(() => {
    if (previousBypass === undefined) {
      delete process.env.XNET_TEST_BYPASS
    } else {
      process.env.XNET_TEST_BYPASS = previousBypass
    }

    vi.unstubAllGlobals()
  })

  it('persists deterministic test identity availability across manager reloads', async () => {
    expect(isTestBypassEnabled()).toBe(true)

    const firstManager = createTestIdentityManager()
    expect(await firstManager.hasIdentity()).toBe(false)

    const created = await firstManager.create()
    expect(await firstManager.hasIdentity()).toBe(true)

    const reloadedManager = createTestIdentityManager()
    expect(await reloadedManager.hasIdentity()).toBe(true)

    const unlocked = await reloadedManager.unlock()
    expect(unlocked.identity.did).toBe(created.identity.did)
  })

  it('clears the test identity marker', async () => {
    const manager = createTestIdentityManager()
    await manager.create()
    await manager.clear()

    const reloadedManager = createTestIdentityManager()

    expect(await reloadedManager.hasIdentity()).toBe(false)
    await expect(reloadedManager.unlock()).rejects.toThrow('No test identity found')
  })
})
