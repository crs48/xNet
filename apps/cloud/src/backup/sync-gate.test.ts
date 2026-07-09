import { describe, expect, it } from 'vitest'
import { backupSynced, assertSyncedViaHealth } from './sync-gate'
import type { HubHealth } from '../hub-status'

const health = (backup: HubHealth['backup']): HubHealth => ({ status: 'ok', backup })

describe('backupSynced', () => {
  it('is true only when the hub reports a fresh replica', () => {
    expect(backupSynced(health({ replicating: true, fresh: true }))).toBe(true)
  })

  it('fails closed on stale, missing, or unreachable', () => {
    expect(backupSynced(health({ replicating: true, fresh: false }))).toBe(false)
    expect(backupSynced(health({ replicating: true }))).toBe(false) // no verdict
    expect(backupSynced(null)).toBe(false) // unreachable
  })
})

describe('assertSyncedViaHealth', () => {
  it('resolves the hub URL then reads its /health verdict', async () => {
    const gate = assertSyncedViaHealth(
      async (id) => (id === 'acme' ? 'https://acme.hub' : null),
      (async () => health({ fresh: true })) as never
    )
    expect(await gate('acme')).toBe(true)
  })

  it('fails closed when the tenant has no live hub URL', async () => {
    let fetched = false
    const gate = assertSyncedViaHealth(async () => null, (async () => {
      fetched = true
      return health({ fresh: true })
    }) as never)
    expect(await gate('cold')).toBe(false)
    expect(fetched).toBe(false) // never even probed
  })
})
