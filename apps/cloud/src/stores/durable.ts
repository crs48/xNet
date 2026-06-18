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

/** A minimal document collection: get/put/delete by id, plus list. */
export interface DocStore<T> {
  get(id: string): Promise<T | null>
  put(id: string, doc: T): Promise<void>
  delete(id: string): Promise<void>
  list(): Promise<T[]>
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
}

/** A durable TenantStore over a DocStore keyed by tenantId. */
export function tenantStoreFromDocs(docs: DocStore<TenantRecord>): TenantStore {
  return {
    get: (id) => docs.get(id),
    put: (record) => docs.put(record.tenantId, record),
    list: () => docs.list(),
    delete: (id) => docs.delete(id)
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
