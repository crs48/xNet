/**
 * xNet Cloud — sales leads (exploration 0436, Phase C).
 *
 * `company` and `enterprise` exist in the plan catalog and cannot be bought:
 * `CHECKOUT_PLANS` never listed them and the Enterprise CTA was an HTML anchor
 * (`/cloud#enterprise`). That is not a deliberate sales motion, it is a missing
 * route — so a visitor who wants to pay us has nowhere to say so.
 *
 * This is the smallest honest version: capture the ask, store it durably, let an
 * operator convert it into a provisioned tenant with the overrides that were
 * actually agreed. Deliberately NOT an email relay — a lead form that forwards
 * to an inbox is a spam relay with extra steps, and the operator console
 * (0431/0433) is where fleet-facing work belongs.
 */

import type { PlanId } from '@xnetjs/entitlements'

export interface SalesLead {
  id: string
  email: string
  plan: PlanId
  orgName: string
  /** Seats asked for; `0` when unstated. Never used to price anything automatically. */
  seats: number
  notes: string
  createdAtMs: number
  status: 'new' | 'contacted' | 'converted' | 'closed'
  /** Set when an operator turns this into a tenant. */
  tenantId?: string
}

export interface SalesLeadStore {
  put(lead: SalesLead): Promise<void>
  get(id: string): Promise<SalesLead | null>
  list(): Promise<SalesLead[]>
}

/** In-memory lead store — the dev/test default; production wires a durable one. */
export class MemorySalesLeadStore implements SalesLeadStore {
  private readonly leads = new Map<string, SalesLead>()
  async put(lead: SalesLead): Promise<void> {
    this.leads.set(lead.id, { ...lead })
  }
  async get(id: string): Promise<SalesLead | null> {
    const lead = this.leads.get(id)
    return lead ? { ...lead } : null
  }
  async list(): Promise<SalesLead[]> {
    return [...this.leads.values()]
      .map((l) => ({ ...l }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
  }
}

/**
 * A small non-cryptographic hash, used only to give a lead id a stable-looking
 * suffix. Not a secret and not a key — ids are opaque handles an operator pastes.
 */
export function hashString(input: string): number {
  let h = 0
  for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
  return h
}
