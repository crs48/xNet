/**
 * Notifier — accumulates derived InboxItems from the change stream.
 *
 * Wire it to `bridge.subscribeToChanges` (works on both the main-thread and
 * worker bridges): every applied change is evaluated once; matches become
 * items. The item list is a worker-local cache — rebuildable, never synced.
 * Persistence of triage state happens through InboxState (see inbox.ts).
 */

import type { InboxItem, NotifierContext, NotifierEvent } from './types'
import { evaluateChange } from './rules'

export interface Notifier {
  /** Feed one applied change; returns the produced item, if any. */
  handleEvent(event: NotifierEvent): InboxItem | null
  /** Push a synthetic item (call-missed, system). */
  push(item: InboxItem): void
  /** Snapshot, newest first. Stable reference until items change. */
  getItems(): InboxItem[]
  /** Subscribe to list changes; returns unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Update context lookups (keywords, channel kinds) without resubscribing. */
  setContext(context: Partial<NotifierContext>): void
  clear(): void
}

export const MAX_INBOX_ITEMS = 1000

export function createNotifier(context: NotifierContext): Notifier {
  let ctx: NotifierContext = { ...context }
  let items: InboxItem[] = []
  const bySource = new Map<string, InboxItem>()
  const listeners = new Set<() => void>()

  function emit(): void {
    for (const listener of listeners) listener()
  }

  function insert(item: InboxItem): void {
    const existing = bySource.get(item.sourceId)
    if (existing) {
      // Same source re-notifying (e.g. late mention edit): keep the newest.
      items = items.filter((i) => i.sourceId !== item.sourceId)
    }
    bySource.set(item.sourceId, item)
    items = [item, ...items].slice(0, MAX_INBOX_ITEMS)
    emit()
  }

  return {
    handleEvent(event) {
      const item = evaluateChange(event, ctx)
      if (item) insert(item)
      return item
    },
    push(item) {
      insert(item)
    },
    getItems() {
      return items
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setContext(partial) {
      ctx = { ...ctx, ...partial }
    },
    clear() {
      items = []
      bySource.clear()
      emit()
    }
  }
}
