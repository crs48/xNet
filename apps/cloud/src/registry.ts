/**
 * xNet Cloud — tenant registry.
 *
 * The control plane's record of every provisioned tenant: which plan, which hub,
 * which substrate, which version. In-memory to start (exploration 0175 Phase 0/1);
 * swap `MemoryTenantStore` for a durable store later.
 */

import type { DunningState } from './reconcile/billing'
import type { BudgetWindow } from '@xnetjs/cloud'
import type { PlanEntitlements, PlanId, TenantMemberRole } from '@xnetjs/entitlements'

/**
 * One person entitled to a tenant's hub (exploration 0436 G4).
 *
 * Before this existed the control plane's whole idea of a customer was a single
 * `billingUserId` and a single `did`, so a `family` plan advertising "5 seats,
 * one bill" had no way to express members two through five — and the hub, with
 * no trusted-root policy, accepted any DID on the internet instead.
 */
export interface TenantMember {
  /**
   * The member's data identity. Bound through the device-grant flow, always
   * minted on their own device — we never hold a member's key material.
   */
  did: string
  /**
   * `guest` deliberately does NOT consume a seat. A seat is capacity we
   * provision for a collaborator; an audience member the customer brought is
   * not one, and charging for them would be the per-member meter Charter §6
   * refuses (see `seatsUsed` in `@xnetjs/entitlements`).
   */
  role: TenantMemberRole
  addedAtMs: number
  /** The billing user who approved this member's device grant. */
  addedBy: string
  /** Optional human label for the dashboard; never used for authorization. */
  label?: string
}

export interface TenantRecord {
  tenantId: string
  plan: PlanId
  entitlements: PlanEntitlements
  /** WorkOS billing user that owns this tenant. */
  billingUserId: string
  /** Bound data identity (`did:key`); empty while a rebind is pending. */
  did: string
  /**
   * Everyone entitled to this tenant's hub, projected into `HUB_TRUSTED_DIDS`.
   *
   * **Absent means legacy, not empty.** A record written before this field
   * existed has an implicit roster of `[{ did, role: 'owner' }]`; treating it as
   * an empty list would write an empty trusted-root policy and lock the owner
   * out of their own hub. `rosterFor()` is the single place that decides this —
   * do not read the field directly.
   */
  members?: TenantMember[]
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
  /**
   * The tenant's managed-AI virtual key (`sk-…`) — a server-side secret used as the
   * gateway Bearer; never sent to the client. Set when the plan is `aiEnabled` and a
   * key manager is configured. The matching budget + included amount live on
   * `entitlements` (explorations 0200/0201). Works for both LiteLLM and OpenRouter.
   */
  aiKeyRef?: string
  /**
   * Management handle for the AI key (`VirtualKey.manageId`) when it differs from the
   * Bearer secret — the OpenRouter key `hash` used for update/delete. Unset for
   * LiteLLM, where the key value is its own handle (falls back to `aiKeyRef`).
   */
  aiKeyManageRef?: string
  /**
   * Per-tenant hard AI spend cap (USD/month) the customer set for themselves. Always
   * clamped to ≤ the plan's `aiMonthlyBudgetUsd`; the metered gateway stops at the
   * lower of the two. Unset = the full plan cap (exploration 0201).
   *
   * @deprecated Superseded by {@link aiBudget} (exploration 0244), which adds a
   * window. Still read as a fallback for tenants provisioned before the migration.
   */
  aiCapUsd?: number
  /**
   * The tenant's self-serve AI budget: a hard cap (USD, clamped ≤ the plan's
   * `aiMonthlyBudgetUsd`) over a window (calendar month / week / rolling N days).
   * The metered gateway sums ledger spend since the window start and stops at the
   * cap; the OpenRouter key `limit_reset` is aligned to the window as a coarse
   * provider-side backstop. Unset = the full plan cap on the calendar month
   * (exploration 0244).
   */
  aiBudget?: { capUsd: number; window: BudgetWindow }
  /**
   * Stripe customer id (`cus_…`) captured at checkout, needed to bill metered AI
   * overage. Falls back to `billingUserId` for the meter event when unset.
   */
  stripeCustomerId?: string
  /**
   * Non-payment (dunning) lifecycle state (exploration 0260). Undefined for a
   * tenant that has never missed a payment (treated as healthy/`active`). Updated
   * from Stripe webhooks via `recordBillingEvent`; the deadlines drive the
   * grace → read-only → suspended → deletion transitions via `reconcileBilling`.
   */
  billing?: DunningState
}

