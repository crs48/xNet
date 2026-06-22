import type { DocumentIndex, IndexableNode, IndexChangeEvent, IndexableStore } from './indexer'
import { describe, expect, it, vi } from 'vitest'
import { createBrainIndexer, defaultTextOf } from './indexer'

/** A store whose subscribe lets the test push change events. */
function fakeStore(): IndexableStore & { emit(event: IndexChangeEvent): void } {
  let listener: ((event: IndexChangeEvent) => void) | null = null
  return {
    subscribe(fn) {
      listener = fn
      return () => {
        listener = null
      }
    },
    emit(event) {
      listener?.(event)
    }
  }
}

/** A document index that records calls. */
function fakeIndex(): DocumentIndex & { indexed: Map<string, string>; removed: string[] } {
  const indexed = new Map<string, string>()
  const removed: string[] = []
  return {
    indexed,
    removed,
    async indexDocument(id, content) {
      indexed.set(id, content)
      return { id }
    },
    removeDocument(id) {
      removed.push(id)
      return indexed.delete(id)
    }
  }
}

const node = (id: string, properties: Record<string, unknown>, deleted = false): IndexableNode => ({
  id,
  schemaId: 'Page',
  properties,
  deleted
})

/** Manual scheduler: fns run only when the test calls runScheduled(). */
function manualScheduler() {
  const queue: Array<() => void> = []
  return {
    schedule: (fn: () => void) => {
      queue.push(fn)
      return queue.length
    },
    cancel: () => {},
    run: () => {
      const fns = queue.splice(0)
      for (const fn of fns) fn()
    }
  }
}

describe('defaultTextOf', () => {
  it('joins known text-bearing properties', () => {
    expect(defaultTextOf(node('a', { title: 'Hello', body: 'World', count: 3 }))).toBe(
      'Hello\nWorld'
    )
  })

  it('returns empty string when there is no text', () => {
    expect(defaultTextOf(node('a', { count: 3, ref: 'x' }))).toBe('')
  })
})

describe('createBrainIndexer', () => {
  it('indexes a node on create and flush', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const indexer = createBrainIndexer({ store, index })
    indexer.start()

    store.emit({ node: node('p1', { title: 'Acme notes' }) })
    expect(indexer.pending()).toBe(1)
    await indexer.flush()

    expect(index.indexed.get('p1')).toBe('Acme notes')
    expect(indexer.pending()).toBe(0)
    indexer.stop()
  })

  it('removes a node on delete', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const indexer = createBrainIndexer({ store, index })
    indexer.start()

    store.emit({ node: node('p1', { title: 'x' }) })
    await indexer.flush()
    store.emit({ node: node('p1', { title: 'x' }, true) })
    await indexer.flush()

    expect(index.removed).toContain('p1')
    expect(index.indexed.has('p1')).toBe(false)
  })

  it('skips re-embedding identical text', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const spy = vi.spyOn(index, 'indexDocument')
    const indexer = createBrainIndexer({ store, index })
    indexer.start()

    store.emit({ node: node('p1', { title: 'same' }) })
    await indexer.flush()
    store.emit({ node: node('p1', { title: 'same' }) })
    await indexer.flush()

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('removes the vector when a node loses all its text', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const indexer = createBrainIndexer({ store, index })
    indexer.start()

    store.emit({ node: node('p1', { title: 'had text' }) })
    await indexer.flush()
    store.emit({ node: node('p1', { count: 1 }) })
    await indexer.flush()

    expect(index.removed).toContain('p1')
  })

  it('coalesces a burst of edits into the latest text via the debounce', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const sched = manualScheduler()
    const indexer = createBrainIndexer({
      store,
      index,
      schedule: sched.schedule,
      cancel: sched.cancel
    })
    indexer.start()

    store.emit({ node: node('p1', { title: 'v1' }) })
    store.emit({ node: node('p1', { title: 'v2' }) })
    store.emit({ node: node('p1', { title: 'v3' }) })
    expect(indexer.pending()).toBe(1)
    sched.run()
    await Promise.resolve()
    await Promise.resolve()

    expect(index.indexed.get('p1')).toBe('v3')
  })

  it('respects the shouldIndex predicate', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const indexer = createBrainIndexer({
      store,
      index,
      shouldIndex: (n) => n.schemaId !== 'Page'
    })
    indexer.start()
    store.emit({ node: node('p1', { title: 'skip me' }) })
    expect(indexer.pending()).toBe(0)
  })

  it('reports errors through the onError hook', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const errors: string[] = []
    vi.spyOn(index, 'indexDocument').mockRejectedValue(new Error('embed failed'))
    const indexer = createBrainIndexer({ store, index, onError: (_e, id) => errors.push(id) })
    indexer.start()
    store.emit({ node: node('p1', { title: 'x' }) })
    await indexer.flush()
    expect(errors).toEqual(['p1'])
  })

  it('backfills an existing graph with reindexAll', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const indexer = createBrainIndexer({ store, index })
    await indexer.reindexAll([
      node('a', { title: 'one' }),
      node('b', { count: 2 }), // no text → skipped
      node('c', { title: 'three' }, true) // deleted → skipped
    ])
    expect([...index.indexed.keys()].sort()).toEqual(['a'])
  })

  it('stops listening after stop()', async () => {
    const store = fakeStore()
    const index = fakeIndex()
    const indexer = createBrainIndexer({ store, index })
    indexer.start()
    indexer.stop()
    store.emit({ node: node('p1', { title: 'x' }) })
    expect(indexer.pending()).toBe(0)
  })
})
