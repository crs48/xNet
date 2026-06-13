import type { Query, QueryResult } from '../types'
import type { DataSource } from '@xnetjs/core'
import type { NetworkNode } from '@xnetjs/network'
import { describe, expect, it } from 'vitest'
import { createFederatedQueryRouter } from './router'

const node = {} as NetworkNode

function query(limit?: number): Query {
  return { type: 'any', filters: [], limit }
}

function result(items: unknown[], hasMore = false): QueryResult<unknown> {
  return { items, total: items.length, hasMore }
}

describe('federated query router', () => {
  it('returns local-only sources when no peers are resolved', async () => {
    const router = createFederatedQueryRouter(node, { query: async () => result([]) })
    const sources = await router.findSources(query())
    expect(sources).toEqual([{ type: 'local', id: 'local', estimatedLatency: 0 }])
  })

  it('adds resolved peer sources for federation', async () => {
    const peer: DataSource = { type: 'peer', id: 'hub-b', estimatedLatency: 40 }
    const router = createFederatedQueryRouter(
      node,
      { query: async () => result([]) },
      { resolvePeerSources: () => [peer] }
    )
    const sources = await router.findSources(query())
    expect(sources.map((s) => s.id)).toEqual(['local', 'hub-b'])
  })

  it('merges and de-duplicates local + remote results by id', async () => {
    const router = createFederatedQueryRouter(
      node,
      { query: async () => result([{ id: 'a' }, { id: 'b' }]) },
      {
        resolvePeerSources: () => [{ type: 'peer', id: 'hub-b', estimatedLatency: 10 }],
        remoteTransport: async () => result([{ id: 'b' }, { id: 'c' }])
      }
    )
    const merged = await router.execute(query())
    expect((merged.items as { id: string }[]).map((i) => i.id).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.total).toBe(3)
  })

  it('applies the query limit across merged results', async () => {
    const router = createFederatedQueryRouter(
      node,
      { query: async () => result([{ id: 'a' }, { id: 'b' }]) },
      {
        resolvePeerSources: () => [{ type: 'peer', id: 'hub-b', estimatedLatency: 10 }],
        remoteTransport: async () => result([{ id: 'c' }, { id: 'd' }])
      }
    )
    const merged = await router.execute(query(3))
    expect(merged.items).toHaveLength(3)
    expect(merged.hasMore).toBe(true)
  })

  it('does not let a failing peer fail the whole query', async () => {
    const router = createFederatedQueryRouter(
      node,
      { query: async () => result([{ id: 'a' }]) },
      {
        resolvePeerSources: () => [{ type: 'peer', id: 'hub-b', estimatedLatency: 10 }],
        remoteTransport: async () => {
          throw new Error('peer offline')
        }
      }
    )
    const merged = await router.execute(query())
    expect((merged.items as { id: string }[]).map((i) => i.id)).toEqual(['a'])
  })

  it('throws a clear error from routeToRemote without a transport', async () => {
    const router = createFederatedQueryRouter(node, { query: async () => result([]) })
    await expect(
      router.routeToRemote(query(), { type: 'peer', id: 'x', estimatedLatency: 1 })
    ).rejects.toThrow('no remoteTransport configured')
  })
})
