import type { PersistentStorageStatus } from '@xnetjs/sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  publishStorageStatus,
  readDurabilityLog,
  recordDurabilityTransition,
  subscribeStorageStatus
} from './storage-durability'

function status(overrides: Partial<PersistentStorageStatus> = {}): PersistentStorageStatus {
  return {
    supported: true,
    persisted: false,
    granted: false,
    requested: true,
    requestable: true,
    state: 'not-granted',
    message: 'declined',
    ...overrides
  }
}

afterEach(() => {
  localStorage.clear()
  const scopedGlobal = globalThis as { __XNET_STORAGE_SCOPE__?: string }
  delete scopedGlobal.__XNET_STORAGE_SCOPE__
})

describe('recordDurabilityTransition', () => {
  it('appends transitions with the lever that produced them', () => {
    recordDurabilityTransition('startup', status())
    recordDurabilityTransition(
      'notifications',
      status({ persisted: true, granted: true, state: 'granted' })
    )

    const log = readDurabilityLog()
    expect(log).toHaveLength(2)
    expect(log[0]).toMatchObject({ lever: 'startup', state: 'not-granted' })
    expect(log[1]).toMatchObject({ lever: 'notifications', state: 'granted', persisted: true })
  })

  it('skips consecutive identical states from the same lever', () => {
    recordDurabilityTransition('startup', status())
    recordDurabilityTransition('startup', status())

    expect(readDurabilityLog()).toHaveLength(1)
  })

  it('caps the log at 50 entries', () => {
    for (let i = 0; i < 60; i++) {
      recordDurabilityTransition(i % 2 === 0 ? 'startup' : 'banner', status())
    }

    expect(readDurabilityLog()).toHaveLength(50)
  })

  it('suffixes the storage key with the preview scope', () => {
    const scopedGlobal = globalThis as { __XNET_STORAGE_SCOPE__?: string }
    scopedGlobal.__XNET_STORAGE_SCOPE__ = 'pr-7'

    recordDurabilityTransition('startup', status())

    expect(localStorage.getItem('xnet:durability-log:pr-7')).not.toBeNull()
    expect(localStorage.getItem('xnet:durability-log')).toBeNull()
  })
})

describe('publishStorageStatus', () => {
  it('notifies subscribers and records the transition', () => {
    const onStatus = vi.fn()
    const unsubscribe = subscribeStorageStatus(onStatus)

    const granted = status({ persisted: true, granted: true, state: 'granted' })
    publishStorageStatus('notifications', granted)

    expect(onStatus).toHaveBeenCalledWith(granted)
    expect(readDurabilityLog()).toHaveLength(1)

    unsubscribe()
    publishStorageStatus('banner', status())
    expect(onStatus).toHaveBeenCalledTimes(1)
  })
})
