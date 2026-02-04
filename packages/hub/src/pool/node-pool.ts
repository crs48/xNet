/**
 * @xnet/hub - Node pool for Y.Doc instances.
 */

import type { HubStorage } from '../storage/interface'
import * as Y from 'yjs'

type PoolEntry = {
  doc: Y.Doc
  lastAccess: number
  dirty: boolean
  subscribers: number
  persistTimer: ReturnType<typeof setTimeout> | null
}

type NodePoolOptions = {
  maxWarmDocs?: number
  persistDelay?: number
}

const createEntry = (doc: Y.Doc): PoolEntry => ({
  doc,
  lastAccess: Date.now(),
  dirty: false,
  subscribers: 0,
  persistTimer: null
})

export class NodePool {
  private entries = new Map<string, PoolEntry>()
  private maxWarmDocs: number
  private persistDelay: number

  constructor(private storage: HubStorage, options?: NodePoolOptions) {
    this.maxWarmDocs = options?.maxWarmDocs ?? 500
    this.persistDelay = options?.persistDelay ?? 1000
  }

  async get(docId: string): Promise<Y.Doc> {
    const existing = this.entries.get(docId)
    if (existing) {
      existing.lastAccess = Date.now()
      return existing.doc
    }

    const doc = new Y.Doc()
    const state = await this.storage.getDocState(docId)
    if (state) {
      Y.applyUpdate(doc, state)
    }

    const entry = createEntry(doc)
    this.entries.set(docId, entry)
    this.evictIfNeeded()
    return doc
  }

  addSubscriber(docId: string): void {
    const entry = this.entries.get(docId)
    if (entry) {
      entry.subscribers += 1
    }
  }

  removeSubscriber(docId: string): void {
    const entry = this.entries.get(docId)
    if (entry) {
      entry.subscribers = Math.max(0, entry.subscribers - 1)
    }
  }

  markDirty(docId: string): void {
    const entry = this.entries.get(docId)
    if (!entry) return

    entry.dirty = true

    if (entry.persistTimer) {
      clearTimeout(entry.persistTimer)
    }

    entry.persistTimer = setTimeout(() => {
      void this.persist(docId)
    }, this.persistDelay)
  }

  async persist(docId: string): Promise<void> {
    const entry = this.entries.get(docId)
    if (!entry || !entry.dirty) return

    const state = Y.encodeStateAsUpdate(entry.doc)
    await this.storage.setDocState(docId, state)
    entry.dirty = false
    entry.persistTimer = null
  }

  async persistAll(): Promise<void> {
    const tasks: Promise<void>[] = []
    for (const [docId, entry] of this.entries) {
      if (!entry.dirty) continue
      if (entry.persistTimer) {
        clearTimeout(entry.persistTimer)
      }
      tasks.push(this.persist(docId))
    }
    await Promise.all(tasks)
  }

  getStats(): { hot: number; warm: number; total: number } {
    let hot = 0
    let warm = 0
    for (const entry of this.entries.values()) {
      if (entry.subscribers > 0) {
        hot += 1
      } else {
        warm += 1
      }
    }
    return { hot, warm, total: this.entries.size }
  }

  destroy(): void {
    for (const entry of this.entries.values()) {
      if (entry.persistTimer) {
        clearTimeout(entry.persistTimer)
      }
      entry.doc.destroy()
    }
    this.entries.clear()
  }

  private evictIfNeeded(): void {
    const warmDocs: Array<[string, PoolEntry]> = []

    for (const [docId, entry] of this.entries) {
      if (entry.subscribers === 0) {
        warmDocs.push([docId, entry])
      }
    }

    if (warmDocs.length <= this.maxWarmDocs) return

    warmDocs.sort((a, b) => a[1].lastAccess - b[1].lastAccess)
    const toEvict = warmDocs.length - this.maxWarmDocs

    for (let i = 0; i < toEvict; i += 1) {
      const [docId, entry] = warmDocs[i]
      if (entry.persistTimer) {
        clearTimeout(entry.persistTimer)
      }
      if (entry.dirty) {
        const state = Y.encodeStateAsUpdate(entry.doc)
        void this.storage.setDocState(docId, state)
      }
      entry.doc.destroy()
      this.entries.delete(docId)
    }
  }
}
