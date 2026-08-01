/**
 * The tenant registry's lookup index and fleet paging (exploration 0423).
 *
 * `getByBillingUser` replaced a `list().find(...)` scan on the Stripe-webhook
 * path, so the thing under test is not "does it find the tenant" — a scan did
 * that — but "can the index ever disagree with the primary map". A stale index
 * would hand a webhook the wrong tenant, or none, and both are silent.
 */

import { resolveEntitlements } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { MemoryTenantStore, pageSortedIds, type TenantRecord } from './registry'

const tenant = (tenantId: string, billingUserId: string): TenantRecord => ({
  tenantId,
  plan: 'personal',
  entitlements: resolveEntitlements('personal'),
  billingUserId,
  did: '',
  hubUrl: `https://${tenantId}.example`,
  substrateRef: `ref_${tenantId}`,
  region: 'us',
  targetVersion: '1.0.0',
  createdAt: 0,
  lastActiveMs: 0,
  dataTier: 'hot'
})

describe('MemoryTenantStore lookup index', () => {
  it('finds a tenant by its billing identity', async () => {
    const store = new MemoryTenantStore()
    await store.put(tenant('t1', 'u_alice'))
    await store.put(tenant('t2', 'u_bob'))

    expect((await store.getByBillingUser('u_alice'))?.tenantId).toBe('t1')
    expect((await store.getByBillingUser('u_bob'))?.tenantId).toBe('t2')
    expect(await store.getByBillingUser('u_nobody')).toBeNull()
  })

  it('stays consistent across put -> put (billing user changed) -> delete', async () => {
    const store = new MemoryTenantStore()
    await store.put(tenant('t1', 'u_old'))
    expect((await store.getByBillingUser('u_old'))?.tenantId).toBe('t1')

    // Re-put the same tenant under a different billing identity: the old key
    // must stop resolving, or a webhook for `u_old` reaches a tenant that no
    // longer belongs to it.
    await store.put(tenant('t1', 'u_new'))
    expect(await store.getByBillingUser('u_old')).toBeNull()
    expect((await store.getByBillingUser('u_new'))?.tenantId).toBe('t1')

    await store.delete('t1')
    expect(await store.getByBillingUser('u_new')).toBeNull()
    expect(await store.get('t1')).toBeNull()
  })

  it('never resolves to a deleted tenant when a billing identity owns two', async () => {
    const store = new MemoryTenantStore()
    await store.put(tenant('t1', 'u_shared'))
    await store.put(tenant('t2', 'u_shared'))

    // Insertion order wins, matching the `list().find(...)` this replaced.
    expect((await store.getByBillingUser('u_shared'))?.tenantId).toBe('t1')

    await store.delete('t1')
    expect((await store.getByBillingUser('u_shared'))?.tenantId).toBe('t2')

    await store.delete('t2')
    expect(await store.getByBillingUser('u_shared')).toBeNull()
  })

  it('does not grow the index when the same record is re-put', async () => {
    const store = new MemoryTenantStore()
    for (let i = 0; i < 5; i++) await store.put(tenant('t1', 'u_alice'))
    await store.delete('t1')
    expect(await store.getByBillingUser('u_alice')).toBeNull()
  })

  it('lookup cost does not grow with fleet size', async () => {
    // The regression this guards is a reintroduced scan. Rather than time it,
    // count reads: `list()` is the only way to scan a MemoryTenantStore, so a
    // lookup that never calls it cannot be O(N).
    const store = new MemoryTenantStore()
    let listCalls = 0
    const listSpy = store.list.bind(store)
    store.list = async () => {
      listCalls++
      return listSpy()
    }

    for (let i = 0; i < 1000; i++) await store.put(tenant(`t${i}`, `u${i}`))
    expect((await store.getByBillingUser('u999'))?.tenantId).toBe('t999')
    expect(listCalls).toBe(0)
  })
})

describe('MemoryTenantStore paging', () => {
  it('walks the whole fleet in tenantId order with no repeats or gaps', async () => {
    const store = new MemoryTenantStore()
    const ids = Array.from({ length: 25 }, (_, i) => `t${String(i).padStart(3, '0')}`)
    for (const id of ids) await store.put(tenant(id, `u_${id}`))

    const seen: string[] = []
    let cursor: string | null = null
    for (;;) {
      const page = await store.page(cursor, 7)
      seen.push(...page.items.map((t) => t.tenantId))
      if (page.next === null) break
      cursor = page.next
    }

    expect(seen).toEqual([...ids].sort())
    expect(new Set(seen).size).toBe(ids.length)
  })

  it('reports an empty fleet as one exhausted page', async () => {
    const page = await new MemoryTenantStore().page(null, 10)
    expect(page.items).toEqual([])
    expect(page.next).toBeNull()
  })

  it('rejects a non-positive page limit rather than looping forever', async () => {
    await expect(new MemoryTenantStore().page(null, 0)).rejects.toThrow(/limit must be >= 1/)
  })
})

describe('pageSortedIds', () => {
  it('treats the cursor as exclusive', () => {
    expect(pageSortedIds(['a', 'b', 'c'], 'a', 2)).toEqual({ ids: ['b', 'c'], next: null })
  })

  it('hands back a cursor only while ids remain', () => {
    expect(pageSortedIds(['a', 'b', 'c'], null, 2)).toEqual({ ids: ['a', 'b'], next: 'b' })
    expect(pageSortedIds(['a', 'b', 'c'], 'b', 2)).toEqual({ ids: ['c'], next: null })
  })

  it('terminates when the cursor is past the end (deleted tail)', () => {
    expect(pageSortedIds(['a', 'b'], 'zz', 2)).toEqual({ ids: [], next: null })
  })
})