/** One page of the fleet, ordered by `tenantId`. */
export interface TenantPage {
  items: TenantRecord[]
  /** Cursor for the next page, or null when the fleet is exhausted. */
  next: string | null
}

export interface TenantStore {
  get(tenantId: string): Promise<TenantRecord | null>
  put(record: TenantRecord): Promise<void>
  list(): Promise<TenantRecord[]>
  /** Forget a tenant entirely (the "delete my data" path). */
  delete(tenantId: string): Promise<void>
  /**
   * Look a tenant up by the key the billing webhook actually arrives with
   * (exploration 0423). `billingUserId` is not the primary key, so without this
   * every Stripe event scanned the whole fleet — the access pattern a sharded
   * database solves with a lookup vindex. Implementations must make this
   * indexed, not a scan.
   *
   * When more than one tenant shares a billing identity the FIRST by insertion
   * order wins, matching the `list().find(...)` behaviour this replaced.
   */
  getByBillingUser(billingUserId: string): Promise<TenantRecord | null>
  /**
   * Page the fleet in `tenantId` order, so a sweep never has to materialise
   * every tenant at once — and so the reconcile loop can later be partitioned
   * by `hash(tenantId) % workers` without changing its shape (0423).
   */
  page(cursor: string | null, limit: number): Promise<TenantPage>
}

/**
 * Slice a sorted id list into one page. Shared by every {@link TenantStore}
 * implementation that pages in memory, so cursor semantics cannot drift between
 * them: the cursor is the last id of the previous page (exclusive).
 */
export function pageSortedIds(
  sortedIds: string[],
  cursor: string | null,
  limit: number
): { ids: string[]; next: string | null } {
  if (limit < 1) throw new Error(`page limit must be >= 1, got ${limit}`)
  const start = cursor === null ? 0 : sortedIds.findIndex((id) => id > cursor)
  if (start === -1) return { ids: [], next: null }
  const ids = sortedIds.slice(start, start + limit)
  const consumed = start + ids.length
  return { ids, next: consumed < sortedIds.length ? (ids[ids.length - 1] ?? null) : null }
}

export class MemoryTenantStore implements TenantStore {
  private readonly records = new Map<string, TenantRecord>()
  /**
   * The lookup index: `billingUserId` → tenant ids in insertion order. Kept in
   * step with `records` inside `put`/`delete` so it can never disagree with the
   * primary map — a stale index would silently hand a webhook the wrong tenant.
   */
  private readonly byBillingUser = new Map<string, string[]>()

  async get(tenantId: string): Promise<TenantRecord | null> {
    const r = this.records.get(tenantId)
    return r ? { ...r } : null
  }

  async put(record: TenantRecord): Promise<void> {
    const previous = this.records.get(record.tenantId)
    if (previous && previous.billingUserId !== record.billingUserId) {
      this.unindex(previous.billingUserId, record.tenantId)
    }
    this.records.set(record.tenantId, { ...record })
    this.index(record.billingUserId, record.tenantId)
  }

  async list(): Promise<TenantRecord[]> {
    return [...this.records.values()].map((r) => ({ ...r }))
  }

  async delete(tenantId: string): Promise<void> {
    const previous = this.records.get(tenantId)
    if (previous) this.unindex(previous.billingUserId, tenantId)
    this.records.delete(tenantId)
  }

  async getByBillingUser(billingUserId: string): Promise<TenantRecord | null> {
    for (const tenantId of this.byBillingUser.get(billingUserId) ?? []) {
      const record = this.records.get(tenantId)
      if (record) return { ...record }
    }
    return null
  }

  async page(cursor: string | null, limit: number): Promise<TenantPage> {
    const { ids, next } = pageSortedIds([...this.records.keys()].sort(), cursor, limit)
    return {
      items: ids.flatMap((id) => {
        const record = this.records.get(id)
        return record ? [{ ...record }] : []
      }),
      next
    }
  }

  private index(billingUserId: string, tenantId: string): void {
    const ids = this.byBillingUser.get(billingUserId) ?? []
    if (!ids.includes(tenantId)) ids.push(tenantId)
    this.byBillingUser.set(billingUserId, ids)
  }

  private unindex(billingUserId: string, tenantId: string): void {
    const ids = (this.byBillingUser.get(billingUserId) ?? []).filter((id) => id !== tenantId)
    if (ids.length === 0) this.byBillingUser.delete(billingUserId)
    else this.byBillingUser.set(billingUserId, ids)
  }
}
