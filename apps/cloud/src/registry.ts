/**
 * xNet Cloud — tenant registry.
 *
 * The control plane's record of every provisioned tenant: which plan, which hub,
 * which substrate, which version. In-memory to start (exploration 0175 Phase 0/1);
 * swap `MemoryTenantStore` for a durable store later.
 */

import type { PlanEntitlements, PlanId } from '@xnetjs/entitlements'

export interface TenantRecord {
  tenantId: string
  plan: PlanId
  entitlements: PlanEntitlements
  /** WorkOS billing user that owns this tenant. */
  billingUserId: string
  /** Bound data identity (`did:key`); empty while a rebind is pending. */
  did: string
  /** Reachable hub URL; empty while the tenant is cold (no live hub). */
  hubUrl: string
  /** Substrate handle; empty while cold (volume + machine released). */
  substrateRef: string
  region: string
  targetVersion: string
  createdAt: number
  /** Last time the tenant was active (drives cold demotion — exploration 0178). */
  lastActiveMs: number
  /** `hot` = live hub; `cold` = DB lives only in R2, restored on reactivation. */
  dataTier: 'hot' | 'cold'
  /**
   * Subscription lifecycle from the billing provider's view. `active` while paid;
   * `canceled` after a cancel webhook (hub suspended, R2 retained until deleted).
   * Undefined for tenants provisioned by the internal/admin route.
   */
  subscriptionStatus?: 'active' | 'canceled'
}

export interface TenantStore {
  get(tenantId: string): Promise<TenantRecord | null>
  put(record: TenantRecord): Promise<void>
  list(): Promise<TenantRecord[]>
  /** Forget a tenant entirely (the "delete my data" path). */
  delete(tenantId: string): Promise<void>
}

export class MemoryTenantStore implements TenantStore {
  private readonly records = new Map<string, TenantRecord>()

  async get(tenantId: string): Promise<TenantRecord | null> {
    const r = this.records.get(tenantId)
    return r ? { ...r } : null
  }

  async put(record: TenantRecord): Promise<void> {
    this.records.set(record.tenantId, { ...record })
  }

  async list(): Promise<TenantRecord[]> {
    return [...this.records.values()].map((r) => ({ ...r }))
  }

  async delete(tenantId: string): Promise<void> {
    this.records.delete(tenantId)
  }
}
