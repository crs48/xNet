/**
 * @xnetjs/hub - Durable billing store (its own `billing.db`).
 *
 * Implements `@xnetjs/billing`'s `BillingStore` contract over better-sqlite3,
 * following the hub's pattern of a subsystem-local database rather than bloating
 * the core `HubStorage`. Provider webhooks stream into these tables (the Stripe
 * Sync Engine pattern), and `GET /billing/me` reads them back DID-scoped.
 *
 * In `memory` storage mode (tests/demo) we use the in-memory store from
 * `@xnetjs/billing` instead of writing a real file.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  MemoryBillingStore,
  pickCurrentSubscription,
  type BillingMutation,
  type BillingState,
  type BillingStore,
  type Customer,
  type DID,
  type Invoice,
  type Payment,
  type Subscription
} from '@xnetjs/billing'
import Database from 'better-sqlite3'

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS billing_seen_events (event_id TEXT PRIMARY KEY);

CREATE TABLE IF NOT EXISTS billing_customers (
  did TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  email TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_customers_ref ON billing_customers(external_ref);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  price_ref TEXT NOT NULL,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  raw TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_did ON billing_subscriptions(did);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  customer_ref TEXT,
  amount_due_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  hosted_url TEXT,
  raw TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_did ON billing_invoices(did);

CREATE TABLE IF NOT EXISTS billing_payments (
  id TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  customer_ref TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  raw TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_payments_did ON billing_payments(did);
`

type Row = Record<string, unknown>
const parseRaw = (v: unknown): unknown => (typeof v === 'string' ? JSON.parse(v) : undefined)
const serializeRaw = (v: unknown): string | null => (v === undefined ? null : JSON.stringify(v))

export class SqliteBillingStore implements BillingStore {
  private readonly db: Database.Database

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.db = new Database(join(dataDir, 'billing.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('busy_timeout = 5000')
    this.db.exec(SCHEMA_SQL)
  }

  async hasSeenEvent(eventId: string): Promise<boolean> {
    return (
      this.db.prepare('SELECT 1 FROM billing_seen_events WHERE event_id = ?').get(eventId) !==
      undefined
    )
  }

  async markEventSeen(eventId: string): Promise<void> {
    this.db.prepare('INSERT OR IGNORE INTO billing_seen_events (event_id) VALUES (?)').run(eventId)
  }

  async didForCustomerRef(externalRef: string): Promise<DID | null> {
    const row = this.db
      .prepare('SELECT did FROM billing_customers WHERE external_ref = ?')
      .get(externalRef) as { did: string } | undefined
    return row?.did ?? null
  }

  async applyMutation(mutation: BillingMutation): Promise<void> {
    switch (mutation.kind) {
      case 'customer':
        return this.upsertCustomer(mutation.data)
      case 'subscription': {
        const did = await this.resolveDid(mutation.data)
        if (did) this.upsertSubscription({ ...mutation.data, did })
        return
      }
      case 'invoice': {
        const did = await this.resolveDid(mutation.data)
        if (did) this.upsertInvoice({ ...mutation.data, did })
        return
      }
      case 'payment': {
        const did = await this.resolveDid(mutation.data)
        if (did) this.upsertPayment({ ...mutation.data, did })
        return
      }
    }
  }

  async forDid(did: DID): Promise<BillingState> {
    const customerRow = this.db
      .prepare('SELECT * FROM billing_customers WHERE did = ?')
      .get(did) as Row | undefined
    const subscriptions = (
      this.db.prepare('SELECT * FROM billing_subscriptions WHERE did = ?').all(did) as Row[]
    ).map(toSubscription)
    const invoices = (
      this.db
        .prepare('SELECT * FROM billing_invoices WHERE did = ? ORDER BY updated_at DESC')
        .all(did) as Row[]
    ).map(toInvoice)
    const payments = (
      this.db
        .prepare('SELECT * FROM billing_payments WHERE did = ? ORDER BY updated_at DESC')
        .all(did) as Row[]
    ).map(toPayment)
    return {
      did,
      customer: customerRow ? toCustomer(customerRow) : null,
      subscription: pickCurrentSubscription(subscriptions),
      subscriptions,
      invoices,
      payments
    }
  }

  /** Backfill the DID for objects that arrived without our metadata. */
  private async resolveDid(record: { did: DID; customerRef?: string }): Promise<DID | null> {
    if (record.did) return record.did
    return record.customerRef ? this.didForCustomerRef(record.customerRef) : null
  }

  private upsertCustomer(c: Customer): void {
    this.db
      .prepare(
        `INSERT INTO billing_customers (did, provider, external_ref, email, updated_at)
         VALUES (@did, @provider, @external_ref, @email, @updated_at)
         ON CONFLICT(did) DO UPDATE SET
           provider = excluded.provider, external_ref = excluded.external_ref,
           email = excluded.email, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= billing_customers.updated_at`
      )
      .run({
        did: c.did,
        provider: c.provider,
        external_ref: c.externalRef,
        email: c.email ?? null,
        updated_at: c.updatedAt
      })
  }

  private upsertSubscription(s: Subscription): void {
    this.db
      .prepare(
        `INSERT INTO billing_subscriptions
           (id, did, provider, external_ref, status, price_ref, current_period_end, cancel_at_period_end, raw, updated_at)
         VALUES (@id, @did, @provider, @external_ref, @status, @price_ref, @current_period_end, @cancel_at_period_end, @raw, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
           did = excluded.did, status = excluded.status, price_ref = excluded.price_ref,
           current_period_end = excluded.current_period_end,
           cancel_at_period_end = excluded.cancel_at_period_end,
           raw = excluded.raw, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= billing_subscriptions.updated_at`
      )
      .run({
        id: s.id,
        did: s.did,
        provider: s.provider,
        external_ref: s.externalRef,
        status: s.status,
        price_ref: s.priceRef,
        current_period_end: s.currentPeriodEnd ?? null,
        cancel_at_period_end: s.cancelAtPeriodEnd ? 1 : 0,
        raw: serializeRaw(s.raw),
        updated_at: s.updatedAt
      })
  }

  private upsertInvoice(i: Invoice): void {
    this.db
      .prepare(
        `INSERT INTO billing_invoices
           (id, did, provider, external_ref, customer_ref, amount_due_minor, currency, status, hosted_url, raw, updated_at)
         VALUES (@id, @did, @provider, @external_ref, @customer_ref, @amount_due_minor, @currency, @status, @hosted_url, @raw, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
           did = excluded.did, amount_due_minor = excluded.amount_due_minor,
           currency = excluded.currency, status = excluded.status,
           hosted_url = excluded.hosted_url, raw = excluded.raw, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= billing_invoices.updated_at`
      )
      .run({
        id: i.id,
        did: i.did,
        provider: i.provider,
        external_ref: i.externalRef,
        customer_ref: i.customerRef ?? null,
        amount_due_minor: i.amountDueMinor,
        currency: i.currency,
        status: i.status,
        hosted_url: i.hostedUrl ?? null,
        raw: serializeRaw(i.raw),
        updated_at: i.updatedAt
      })
  }

  private upsertPayment(p: Payment): void {
    this.db
      .prepare(
        `INSERT INTO billing_payments
           (id, did, provider, external_ref, customer_ref, amount_minor, currency, status, raw, updated_at)
         VALUES (@id, @did, @provider, @external_ref, @customer_ref, @amount_minor, @currency, @status, @raw, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
           did = excluded.did, amount_minor = excluded.amount_minor,
           currency = excluded.currency, status = excluded.status,
           raw = excluded.raw, updated_at = excluded.updated_at
         WHERE excluded.updated_at >= billing_payments.updated_at`
      )
      .run({
        id: p.id,
        did: p.did,
        provider: p.provider,
        external_ref: p.externalRef,
        customer_ref: p.customerRef ?? null,
        amount_minor: p.amountMinor,
        currency: p.currency,
        status: p.status,
        raw: serializeRaw(p.raw),
        updated_at: p.updatedAt
      })
  }

  close(): void {
    this.db.close()
  }
}

