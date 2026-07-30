/**
 * Hub search-index updates for `XNetProvider` (0276): mirrors NodeStore
 * changes into the hub's search index (debounced per doc), resolving tag ids
 * to names so searching a tag name finds tagged nodes (exploration 0169).
 */

import type { NodeChangeEvent, NodeStore } from '@xnetjs/data'
import type { SyncManager } from '@xnetjs/runtime'
import { useEffect } from 'react'

const HUB_INDEX_DEBOUNCE_MS = 2000

/**
 * "#design #perf" search text for a node's tag ids, so searching a tag
 * name finds tagged nodes (exploration 0169). Unresolvable ids are
 * skipped — an archived or not-yet-synced tag never blocks indexing.
 */
async function resolveTagSearchText(
  store: NodeStore,
  tagIds: string[]
): Promise<string | undefined> {
  const names = await Promise.all(
    tagIds.map(async (id) => {
      const tag = await store.get(id).catch(() => null)
      const name = tag?.properties?.name
      return typeof name === 'string' && name ? `#${name}` : null
    })
  )
  const present = names.filter((entry): entry is string => entry !== null)
  return present.length > 0 ? present.join(' ') : undefined
}

export function useHubSearchIndex(input: {
  nodeStore: NodeStore | null
  syncManager: SyncManager | null
  hubUrl: string | null
  enableSearchIndex: boolean
}): void {
  const { nodeStore, syncManager, hubUrl, enableSearchIndex } = input

  useEffect(() => {
    if (!nodeStore || !syncManager || !hubUrl || !enableSearchIndex) return
    const connection = syncManager.connection
    if (!connection) return

    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const pending = new Map<
      string,
      | {
          type: 'update'
          meta: { schemaIri: string; title: string; properties: Record<string, unknown> }
          /** Extra searchable text (e.g. resolved #tag names — 0169) */
          text?: string
        }
      | { type: 'remove' }
    >()

    const schedule = (
      docId: string,
      payload:
        | {
            type: 'update'
            meta: { schemaIri: string; title: string; properties: Record<string, unknown> }
            text?: string
          }
        | { type: 'remove' }
    ): void => {
      pending.set(docId, payload)
      const existing = timers.get(docId)
      if (existing) clearTimeout(existing)

      timers.set(
        docId,
        setTimeout(() => {
          timers.delete(docId)
          const next = pending.get(docId)
          pending.delete(docId)
          if (!next) return

          if (connection.status !== 'connected') return

          if (next.type === 'remove') {
            connection.sendRaw({ type: 'index-remove', docId })
            return
          }

          connection.sendRaw({
            type: 'index-update',
            docId,
            meta: next.meta,
            ...(next.text !== undefined ? { text: next.text } : {})
          })
        }, HUB_INDEX_DEBOUNCE_MS)
      )
    }

    const handleChange = (event: NodeChangeEvent) => {
      const node = event.node
      if (!node || node.deleted) {
        schedule(event.change.payload.nodeId, { type: 'remove' })
        return
      }

      if (!node.schemaId) return

      // `name`-titled nodes (Tag, Folder, Project, Channel) index their name.
      const title =
        typeof node.properties.title === 'string'
          ? node.properties.title
          : typeof node.properties.name === 'string'
            ? node.properties.name
            : ''
      const meta = { schemaIri: node.schemaId, title, properties: node.properties }

      // Resolve tag ids to names so searching "design" finds tagged nodes (0169).
      const tagIds = Array.isArray(node.properties.tags)
        ? node.properties.tags.filter((id): id is string => typeof id === 'string')
        : []
      if (tagIds.length === 0) {
        schedule(node.id, { type: 'update', meta })
        return
      }
      void resolveTagSearchText(nodeStore, tagIds).then((text) => {
        schedule(node.id, { type: 'update', meta, ...(text ? { text } : {}) })
      })
    }

    const unsubscribe = nodeStore.subscribe(handleChange)

    return () => {
      unsubscribe()
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
      pending.clear()
    }
  }, [enableSearchIndex, hubUrl, nodeStore, syncManager])
}
