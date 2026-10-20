// @vitest-environment node
import type { ExtensionQueryResult } from './extension-queries'
import { TaskSchema } from '@xnetjs/data'
import { describe, expect, it, vi } from 'vitest'
import { createExtensionQueryClient } from './extension-query-client'
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
const page = (hasMore = false): ExtensionQueryResult => ({
  nodes: [],
  metadata: {
    source: 'local',
    updatedAt: 1,
    pageInfo: {
      totalCount: null,
      countMode: 'none',
      hasMore,
      hasNextPage: hasMore,
      hasPreviousPage: false,
      loadedCount: 0
    }
  }
})
describe('isolated live query client', () => {
  it('loads only subscribed pages, reports errors, and discards stale in-flight responses', async () => {
    const pending: ((page: ExtensionQueryResult) => void)[] = []
    const host = vi.fn(() => new Promise<ExtensionQueryResult>((resolve) => pending.push(resolve)))
    const client = createExtensionQueryClient(host, () => crypto.randomUUID())
    const query = client.query(TaskSchema, { limit: 2 })
    expect(host).not.toHaveBeenCalled()
    const notify = vi.fn(),
      stop = query.subscribe(notify)
    expect(query.getSnapshot()).toBeNull()
    client.invalidate()
    pending.shift()!(page(true))
    await flush()
    expect(notify).not.toHaveBeenCalled()
    expect(host).toHaveBeenCalledTimes(2)
    pending.shift()!(page())
    await flush()
    expect(query.getMetadata?.()?.pageInfo.hasMore).toBe(false)
    expect(notify).toHaveBeenCalledOnce()
    stop()
    client.invalidate()
    expect(host).toHaveBeenCalledTimes(2)
    client.stop()
  })
  it('limits live subscriptions and exposes failures rather than successful empty results', async () => {
    const client = createExtensionQueryClient(
      async () => {
        throw new Error('No read grant')
      },
      () => crypto.randomUUID()
    )
    const query = client.query(TaskSchema)
    query.subscribe(() => {})
    await flush()
    expect(query.getMetadata?.()?.error).toBe('No read grant')
    for (let i = 0; i < 19; i++)
      client.query(TaskSchema, { nodeId: `task-${i}` }).subscribe(() => {})
    expect(() => client.query(TaskSchema, { nodeId: 'too-many' }).subscribe(() => {})).toThrow(
      'twenty'
    )
    client.stop()
  })
})
