/**
 * xNet Cloud — tenant registry.
 *
 * The control plane's record of every provisioned tenant: which plan, which hub,
 * which substrate, which version. In-memory to start (exploration 0175 Phase 0/1);
 * swap `MemoryTenantStore` for a durable store later.
 */

import type { PlanEntitlements, PlanId } from '@xnetjs/cloud-plans'

export interface TenantRecord {
  tenantId: string
  plan: PlanId
  entitlements: PlanEntitlements
  /** WorkOS billing user that owns this tenant. */
  billingUserId: string
  /** Bound data identity (`did:key`); empty while a rebind is pending. */
  did: string
  hubUrl: string
  substrateRef: string
  region: string
  targetVersion: string
  createdAt: number
}

export interface TenantStore {
  get(tenantId: string): Promise<TenantRecord | null>
  put(record: TenantRecord): Promise<void>
  list(): Promise<TenantRecord[]>
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
}
