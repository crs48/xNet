/**
 * @xnetjs/billing — the billing store contract + an in-memory implementation.
 *
 * The store is the authoritative mirror of provider state (the "track billing in
 * our own schema" idea, modeled on the Stripe Sync Engine). It is also the
 * idempotency ledger: `hasSeenEvent`/`markEventSeen` dedupe Stripe's at-least-once
 * webhook retries. Reads are always DID-scoped — a caller only ever sees their own
 * billing.
 *
 * The hub provides a durable SQLite implementation; this in-memory one backs unit
 * tests and local dev.
 */

import type {
  BillingMutation,
  BillingState,
  Customer,
  DID,
  Invoice,
  Payment,
  Subscription
} from './types'

export interface BillingStore {
  /** Has this provider event id already been applied? (idempotency) */
  hasSeenEvent(eventId: string): Promise<boolean>
  /** Record a provider event id as applied. */
  markEventSeen(eventId: string): Promise<void>
  /** Apply a normalized mutation (upsert, last-write-wins by `updatedAt`). */
  applyMutation(mutation: BillingMutation): Promise<void>
  /** The DID-scoped billing snapshot for one identity. */
  forDid(did: DID): Promise<BillingState>
  /** Resolve a DID from a provider customer ref (for objects lacking our metadata). */
  didForCustomerRef(externalRef: string): Promise<DID | null>
}

/** Active-ish subscriptions count as "subscribed"; ranked first when picking the current one. */
export function isActiveSubscription(sub: Subscription | null | undefined): boolean {
  return sub?.status === 'active' || sub?.status === 'trialing'
}

const SUBSCRIPTION_RANK: Record<Subscription['status'], number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
  unpaid: 3,
  incomplete: 4,
  canceled: 5
}

/** Pick the most relevant subscription: active/trialing first, then most recently updated. */
export function pickCurrentSubscription(subs: Subscription[]): Subscription | null {
  if (subs.length === 0) return null
  return [...subs].sort((a, b) => {
    const rank = SUBSCRIPTION_RANK[a.status] - SUBSCRIPTION_RANK[b.status]
    return rank !== 0 ? rank : b.updatedAt - a.updatedAt
  })[0]
}

export class MemoryBillingStore implements BillingStore {
  private readonly seenEvents = new Set<string>()
  private readonly customers = new Map<DID, Customer>()
  private readonly customerRefToDid = new Map<string, DID>()
  private readonly subscriptions = new Map<string, Subscription>()
  private readonly invoices = new Map<string, Invoice>()
  private readonly payments = new Map<string, Payment>()

  async hasSeenEvent(eventId: string): Promise<boolean> {
    return this.seenEvents.has(eventId)
  }

  async markEventSeen(eventId: string): Promise<void> {
    this.seenEvents.add(eventId)
  }

  async didForCustomerRef(externalRef: string): Promise<DID | null> {
    return this.customerRefToDid.get(externalRef) ?? null
  }

  async applyMutation(mutation: BillingMutation): Promise<void> {
    switch (mutation.kind) {
      case 'customer': {
        const c = mutation.data
        if (!this.isNewer(this.customers.get(c.did), c)) return
        this.customers.set(c.did, c)
        if (c.externalRef) this.customerRefToDid.set(c.externalRef, c.did)
        return
      }
      case 'subscription': {
        const s = this.resolveDid(mutation.data)
        if (!s.did) return
        if (this.isNewer(this.subscriptions.get(s.id), s)) this.subscriptions.set(s.id, s)
        return
      }
      case 'invoice': {
        const i = this.resolveDid(mutation.data)
        if (!i.did) return
        if (this.isNewer(this.invoices.get(i.id), i)) this.invoices.set(i.id, i)
        return
      }
      case 'payment': {
        const p = this.resolveDid(mutation.data)
        if (!p.did) return
        if (this.isNewer(this.payments.get(p.id), p)) this.payments.set(p.id, p)
        return
      }
    }
  }

  async forDid(did: DID): Promise<BillingState> {
    const subscriptions = [...this.subscriptions.values()].filter((s) => s.did === did)
    const invoices = [...this.invoices.values()]
      .filter((i) => i.did === did)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    const payments = [...this.payments.values()]
      .filter((p) => p.did === did)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return {
      did,
      customer: this.customers.get(did) ?? null,
      subscription: pickCurrentSubscription(subscriptions),
      subscriptions,
      invoices,
      payments
    }
  }

  /** Backfill `did` from the customer ref map when an object carried no DID metadata. */
  private resolveDid<T extends { did: DID; customerRef?: string }>(record: T): T {
    if (record.did) return record
    const did = record.customerRef ? this.customerRefToDid.get(record.customerRef) : undefined
    return did ? { ...record, did } : record
  }

  private isNewer(
    existing: { updatedAt: number } | undefined,
    next: { updatedAt: number }
  ): boolean {
    return !existing || next.updatedAt >= existing.updatedAt
  }
}
