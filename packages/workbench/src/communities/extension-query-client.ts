import type { ExtensionQueryRequest } from './extension-protocol'
import type { ExtensionQueryResult } from './extension-queries'
import type { NodeState } from '@xnetjs/data'
import type { DataBridge, QueryMetadata } from '@xnetjs/data-bridge'
import {
  createQueryDescriptor,
  serializeQueryDescriptor,
  queryDescriptorToOptions
} from '@xnetjs/data-bridge'
import { ExtensionAccessError } from './extension-protocol'

/** Only subscribed query pages are requested. No workspace snapshot enters this worker. */
export function createExtensionQueryClient(
  request: (query: ExtensionQueryRequest) => Promise<ExtensionQueryResult>,
  nextId: () => string
) {
  type Entry = {
    nodes: NodeState[] | null
    metadata: QueryMetadata | null
    listeners: Set<() => void>
    running: boolean
    dirty: boolean
    generation: number
    fetch(): void
  }
  const cache = new Map<string, Entry>()
  let stopped = false
  const query: DataBridge['query'] = (schema, options = {}) => {
    const key = serializeQueryDescriptor(createQueryDescriptor(schema._schemaId, options))
    let entry = cache.get(key)
    if (!entry) {
      if (cache.size >= 100) {
        for (const [id, candidate] of cache)
          if (!candidate.listeners.size && !candidate.running) cache.delete(id)
        if (cache.size >= 100)
          throw new ExtensionAccessError('quota', 'Too many cached query pages.')
      }
      const value: Entry = {
        nodes: null,
        metadata: null,
        listeners: new Set(),
        running: false,
        dirty: false,
        generation: 0,
        fetch() {
          if (stopped || !value.listeners.size) return
          if (value.running) {
            value.dirty = true
            return
          }
          value.running = true
          value.dirty = false
          const generation = ++value.generation
          void request({
            version: 1,
            id: nextId(),
            operation: 'data.query',
            schemaId: schema._schemaId,
            options
          })
            .then(
              (result) => {
                if (
                  stopped ||
                  !value.listeners.size ||
                  generation !== value.generation ||
                  value.dirty
                )
                  return
                value.nodes = result.nodes
                value.metadata = result.metadata
                value.listeners.forEach((notify) => notify())
              },
              (error) => {
                if (
                  stopped ||
                  !value.listeners.size ||
                  generation !== value.generation ||
                  value.dirty
                )
                  return
                value.nodes = []
                value.metadata = {
                  source: 'local',
                  updatedAt: Date.now(),
                  error: error instanceof Error ? error.message : 'The query failed.',
                  pageInfo: {
                    totalCount: null,
                    countMode: 'none',
                    hasMore: false,
                    hasNextPage: false,
                    hasPreviousPage: false,
                    loadedCount: 0
                  },
                  completeness: { level: 'unknown', reason: 'source-timeout' }
                }
                value.listeners.forEach((notify) => notify())
              }
            )
            .finally(() => {
              value.running = false
              if (value.dirty) value.fetch()
            })
        }
      }
      entry = value
      cache.set(key, entry)
    }
    const value = entry
    return {
      getSnapshot: () => value.nodes,
      getMetadata: () => value.metadata,
      subscribe(listener) {
        if (stopped) throw new ExtensionAccessError('revoked', 'The query session stopped.')
        if (
          !value.listeners.size &&
          [...cache.values()].filter((item) => item.listeners.size).length >= 20
        )
          throw new ExtensionAccessError('quota', 'Use at most twenty active query subscriptions.')
        value.listeners.add(listener)
        value.fetch()
        return () => {
          value.listeners.delete(listener)
          if (!value.listeners.size) {
            value.generation++
            value.nodes = null
            value.metadata = null
          }
        }
      }
    }
  }
  return {
    query,
    invalidate() {
      for (const entry of cache.values()) entry.fetch()
    },
    reload(descriptor: Parameters<NonNullable<DataBridge['reloadQuery']>>[0]) {
      const key = serializeQueryDescriptor(
        createQueryDescriptor(descriptor.schemaId, queryDescriptorToOptions(descriptor))
      )
      cache.get(key)?.fetch()
    },
    stop() {
      stopped = true
      for (const entry of cache.values()) {
        entry.listeners.clear()
        entry.nodes = null
        entry.metadata = null
      }
      cache.clear()
    }
  }
}