function toCustomer(r: Row): Customer {
  return {
    id: r.external_ref as string,
    did: r.did as DID,
    provider: r.provider as Customer['provider'],
    externalRef: r.external_ref as string,
    ...(r.email ? { email: r.email as string } : {}),
    updatedAt: r.updated_at as number
  }
}

function toSubscription(r: Row): Subscription {
  return {
    id: r.id as string,
    did: r.did as DID,
    provider: r.provider as Subscription['provider'],
    externalRef: r.external_ref as string,
    status: r.status as Subscription['status'],
    priceRef: r.price_ref as string,
    currentPeriodEnd: (r.current_period_end as number | null) ?? null,
    cancelAtPeriodEnd: r.cancel_at_period_end === 1,
    raw: parseRaw(r.raw),
    updatedAt: r.updated_at as number
  }
}

function toInvoice(r: Row): Invoice {
  return {
    id: r.id as string,
    did: r.did as DID,
    provider: r.provider as Invoice['provider'],
    externalRef: r.external_ref as string,
    ...(r.customer_ref ? { customerRef: r.customer_ref as string } : {}),
    amountDueMinor: r.amount_due_minor as number,
    currency: r.currency as string,
    status: r.status as Invoice['status'],
    ...(r.hosted_url ? { hostedUrl: r.hosted_url as string } : {}),
    raw: parseRaw(r.raw),
    updatedAt: r.updated_at as number
  }
}

function toPayment(r: Row): Payment {
  return {
    id: r.id as string,
    did: r.did as DID,
    provider: r.provider as Payment['provider'],
    externalRef: r.external_ref as string,
    ...(r.customer_ref ? { customerRef: r.customer_ref as string } : {}),
    amountMinor: r.amount_minor as number,
    currency: r.currency as string,
    status: r.status as Payment['status'],
    raw: parseRaw(r.raw),
    updatedAt: r.updated_at as number
  }
}

/** Pick the durable SQLite store, or the in-memory one for `memory` storage mode. */
export function createBillingStore(opts: {
  storage: 'sqlite' | 'memory'
  dataDir: string
}): BillingStore {
  return opts.storage === 'memory' ? new MemoryBillingStore() : new SqliteBillingStore(opts.dataDir)
}
