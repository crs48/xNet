import type { InboxItem } from '@xnetjs/comms'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readDurabilityLog } from '../lib/storage-durability'
import { deliverFreshInboxItems, enableDesktopNotifications } from './desktop-notifications'

vi.mock('@xnetjs/sqlite', () => ({
  requestPersistentStorage: vi.fn().mockResolvedValue({
    supported: true,
    persisted: true,
    granted: true,
    requested: true,
    requestable: false,
    state: 'granted',
    message: 'granted'
  })
}))

function item(sourceId: string): InboxItem {
  return { sourceId, reason: 'mention', actor: 'did:key:zActor', at: 1, preview: 'hi' }
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('deliverFreshInboxItems', () => {
  it('delivers only unseen items and marks everything seen', () => {
    const seen = new Set(['a'])
    const delivered: string[] = []

    deliverFreshInboxItems(
      [item('a'), item('b')],
      seen,
      () => true,
      (fresh) => delivered.push(fresh.sourceId)
    )

    expect(delivered).toEqual(['b'])
    expect([...seen].sort()).toEqual(['a', 'b'])
  })

  it('marks items seen even when delivery is not allowed', () => {
    const seen = new Set<string>()
    const delivered: string[] = []

    deliverFreshInboxItems(
      [item('a')],
      seen,
      () => false,
      (fresh) => delivered.push(fresh.sourceId)
    )

    expect(delivered).toEqual([])
    expect(seen.has('a')).toBe(true)

    // A later allowed pass must not re-deliver the old item.
    deliverFreshInboxItems(
      [item('a')],
      seen,
      () => true,
      (fresh) => delivered.push(fresh.sourceId)
    )
    expect(delivered).toEqual([])
  })
})

describe('enableDesktopNotifications', () => {
  it('chains a persistence request and records the lever on grant', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted')
    })

    const permission = await enableDesktopNotifications()

    expect(permission).toBe('granted')
    const log = readDurabilityLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ lever: 'notifications', state: 'granted' })
  })

  it('does not request persistence when the user declines', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied')
    })

    const permission = await enableDesktopNotifications()

    expect(permission).toBe('denied')
    expect(readDurabilityLog()).toHaveLength(0)
  })

  it('reports unsupported environments', async () => {
    vi.stubGlobal('Notification', undefined)
    expect(await enableDesktopNotifications()).toBe('unsupported')
  })
})
