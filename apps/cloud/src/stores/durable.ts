/**
 * xNet Cloud — durable control-plane stores.
 *
 * A control-plane restart must not forget tenants. The two identity/tenant stores
 * (tenant registry + identity bindings) are backed by a tiny {@link DocStore} port
 * so their *logic* is unit-tested with {@link InMemoryDocStore} and the production
 * Firestore wiring (`./firestore.ts`) is a thin adapter (exploration 0196). The
 * shorter-lived stores (device grants, usage ledger, health samples) stay in
 * memory for now — losing them on restart only costs a re-claim or a rebuilt
 * sample window, not a tenant.
 */

import type { TenantRecord, TenantStore } from '../registry'
import type { BindingStore, TenantBinding } from '@xnetjs/cloud/identity'
import { pageSortedIds } from '../registry'

/** One page of documents, ordered by document id. */
export interface DocPage<T> {
  items: T[]
  /** Cursor for the next page (the last id returned), or null when exhausted. */
  next: string | null
}

/** A minimal document collection: get/put/delete by id, plus list, query, page. */
export interface DocStore<T> {
  get(id: string): Promise<T | null>
  put(id: string, doc: T): Promise<void>
  delete(id: string): Promise<void>
  list(): Promise<T[]>
  /**
   * Equality lookup on a top-level field, in document-id order (exploration
   * 0423). Backends that can index the field must do so — this exists precisely
   * so the caller stops scanning. The in-memory implementation scans because it
   * *is* the fleet, so a scan costs nothing there.
   */
  findWhere(field: string, value: string): Promise<T[]>
  /** One page in document-id order; the cursor is the previous page's last id. */
  page(cursor: string | null, limit: number): Promise<DocPage<T>>
}

/** In-memory DocStore (clones in/out so callers can't alias stored docs). */
export class InMemoryDocStore<T> implements DocStore<T> {
  private readonly docs = new Map<string, T>()

  async get(id: string): Promise<T | null> {
    const v = this.docs.get(id)
    return v === undefined ? null : structuredClone(v)
  }
  async put(id: string, doc: T): Promise<void> {
    this.docs.set(id, structuredClone(doc))
  }
  async delete(id: string): Promise<void> {
    this.docs.delete(id)
  }
  async list(): Promise<T[]> {
    return [...this.docs.values()].map((v) => structuredClone(v))
  }
  async findWhere(field: string, value: string): Promise<T[]> {
    return [...this.docs.keys()]
      .sort()
      .flatMap((id) => {
        const doc = this.docs.get(id)
        return doc ? [doc] : []
      })
      .filter((doc) => (doc as Record<string, unknown>)[field] === value)
      .map((doc) => structuredClone(doc))
  }
  async page(cursor: string | null, limit: number): Promise<DocPage<T>> {
    const { ids, next } = pageSortedIds([...this.docs.keys()].sort(), cursor, limit)
    return {
      items: ids.flatMap((id) => {
        const doc = this.docs.get(id)
        return doc ? [structuredClone(doc)] : []
      }),
      next
    }
  }
}

/**
 * A durable TenantStore over a DocStore keyed by tenantId.
 *
 * `getByBillingUser` delegates to {@link DocStore.findWhere} rather than
 * scanning, so on Firestore it becomes a real indexed query (0423). Ties are
 * broken by document id, which is stable across restarts — unlike the insertion
 * order the in-memory store preserves, but a billing identity owning two
 * tenants is already a degenerate case the singular API cannot express.
 */
export function tenantStoreFromDocs(docs: DocStore<TenantRecord>): TenantStore {
  return {
    get: (id) => docs.get(id),
    put: (record) => docs.put(record.tenantId, record),
    list: () => docs.list(),
    delete: (id) => docs.delete(id),
    getByBillingUser: async (billingUserId) =>
      (await docs.findWhere('billingUserId', billingUserId))[0] ?? null,
    page: async (cursor, limit) => {
      const { items, next } = await docs.page(cursor, limit)
      return { items, next }
    }
  }
}

/**
 * A durable BindingStore over a DocStore keyed by tenantId. `findByBillingUser`
 * scans (the control plane's binding count is modest); swap for an indexed query
 * if it ever grows large.
 */
export function bindingStoreFromDocs(docs: DocStore<TenantBinding>): BindingStore {
  return {
    get: (tenantId) => docs.get(tenantId),
    put: (binding) => docs.put(binding.tenantId, binding),
    findByBillingUser: async (billingUserId) =>
      (await docs.list()).find((b) => b.billingUserId === billingUserId) ?? null
  }
}
