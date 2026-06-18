import type { TenantRecord } from '../registry'
import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { InMemoryDocStore, bindingStoreFromDocs, tenantStoreFromDocs } from './durable'

const tenant = (id: string): TenantRecord => ({
  tenantId: id,
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId: `u_${id}`,
  did: '',
  hubUrl: 'h',
  substrateRef: 'r',
  region: 'us',
  targetVersion: '1.0.0',
  createdAt: 0,
  lastActiveMs: 0,
  dataTier: 'hot'
})

describe('durable tenant store (over InMemoryDocStore)', () => {
  it('round-trips, lists, and deletes by tenantId', async () => {
    const s = tenantStoreFromDocs(new InMemoryDocStore())
    await s.put(tenant('a'))
    await s.put(tenant('b'))
    expect((await s.get('a'))?.tenantId).toBe('a')
    expect((await s.list()).map((t) => t.tenantId).sort()).toEqual(['a', 'b'])
    await s.delete('a')
    expect(await s.get('a')).toBeNull()
  })

  it('clones so a caller cannot mutate a stored record', async () => {
    const s = tenantStoreFromDocs(new InMemoryDocStore<TenantRecord>())
    const t = tenant('a')
    await s.put(t)
    t.plan = 'team'
    expect((await s.get('a'))?.plan).toBe('personal')
  })
})

describe('durable binding store', () => {
  it('gets by tenant and finds by billing user', async () => {
    const s = bindingStoreFromDocs(new InMemoryDocStore())
    await s.put({
      tenantId: 't_a',
      billingUserId: 'user_a',
      did: 'did:key:1',
      createdAt: 0,
      verifiedAt: 0,
      rebindPending: false
    })
    expect((await s.get('t_a'))?.did).toBe('did:key:1')
    expect((await s.findByBillingUser('user_a'))?.tenantId).toBe('t_a')
    expect(await s.findByBillingUser('nobody')).toBeNull()
  })
})
