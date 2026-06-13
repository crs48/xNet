/**
 * xNet Cloud — control plane orchestration.
 *
 * Composes the four shipped primitives into the managed-fleet lifecycle:
 *   - `@xnetjs/cloud-plans`        — resolve + sign per-tenant entitlements
 *   - `@xnetjs/cloud-identity`     — bind the billing identity to the data DID
 *   - `@xnetjs/cloud-provisioner`  — create / flip / migrate the hub
 *   - tenant registry              — remember what we provisioned
 *
 * This is the seam a Stripe `checkout.completed` webhook drives (provision) and a
 * Customer-Portal plan change drives (changePlan), per explorations 0174/0175.
 */

import type { Provisioner } from '@xnetjs/cloud-provisioner'
import {
  bindIdentities,
  recoverPaidAccount,
  type BindingStore,
  type DidChallenge,
  type DidChallengeVerifier
} from '@xnetjs/cloud-identity'
import {
  requiresMigration,
  resolveEntitlements,
  signEntitlements,
  type PlanEntitlements,
  type PlanId
} from '@xnetjs/cloud-plans'
import { type TenantRecord, type TenantStore } from './registry'

export interface ControlPlaneDeps {
  tenants: TenantStore
  bindings: BindingStore
  provisioner: Provisioner
  verifyDid: DidChallengeVerifier
  /** Secret used to sign the HUB_PLAN entitlement token the hub verifies. */
  planSecret: string
  /** Immutable hub image tag new tenants are pinned to (never `latest`). */
  defaultTargetVersion: string
  /** Injectable clock for deterministic tests. */
  nowMs?: () => number
}

export interface ProvisionTenantArgs {
  tenantId: string
  plan: PlanId
  /** WorkOS billing user (proven by an authenticated session upstream). */
  billingUserId: string
  /** Fresh DID challenge for the tenant's data identity. */
  challenge: DidChallenge
  /** Optional per-tenant entitlement overrides (add-on storage, seats, residency). */
  overrides?: Partial<Omit<PlanEntitlements, 'plan'>>
  region?: string
}

/** Result of a plan change: either an in-place flip or a required migration. */
export type PlanChangeResult =
  | { kind: 'flipped'; tenant: TenantRecord }
  | { kind: 'migration-required'; from: PlanEntitlements; to: PlanEntitlements }

export class ControlPlane {
  constructor(private readonly deps: ControlPlaneDeps) {}

  private now(): number {
    return this.deps.nowMs ? this.deps.nowMs() : Date.now()
  }

  private hubEnv(entitlements: PlanEntitlements): Record<string, string> {
    // The hub verifies this token locally and enforces the limits — no runtime
    // call back to the control plane (anti-lock-in invariant).
    return { HUB_PLAN: signEntitlements(entitlements, this.deps.planSecret) }
  }

  /**
   * Provision a brand-new tenant: bind identities (dual proof), resolve + sign
   * entitlements, provision an isolated hub, and record it.
   */
  async provisionTenant(args: ProvisionTenantArgs): Promise<TenantRecord> {
    const existing = await this.deps.tenants.get(args.tenantId)
    if (existing) throw new Error(`Tenant already exists: ${args.tenantId}`)

    const binding = await bindIdentities(this.deps.bindings, this.deps.verifyDid, {
      tenantId: args.tenantId,
      billingUserId: args.billingUserId,
      challenge: args.challenge,
      nowMs: this.now()
    })

    const entitlements = resolveEntitlements(args.plan, args.overrides)
    const handle = await this.deps.provisioner.provision({
      tenantId: args.tenantId,
      entitlements,
      targetVersion: this.deps.defaultTargetVersion,
      region: args.region,
      env: this.hubEnv(entitlements)
    })

    const record: TenantRecord = {
      tenantId: args.tenantId,
      plan: args.plan,
      entitlements,
      billingUserId: binding.billingUserId,
      did: binding.did,
      hubUrl: handle.hubUrl,
      substrateRef: handle.substrateRef,
      region: handle.region,
      targetVersion: handle.targetVersion,
      createdAt: this.now()
    }
    await this.deps.tenants.put(record)
    return record
  }

  /**
   * Change a tenant's plan or capacity. A change that stays within the same
   * isolation tier (e.g. more storage/seats/concurrency) is a live entitlement
   * flip — `provisioner.setEnv` with a freshly-signed token, no data movement.
   * Crossing an isolation boundary returns `migration-required` for the migration
   * engine to handle (exploration 0175).
   */
  async changePlan(
    tenantId: string,
    plan: PlanId,
    overrides: Partial<Omit<PlanEntitlements, 'plan'>> = {}
  ): Promise<PlanChangeResult> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)

    const next = resolveEntitlements(plan, overrides)
    if (requiresMigration(record.entitlements, next)) {
      return { kind: 'migration-required', from: record.entitlements, to: next }
    }

    const handle = await this.deps.provisioner.setEnv(record.substrateRef, this.hubEnv(next))
    const updated: TenantRecord = {
      ...record,
      plan,
      entitlements: next,
      hubUrl: handle.hubUrl,
      region: handle.region,
      targetVersion: handle.targetVersion
    }
    await this.deps.tenants.put(updated)
    return { kind: 'flipped', tenant: updated }
  }

  /**
   * Roll a tenant's hub to a new immutable image (one staged-rollout step).
   */
  async upgradeTenant(tenantId: string, targetVersion: string): Promise<TenantRecord> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)
    const handle = await this.deps.provisioner.upgrade(record.substrateRef, targetVersion)
    const updated: TenantRecord = { ...record, targetVersion: handle.targetVersion }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Recover a paid account from the billing identity alone. The subscription, the
   * tenant record, and the provisioned hub all survive; the data identity is
   * cleared and marked for rebind. Billing recovery never recovers the old
   * encrypted data — that needs a data-side recovery method.
   */
  async recoverAccount(billingUserId: string): Promise<{ tenant: TenantRecord }> {
    const binding = await recoverPaidAccount(this.deps.bindings, {
      billingUserId,
      nowMs: this.now()
    })
    const record = await this.deps.tenants.get(binding.tenantId)
    if (!record) throw new Error(`Binding has no tenant record: ${binding.tenantId}`)
    const updated: TenantRecord = { ...record, did: '' }
    await this.deps.tenants.put(updated)
    return { tenant: updated }
  }

  getTenant(tenantId: string): Promise<TenantRecord | null> {
    return this.deps.tenants.get(tenantId)
  }
}
