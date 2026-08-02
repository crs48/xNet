/**
 * xNet Cloud — control plane orchestration.
 *
 * Composes the four shipped primitives into the managed-fleet lifecycle:
 *   - `@xnetjs/entitlements`        — resolve + sign per-tenant entitlements
 *   - `@xnetjs/cloud/identity`     — bind the billing identity to the data DID
 *   - `@xnetjs/cloud/provisioner`  — create / flip / migrate the hub
 *   - tenant registry              — remember what we provisioned
 *
 * This is the seam a Stripe `checkout.completed` webhook drives (provision) and a
 * Customer-Portal plan change drives (changePlan), per explorations 0174/0175.
 */

import type { HubHandle, Provisioner } from '@xnetjs/cloud/provisioner'
import {
  DEFAULT_BUDGET_WINDOW,
  keyResetFor,
  type BudgetWindow,
  type VirtualKey,
  type VirtualKeyManager
} from '@xnetjs/cloud'
import {
  bindIdentities,
  completeRebind,
  recoverPaidAccount,
  type BindingStore,
  type DidChallenge,
  type DidChallengeVerifier,
  type TenantBinding
} from '@xnetjs/cloud/identity'
import {
  requiresMigration,
  resolveEntitlements,
  signEntitlements,
  withStoragePack,
  type PlanEntitlements,
  type PlanId
} from '@xnetjs/entitlements'
import { diagnosticsSecretFor } from './diagnostics'
import { fetchHubHealth } from './hub-status'
import { applyBillingEvent, type BillingEvent, type DunningState } from './reconcile/billing'
import { type TenantPage, type TenantRecord, type TenantStore } from './registry'
import { saga, sagaStep } from './saga'

/**
 * A dated promise about one tenant's encrypted R2 replica, placed before the
 * tenant record is deleted (exploration 0418). This is the receipt the
 * final-notice email quotes — see {@link ControlPlane.stageExportBundle} for
 * what it deliberately does *not* contain.
 */
export interface ExportHold {
  tenantId: string
  /** R2 object path the replica is retained at. */
  snapshotKey: string
  /** The data DID that can decrypt it — empty when the tenant never bound one. */
  did: string
  stagedAtMs: number
  /** After this, an R2 lifecycle rule on the held prefix may reclaim the object. */
  heldUntilMs: number
}

export interface ExportHoldStore {
  put(hold: ExportHold): Promise<void>
  get(tenantId: string): Promise<ExportHold | null>
  list(): Promise<ExportHold[]>
}

/** In-memory hold store — the dev/test default; production wires a durable one. */
export class MemoryExportHoldStore implements ExportHoldStore {
  private readonly holds = new Map<string, ExportHold>()
  async put(hold: ExportHold): Promise<void> {
    this.holds.set(hold.tenantId, { ...hold })
  }
  async get(tenantId: string): Promise<ExportHold | null> {
    const h = this.holds.get(tenantId)
    return h ? { ...h } : null
  }
  async list(): Promise<ExportHold[]> {
    return [...this.holds.values()].map((h) => ({ ...h }))
  }
}

export interface ControlPlaneDeps {
  tenants: TenantStore
  bindings: BindingStore
  provisioner: Provisioner
  verifyDid: DidChallengeVerifier
  /** Secret used to sign the HUB_PLAN entitlement token the hub verifies. */
  planSecret: string
  /** Immutable hub image tag new tenants are pinned to (never `latest`). */
  defaultTargetVersion: string
  /**
   * Manages each tenant's LiteLLM virtual key for managed AI. When set, an
   * `aiEnabled` tenant gets a budgeted key at provision time (exploration 0200).
   * Omit to skip AI-key provisioning (dev/self-host).
   */
  aiKeys?: VirtualKeyManager
  /**
   * When set, the control plane injects the managed-AI forwarder env into every
   * AI-enabled hub — `XNET_CLOUD_URL`, `XNET_CLOUD_INTERNAL_SECRET`, and
   * `XNET_TENANT_ID` — so the hub's `aiForwarderFeature` can proxy `/ai/chat` +
   * `/ai/models` to the control plane with that tenant's credential, with no
   * per-hub configuration (exploration 0208). Omit to leave hubs without managed AI.
   */
  managedAi?: { cloudUrl: string; internalSecret: string }
  /**
   * When set, every managed hub is provisioned with diagnostics escalation
   * pre-wired (exploration 0341): `XNET_DIAGNOSTICS_URL` pointing at this
   * control plane and a self-identifying per-tenant `XNET_DIAGNOSTICS_SECRET`
   * (`diagnosticsSecretFor`). The tenant still holds every escalation switch —
   * this only makes "Send to xNet" and the Lane-1 tee POSSIBLE with zero
   * per-hub config; both stay off/absent until the owner acts. The same secret
   * lets the dashboard read the hub's content-free `/diagnostics/summary`.
   */
  diagnostics?: { cloudUrl: string; masterSecret: string }
  /**
   * Records the retention holds `stageExportBundle` places on an R2 replica
   * before a tenant record is deleted (exploration 0418). Omit and the hold is
   * computed and returned — so the final-notice email still carries a truthful
   * date — but not persisted; wire a durable store in production so the window
   * survives a control-plane restart.
   */
  exportHolds?: ExportHoldStore
  /**
   * Reads a tenant hub's current on-disk usage in bytes (fresh, uncached), or
   * `null` when the hub can't be reached (cold/asleep/unreachable). Used by
   * {@link ControlPlane.changePlan} to refuse a downgrade that would shrink the
   * quota below the data already stored (exploration 0216). Defaults to a fresh
   * `GET /health` read of `record.hubUrl`; injectable for deterministic tests.
   */
  readUsageBytes?: (record: TenantRecord) => Promise<number | null>
  /** Injectable clock for deterministic tests. */
  nowMs?: () => number
}

/** Start of the UTC calendar month containing `nowMs` — the AI budget period. */
export function currentPeriodStartMs(nowMs: number): number {
  const d = new Date(nowMs)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
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
  /** Purchased storage add-on in GiB, applied over the plan base (0435). */
  storagePackGb?: number
  region?: string
}

/**
 * Result of a plan change:
 *  - `flipped` — applied live (in-tier entitlement flip), no data moved.
 *  - `migration-required` — crosses an isolation/region boundary; the migration
 *    engine moves the data (no live flip).
 *  - `over-quota` — a downgrade that would shrink the quota below what the tenant
 *    already stores (or whose usage couldn't be measured). Nothing changed; the
 *    caller must free space and retry, or wipe & start fresh (exploration 0216).
 */
export type PlanChangeResult =
  | { kind: 'flipped'; tenant: TenantRecord }
  | { kind: 'migration-required'; from: PlanEntitlements; to: PlanEntitlements }
  | {
      kind: 'over-quota'
      from: PlanEntitlements
      to: PlanEntitlements
      /** Measured on-disk usage in bytes, or `null` when the hub couldn't be reached. */
      usedBytes: number | null
      /** The target plan's storage quota in bytes. */
      targetQuotaBytes: number
      /** Bytes that must be freed to fit (`usedBytes - targetQuotaBytes`); `null` when usage is unknown. */
      reclaimBytes: number | null
    }

/**
 * The storage number a tenant is actually held to: the aggregate ceiling when
 * the plan publishes one, else the per-user quota (exploration 0435).
 *
 * Usage is probed from the hub's `/health`, which reports the whole data dir —
 * a tenant-wide number. Comparing that against a per-user quota is the mismatch
 * this resolves; on a flat plan with no aggregate ceiling the per-user quota is
 * still the only number there is.
 */
export function effectiveCeilingBytes(entitlements: PlanEntitlements): number {
  return entitlements.tenantQuotaBytes ?? entitlements.quotaBytes
}

/** Deterministic tenant id for a billing identity (so a replayed webhook is idempotent). */
export function tenantIdForBilling(billingUserId: string): string {
  return `t_${billingUserId.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/** R2 object path holding a tenant's SQLite snapshot (matches the Litestream replica path). */
export function snapshotKeyFor(tenantId: string): string {
  return `t/${tenantId}/db`
}

export class ControlPlane {
  constructor(private readonly deps: ControlPlaneDeps) {}

  private now(): number {
    return this.deps.nowMs ? this.deps.nowMs() : Date.now()
  }

  private hubEnv(tenantId: string, entitlements: PlanEntitlements): Record<string, string> {
    // The hub verifies this token locally and enforces the limits — no runtime
    // call back to the control plane (anti-lock-in invariant). It needs the same
    // signing secret to verify HUB_PLAN (the hub crashes on boot otherwise), so
    // every hub shares the control plane's XNET_PLAN_SECRET.
    const env: Record<string, string> = {
      HUB_PLAN: signEntitlements(entitlements, this.deps.planSecret),
      XNET_PLAN_SECRET: this.deps.planSecret
    }
    // Managed AI (0208): an AI-enabled hub forwards /ai/chat + /ai/models to the
    // control plane with this tenant's credential, so the client never holds a
    // key. Injected here = zero per-hub config. AI-off hubs get nothing extra, so
    // their `aiForwarderFeature` reports `managed:false` and the tier hides.
    if (this.deps.managedAi && entitlements.aiEnabled) {
      env.XNET_CLOUD_URL = this.deps.managedAi.cloudUrl
      env.XNET_CLOUD_INTERNAL_SECRET = this.deps.managedAi.internalSecret
      env.XNET_TENANT_ID = tenantId
    }
    // Diagnostics escalation wiring (0341): pre-configured, never pre-enabled —
    // the forwarder and tee both require the owner's explicit switches on top.
    if (this.deps.diagnostics) {
      env.XNET_DIAGNOSTICS_URL = this.deps.diagnostics.cloudUrl
      env.XNET_DIAGNOSTICS_SECRET = diagnosticsSecretFor(
        this.deps.diagnostics.masterSecret,
        tenantId
      )
    }
    return env
  }

  /**
   * Provision (or skip) a tenant's managed-AI virtual key. Returns the key ref to
   * store on the record, or undefined when AI is off or no key manager is wired.
   */
  private async provisionAiKey(
    tenantId: string,
    entitlements: PlanEntitlements
  ): Promise<VirtualKey | undefined> {
    if (!this.deps.aiKeys || !entitlements.aiEnabled || entitlements.aiMonthlyBudgetUsd <= 0) {
      return undefined
    }
    return this.deps.aiKeys.create({
      alias: tenantId,
      maxBudgetUsd: entitlements.aiMonthlyBudgetUsd,
      budgetDuration: '30d'
    })
  }

  /**
   * Record fields for a freshly-minted key. Stores the management handle separately
   * only when it differs from the Bearer secret (OpenRouter); for LiteLLM the key is
   * its own handle, so `aiKeyManageRef` stays unset.
   */
  private aiKeyFields(
    vk: VirtualKey | undefined
  ): Partial<Pick<TenantRecord, 'aiKeyRef' | 'aiKeyManageRef'>> {
    if (!vk) return {}
    return {
      aiKeyRef: vk.key,
      ...(vk.manageId && vk.manageId !== vk.key ? { aiKeyManageRef: vk.manageId } : {})
    }
  }

  /** The handle the key manager addresses for update/delete (hash for OpenRouter). */
  private aiManageHandle(record: TenantRecord): string | undefined {
    return record.aiKeyManageRef ?? record.aiKeyRef
  }

  /** Best-effort teardown of a tenant's virtual key (suspend/delete). */
  private async revokeAiKey(record: TenantRecord): Promise<void> {
    const handle = this.aiManageHandle(record)
    if (this.deps.aiKeys && handle) {
      await this.deps.aiKeys.remove(handle)
    }
  }

  /**
   * Provision a brand-new tenant: bind identities (dual proof), resolve + sign
   * entitlements, provision an isolated hub, and record it.
   *
   * Runs as a compensating {@link saga} (0411 G1): if a later step fails, the
   * hub and AI key created by earlier steps are torn down instead of being
   * orphaned. Without it, a key-manager outage after `provision` left a running,
   * billable Cloud Run service that no `TenantRecord` referenced — and the
   * retry provisioned a second one. Throws {@link SagaFailure} on failure;
   * `leakedResources` distinguishes a clean rollback from one that left
   * something behind.
   *
   * The identity binding is deliberately **not** compensated: `bindIdentities`
   * creates-or-replaces for the same billing user, so a leftover binding costs
   * nothing and a retry rebinds cleanly. Only steps holding external resources
   * need an undo.
   */
  async provisionTenant(args: ProvisionTenantArgs): Promise<TenantRecord> {
    const existing = await this.deps.tenants.get(args.tenantId)
    if (existing) throw new Error(`Tenant already exists: ${args.tenantId}`)

    const entitlements = this.entitlementsWithPack(
      args.plan,
      args.overrides ?? {},
      args.storagePackGb ?? 0
    )
    let binding: TenantBinding | undefined
    let handle: HubHandle | undefined
    let aiVk: VirtualKey | undefined
    let record: TenantRecord | undefined

    await saga([
      sagaStep<void>({
        name: 'bind-identities',
        run: async () => {
          binding = await bindIdentities(this.deps.bindings, this.deps.verifyDid, {
            tenantId: args.tenantId,
            billingUserId: args.billingUserId,
            challenge: args.challenge,
            nowMs: this.now()
          })
        }
      }),
      sagaStep<void>({
        name: 'provision-hub',
        run: async () => {
          handle = await this.deps.provisioner.provision({
            tenantId: args.tenantId,
            entitlements,
            targetVersion: this.deps.defaultTargetVersion,
            region: args.region,
            env: this.hubEnv(args.tenantId, entitlements)
          })
        },
        // Removes the Cloud Run service (the billable compute) and frees the
        // shard slot. The R2 replica is untouched by design — a brand-new
        // tenant has nothing there yet, and compensation must never delete data.
        compensate: async () => {
          if (handle) await this.deps.provisioner.destroy(handle.substrateRef)
        }
      }),
      sagaStep<void>({
        name: 'mint-ai-key',
        run: async () => {
          aiVk = await this.provisionAiKey(args.tenantId, entitlements)
        },
        compensate: async () => {
          const ref = aiVk?.manageId ?? aiVk?.key
          if (this.deps.aiKeys && ref) await this.deps.aiKeys.remove(ref)
        }
      }),
      sagaStep<void>({
        name: 'write-record',
        run: async () => {
          record = {
            tenantId: args.tenantId,
            plan: args.plan,
            entitlements,
            billingUserId: binding!.billingUserId,
            did: binding!.did,
            hubUrl: handle!.hubUrl,
            substrateRef: handle!.substrateRef,
            region: handle!.region,
            targetVersion: handle!.targetVersion,
            createdAt: this.now(),
            lastActiveMs: this.now(),
            dataTier: 'hot',
            ...(args.storagePackGb ? { storagePackGb: args.storagePackGb } : {}),
            ...this.aiKeyFields(aiVk)
          }
          await this.deps.tenants.put(record)
        },
        compensate: async () => {
          if (record) await this.deps.tenants.delete(record.tenantId)
        }
      })
    ])

    // `saga` resolves only when every step ran, so the record is always set.
    return record as TenantRecord
  }

  /**
   * Provision a hub for a paid billing identity whose DATA identity is not yet
   * known — the Stripe `checkout.session.completed` path. The hub comes up with an
   * empty `did`; the data DID is bound later, when the user opens the app and
   * approves the device-grant claim flow (exploration 0192). Idempotent: a replayed
   * webhook for the same billing user returns the existing record.
   */
  async provisionForBilling(args: {
    plan: PlanId
    billingUserId: string
    region?: string
    overrides?: Partial<Omit<PlanEntitlements, 'plan'>>
    /** Purchased storage add-on in GiB, applied over the plan base (0435). */
    storagePackGb?: number
  }): Promise<TenantRecord> {
    const tenantId = tenantIdForBilling(args.billingUserId)
    const existing = await this.deps.tenants.get(tenantId)
    if (existing) {
      // Re-subscribe / replay: reactivate a suspended hub, otherwise return as-is.
      if (existing.dataTier === 'cold') return this.reactivate(tenantId)
      if (existing.subscriptionStatus === 'canceled') {
        const reactivated: TenantRecord = { ...existing, subscriptionStatus: 'active' }
        await this.deps.tenants.put(reactivated)
        return reactivated
      }
      return existing
    }

    const entitlements = this.entitlementsWithPack(
      args.plan,
      args.overrides ?? {},
      args.storagePackGb ?? 0
    )
    let handle: HubHandle | undefined
    let aiVk: VirtualKey | undefined
    let record: TenantRecord | undefined

    // Same compensating saga as provisionTenant (0411 G1). This path is driven
    // by a Stripe webhook, so a half-provisioned failure is retried
    // automatically by Stripe — making the orphan it would otherwise leave
    // behind recur on every redelivery.
    await saga([
      sagaStep<void>({
        name: 'provision-hub',
        run: async () => {
          handle = await this.deps.provisioner.provision({
            tenantId,
            entitlements,
            targetVersion: this.deps.defaultTargetVersion,
            region: args.region,
            env: this.hubEnv(tenantId, entitlements)
          })
        },
        compensate: async () => {
          if (handle) await this.deps.provisioner.destroy(handle.substrateRef)
        }
      }),
      sagaStep<void>({
        name: 'mint-ai-key',
        run: async () => {
          aiVk = await this.provisionAiKey(tenantId, entitlements)
        },
        compensate: async () => {
          const ref = aiVk?.manageId ?? aiVk?.key
          if (this.deps.aiKeys && ref) await this.deps.aiKeys.remove(ref)
        }
      }),
      sagaStep<void>({
        name: 'write-record',
        run: async () => {
          record = {
            tenantId,
            plan: args.plan,
            entitlements,
            billingUserId: args.billingUserId,
            did: '', // bound later via the claim flow (exploration 0192)
            hubUrl: handle!.hubUrl,
            substrateRef: handle!.substrateRef,
            region: handle!.region,
            targetVersion: handle!.targetVersion,
            createdAt: this.now(),
            lastActiveMs: this.now(),
            dataTier: 'hot',
            subscriptionStatus: 'active',
            ...(args.storagePackGb ? { storagePackGb: args.storagePackGb } : {}),
            ...this.aiKeyFields(aiVk)
          }
          await this.deps.tenants.put(record)
        },
        compensate: async () => {
          if (record) await this.deps.tenants.delete(record.tenantId)
        }
      })
    ])

    return record as TenantRecord
  }

  /**
   * Find the tenant owned by a billing identity (dashboard + claim lookup).
   *
   * Every Stripe webhook lands here, so it goes through the store's lookup index
   * rather than scanning the fleet (exploration 0423).
   */
  async getTenantForBilling(billingUserId: string): Promise<TenantRecord | null> {
    return this.deps.tenants.getByBillingUser(billingUserId)
  }

  /**
   * Fold a verified Stripe dunning event into the tenant's non-payment lifecycle
   * state (exploration 0260): a failed payment opens grace, a paid invoice recovers,
   * a status change annotates. The decision is the pure `applyBillingEvent`; here we
   * load, apply, and persist. The timer-driven transitions (grace → read-only →
   * suspended → deletion) are advanced separately by a reconcile driver over
   * `reconcileBilling`. Returns null when no tenant owns that billing identity.
   */
  async recordBillingEvent(
    billingUserId: string,
    event: BillingEvent
  ): Promise<TenantRecord | null> {
    const tenant = await this.getTenantForBilling(billingUserId)
    if (!tenant) return null
    const billing = applyBillingEvent(tenant.billing, event, this.now())
    const updated: TenantRecord = { ...tenant, billing }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Bind a data DID to a billing identity's tenant — the second half of the
   * device-grant "claim your hub" flow (exploration 0192). Dual proof: the
   * billing session was proven when the user approved the device code; the DID is
   * proven now by the signed challenge. Stamps the DID onto the tenant record.
   *
   * When the binding is awaiting a rebind after `recoverAccount` (exploration 0243),
   * we route through `completeRebind` so its `rebindPending` guard is honored rather
   * than silently overwriting via the ordinary bind path.
   */
  async bindDataIdentity(args: {
    billingUserId: string
    challenge: DidChallenge
  }): Promise<TenantRecord> {
    const tenant = await this.getTenantForBilling(args.billingUserId)
    if (!tenant) throw new Error(`No tenant for billing user: ${args.billingUserId}`)
    const existing = await this.deps.bindings.get(tenant.tenantId)
    const bind = existing?.rebindPending ? completeRebind : bindIdentities
    await bind(this.deps.bindings, this.deps.verifyDid, {
      tenantId: tenant.tenantId,
      billingUserId: args.billingUserId,
      challenge: args.challenge,
      nowMs: this.now()
    })
    const updated: TenantRecord = { ...tenant, did: args.challenge.did }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Persist a tenant's dunning state (exploration 0418). The state machine lives
   * in `reconcile/billing.ts`; this is only the write, so the driver never
   * open-codes a `tenants.put` and cannot forget a field.
   */
  async setBillingState(tenantId: string, billing: DunningState): Promise<TenantRecord | null> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) return null
    const updated: TenantRecord = { ...record, billing }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Flip a tenant's hub into (or out of) billing read-only — the `read_only` rung
   * of the non-payment lifecycle (exploration 0418).
   *
   * Re-signs the entitlement with `writesEnabled` and pushes it via `setEnv`, the
   * same live-flip path `changePlan` uses for a quota change: no data moves, no
   * machine is recreated, and the hub picks the new token up on its next boot or
   * env refresh. A cold tenant (no live machine) records the intent on its
   * entitlements so the value is already correct when `reactivate` provisions it.
   */
  async setWritesEnabled(tenantId: string, writesEnabled: boolean): Promise<TenantRecord | null> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) return null
    if (record.entitlements.writesEnabled === writesEnabled) return record
    const next: PlanEntitlements = { ...record.entitlements, writesEnabled }
    // No live machine to push env to — persist the intent; `reactivate` reads it.
    if (!record.substrateRef) {
      const cold: TenantRecord = { ...record, entitlements: next }
      await this.deps.tenants.put(cold)
      return cold
    }
    const handle = await this.deps.provisioner.setEnv(
      record.substrateRef,
      this.hubEnv(record.tenantId, next)
    )
    const updated: TenantRecord = {
      ...record,
      entitlements: next,
      hubUrl: handle.hubUrl,
      region: handle.region,
      targetVersion: handle.targetVersion
    }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Return a tenant to full service after payment recovers (exploration 0418):
   * restore writes, and bring a cold hub back from its R2 replica. Ordered so a
   * cold tenant is reactivated with `writesEnabled: true` already stamped on its
   * entitlements — otherwise the fresh hub would boot read-only and need a second
   * env push to become usable.
   */
  async reactivateTenant(tenantId: string): Promise<TenantRecord | null> {
    const enabled = await this.setWritesEnabled(tenantId, true)
    if (!enabled) return null
    if (enabled.dataTier === 'cold') return this.reactivate(tenantId)
    return enabled
  }

  /**
   * Suspend a tenant on subscription cancellation: tear down the live machine but
   * keep the record and the R2 replica so a re-subscribe can reactivate it. The
   * encrypted data is retained until the user explicitly deletes it.
   */
  async suspendTenant(tenantId: string): Promise<TenantRecord | null> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) return null
    if (record.substrateRef) await this.deps.provisioner.destroy(record.substrateRef)
    const updated: TenantRecord = {
      ...record,
      subscriptionStatus: 'canceled',
      dataTier: 'cold',
      substrateRef: '',
      hubUrl: ''
    }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Put a retention hold on a tenant's R2 replica before its record is deleted —
   * the Charter §6 vanish test (exploration 0418): a customer must be able to
   * leave with their data, including when they left by not paying.
   *
   * **What this is not.** The control plane cannot build a decrypted `.xnetpack`
   * for the customer: the hub's `/export/changes` requires a UCAN signed by their
   * data DID, and we hold no such key — by design. Anything that *could* produce
   * a readable bundle here would mean we could read their data, which is the
   * property the whole system exists to avoid.
   *
   * **What it is.** A dated, recorded promise about the encrypted replica: the
   * object stays at {@link snapshotKeyFor} until `heldUntilMs`, and the receipt is
   * what the final-notice email points the customer at. Deleting a tenant already
   * leaves R2 untouched — this makes that deliberate and legible instead of
   * incidental, so the retention window is a fact somebody can check rather than
   * an accident of how `deleteTenant` happens to be written.
   *
   * The bucket-side expiry (an R2 lifecycle rule on the held prefix) is an
   * operator task; this records the intent the rule must honor.
   */
  async stageExportBundle(
    tenantId: string,
    holdMs = 30 * 24 * 60 * 60 * 1000
  ): Promise<ExportHold | null> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) return null
    const hold: ExportHold = {
      tenantId,
      snapshotKey: this.snapshotKey(tenantId),
      did: record.did,
      heldUntilMs: this.now() + holdMs,
      stagedAtMs: this.now()
    }
    await this.deps.exportHolds?.put(hold)
    return hold
  }

  /**
   * Destroy a tenant's hub and forget it — the "delete my data" path. Irreversible:
   * the encrypted DB/replica is the user's, and the company cannot recover it.
   */
  async deleteTenant(tenantId: string): Promise<{ deleted: boolean }> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) return { deleted: false }
    if (record.substrateRef) await this.deps.provisioner.destroy(record.substrateRef)
    await this.revokeAiKey(record)
    await this.deps.tenants.delete(tenantId)
    return { deleted: true }
  }

  /**
   * Resolve entitlements for `plan` with any per-tenant overrides, then apply
   * the purchased storage pack on top (exploration 0435).
   *
   * Single funnel on purpose: every provisioning and plan-change path goes
   * through here, so there is no call site that can forget the pack.
   */
  private entitlementsWithPack(
    plan: PlanId,
    overrides: Partial<Omit<PlanEntitlements, 'plan'>>,
    packGb: number
  ): PlanEntitlements {
    const resolved = resolveEntitlements(plan, overrides)
    return packGb > 0 ? withStoragePack(resolved, packGb) : resolved
  }

  /**
   * Set (or clear) a tenant's purchased storage add-on, keeping the plan and
   * everything else untouched — the "more room, same plan" path (0435).
   *
   * Delegates to {@link changePlan} rather than reimplementing the flip, so a
   * pack *reduction* inherits the over-quota guard verbatim: shrinking under
   * live data returns `over-quota` and changes nothing, exactly as a plan
   * downgrade does (0216). `packGb: 0` removes the pack.
   */
  async setStoragePack(
    tenantId: string,
    packGb: number,
    opts: { dryRun?: boolean } = {}
  ): Promise<PlanChangeResult> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)
    return this.changePlan(tenantId, record.plan, {}, { storagePackGb: packGb, ...opts })
  }

  /**
   * Change a tenant's plan or capacity. A change that stays within the same
   * isolation tier (e.g. more storage/seats/concurrency) is a live entitlement
   * flip — `provisioner.setEnv` with a freshly-signed token, no data movement.
   * Crossing an isolation boundary returns `migration-required` for the migration
   * engine to handle (exploration 0175).
   *
   * `opts.dryRun` evaluates the guards and returns the result WITHOUT flipping
   * anything — no `setEnv`, no AI-key reconcile, no record write.
   */
  async changePlan(
    tenantId: string,
    plan: PlanId,
    overrides: Partial<Omit<PlanEntitlements, 'plan'>> = {},
    opts: { storagePackGb?: number; dryRun?: boolean } = {}
  ): Promise<PlanChangeResult> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)

    // The pack carries across a plan change unless this call is explicitly
    // changing it. Reading it off the record HERE — rather than expecting every
    // caller to pass it — is the fix for the self-serve route that used to drop
    // a purchased pack on every plan change (exploration 0435, Gap 1).
    const packGb = opts.storagePackGb ?? record.storagePackGb ?? 0
    const next = this.entitlementsWithPack(plan, overrides, packGb)
    if (requiresMigration(record.entitlements, next)) {
      return { kind: 'migration-required', from: record.entitlements, to: next }
    }

    // Guard a capacity REDUCTION against what's already stored. An upgrade (more
    // space) is always a clean flip; a downgrade must never silently shrink the
    // quota under live data. Block when we can confirm they're over — or when we
    // can't measure at all (cold/asleep hub) — so the caller can free space and
    // retry, or wipe & start fresh (exploration 0216).
    //
    // Measured against the TENANT ceiling where one exists (0435): the probe
    // reads the hub's whole data dir, so comparing it to a per-user quota would
    // block a multi-seat tenant that fits perfectly well.
    const targetCeiling = effectiveCeilingBytes(next)
    if (targetCeiling < effectiveCeilingBytes(record.entitlements)) {
      const usedBytes = await this.currentUsageBytes(record)
      if (usedBytes === null || usedBytes > targetCeiling) {
        return {
          kind: 'over-quota',
          from: record.entitlements,
          to: next,
          usedBytes,
          targetQuotaBytes: targetCeiling,
          reclaimBytes: usedBytes === null ? null : usedBytes - targetCeiling
        }
      }
    }

    // A dry run has now answered the only question a caller can ask ahead of
    // time — "would this be refused?" — without touching the hub or the record.
    // The storage route uses it to check a shrink BEFORE changing the bill.
    if (opts.dryRun) {
      return { kind: 'flipped', tenant: { ...record, plan, entitlements: next } }
    }

    const handle = await this.deps.provisioner.setEnv(
      record.substrateRef,
      this.hubEnv(record.tenantId, next)
    )
    const aiPatch = await this.reconcileAiKey(record, next)
    const updated: TenantRecord = {
      ...record,
      ...(packGb > 0 ? { storagePackGb: packGb } : { storagePackGb: undefined }),
      plan,
      entitlements: next,
      hubUrl: handle.hubUrl,
      region: handle.region,
      targetVersion: handle.targetVersion,
      ...(aiPatch ?? {})
    }
    await this.deps.tenants.put(updated)
    return { kind: 'flipped', tenant: updated }
  }

  /**
   * Read a tenant hub's current on-disk usage in bytes, or `null` when it can't
   * be measured (no live hub, or the probe fails/times out). Prefers the injected
   * `readUsageBytes` (tests); otherwise a fresh, uncached `GET /health` read of
   * the hub. A cold/suspended tenant (no `hubUrl`) reads as `null`.
   */
  private async currentUsageBytes(record: TenantRecord): Promise<number | null> {
    if (this.deps.readUsageBytes) return this.deps.readUsageBytes(record)
    if (!record.hubUrl || record.dataTier !== 'hot') return null
    const health = await fetchHubHealth(record.hubUrl)
    const used = health?.storage?.usedBytes
    return typeof used === 'number' && Number.isFinite(used) ? used : null
  }

  /**
   * Wipe a tenant's data and re-provision an EMPTY hub at `plan` — the "delete my
   * database and start fresh" escape hatch for a downgrade whose data exceeds the
   * smaller plan's quota (the alternative to freeing space). Destroys the live hub
   * and boots a brand-new one that does NOT restore from R2, so it comes up empty.
   * The billing + data identities are preserved; the old encrypted data is gone.
   * Irreversible — gate it behind an explicit user confirmation (exploration 0216).
   */
  async wipeAndChangePlan(
    tenantId: string,
    plan: PlanId,
    overrides: Partial<Omit<PlanEntitlements, 'plan'>> = {}
  ): Promise<TenantRecord> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)
    // The pack survives a wipe: they still paid for the space, they just have
    // no data in it any more (0435).
    const next = this.entitlementsWithPack(plan, overrides, record.storagePackGb ?? 0)

    if (record.substrateRef) await this.deps.provisioner.destroy(record.substrateRef)
    const handle = await this.deps.provisioner.provision({
      tenantId,
      entitlements: next,
      targetVersion: record.targetVersion,
      region: record.region,
      env: this.hubEnv(tenantId, next)
      // No `restoreFromR2` → the new hub boots EMPTY (this is the wipe).
    })
    const aiPatch = await this.reconcileAiKey(record, next)
    const updated: TenantRecord = {
      ...record,
      plan,
      entitlements: next,
      hubUrl: handle.hubUrl,
      substrateRef: handle.substrateRef,
      region: handle.region,
      targetVersion: handle.targetVersion,
      dataTier: 'hot',
      lastActiveMs: this.now(),
      ...(aiPatch ?? {})
    }
    await this.deps.tenants.put(updated)
    return updated
  }

  /**
   * Reconcile a tenant's AI key against new entitlements: update the budget on an
   * existing key, mint one when AI is newly enabled, or revoke when disabled. Returns
   * a record patch ({@link TenantRecord.aiKeyRef}/`aiKeyManageRef`) to apply, or
   * `undefined` to leave the key fields unchanged.
   */
  private async reconcileAiKey(
    record: TenantRecord,
    next: PlanEntitlements
  ): Promise<Partial<Pick<TenantRecord, 'aiKeyRef' | 'aiKeyManageRef'>> | undefined> {
    if (!this.deps.aiKeys) return undefined
    const wantsAi = next.aiEnabled && next.aiMonthlyBudgetUsd > 0
    const handle = this.aiManageHandle(record)
    if (wantsAi && record.aiKeyRef && handle) {
      await this.deps.aiKeys.update(handle, { maxBudgetUsd: next.aiMonthlyBudgetUsd })
      return undefined // key unchanged
    }
    if (wantsAi && !record.aiKeyRef) {
      return this.aiKeyFields(await this.provisionAiKey(record.tenantId, next))
    }
    if (!wantsAi && record.aiKeyRef && handle) {
      await this.deps.aiKeys.remove(handle)
      return { aiKeyRef: undefined, aiKeyManageRef: undefined } // signal removal
    }
    return undefined
  }

  /**
   * Set a tenant's self-serve AI budget: a hard cap (USD), clamped to ≤ the plan's
   * `aiMonthlyBudgetUsd`, enforced over a window (calendar month / week / rolling N
   * days). `undefined` clears it (back to the full plan cap on the calendar month).
   *
   * The ledger window is the precise, instant control; we also best-effort align
   * the OpenRouter key's `limit_reset` to the window so the provider-side backstop
   * stays consistent — its `limit` stays at the plan cap, never the tighter user
   * cap, so the seatbelt protects xNet without surprising the user (exploration 0244).
   */
  async setAiBudget(
    tenantId: string,
    budget: { capUsd: number; window: BudgetWindow } | undefined
  ): Promise<TenantRecord> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)
    const planCap = record.entitlements.aiMonthlyBudgetUsd

    let aiBudget: TenantRecord['aiBudget']
    if (budget !== undefined) {
      if (!Number.isFinite(budget.capUsd) || budget.capUsd < 0) {
        throw new Error(`Invalid AI cap: ${budget.capUsd}`)
      }
      aiBudget = { capUsd: Math.min(budget.capUsd, planCap), window: budget.window }
    }

    // Clearing aiBudget also clears the legacy aiCapUsd so the two never disagree.
    const updated: TenantRecord = { ...record, aiBudget, aiCapUsd: undefined }
    await this.deps.tenants.put(updated)

    // Align the provider-side reset cadence (cap stays at the plan ceiling).
    const handle = this.aiManageHandle(record)
    if (budget !== undefined && this.deps.aiKeys && handle) {
      await this.deps.aiKeys.update(handle, {
        maxBudgetUsd: planCap,
        limitReset: keyResetFor(budget.window)
      })
    }
    return updated
  }

  /**
   * @deprecated Back-compat shim for {@link setAiBudget}: sets a monthly-window cap.
   */
  async setAiCap(tenantId: string, capUsd: number | undefined): Promise<TenantRecord> {
    return this.setAiBudget(
      tenantId,
      capUsd === undefined ? undefined : { capUsd, window: DEFAULT_BUDGET_WINDOW }
    )
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

  /** The substrate provisioner — exposed for the nightly restore drill (0288/0193). */
  get provisioner(): Provisioner {
    return this.deps.provisioner
  }

  /** Every tenant the control plane knows about (fleet observability + rollouts). */
  listTenants(): Promise<TenantRecord[]> {
    return this.deps.tenants.list()
  }

  /** One page of the fleet in `tenantId` order (exploration 0423). */
  pageTenants(cursor: string | null, limit: number): Promise<TenantPage> {
    return this.deps.tenants.page(cursor, limit)
  }

  /**
   * Walk the whole fleet a page at a time, applying `visit` to each tenant.
   *
   * This is the shape every periodic sweep wants: a tick never materialises the
   * whole fleet, and because `visit` is per-tenant the loop can later be split
   * across workers by `hash(tenantId) % W` without restructuring the callers
   * (exploration 0423). `visit` is called in `tenantId` order; a page that comes
   * back empty with a cursor still advances, so a deleted tail cannot loop.
   */
  async forEachTenant(
    visit: (tenant: TenantRecord) => Promise<void>,
    opts?: { pageSize?: number }
  ): Promise<number> {
    const pageSize = opts?.pageSize ?? 100
    let cursor: string | null = null
    let seen = 0
    for (;;) {
      const page: TenantPage = await this.deps.tenants.page(cursor, pageSize)
      for (const tenant of page.items) {
        seen += 1
        await visit(tenant)
      }
      if (page.next === null) return seen
      cursor = page.next
    }
  }

  /** R2 object path holding a tenant's SQLite snapshot (matches the Litestream replica path). */
  private snapshotKey(tenantId: string): string {
    return snapshotKeyFor(tenantId)
  }

  /** Record activity so the cold-demotion clock resets (exploration 0178). */
  async markActive(tenantId: string): Promise<void> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) return
    await this.deps.tenants.put({ ...record, lastActiveMs: this.now() })
  }

  /**
   * Demote an idle hot tenant to COLD: confirm its DB is fully synced to R2, then
   * destroy the volume + machine. The DB lives only in R2 afterward (~$0.015/GB),
   * restored on reactivation. No-op if not hot or not yet idle long enough.
   */
  async demoteIfCold(
    tenantId: string,
    opts: { coldAfterMs: number; assertSynced?: (tenantId: string) => Promise<boolean> }
  ): Promise<{ demoted: boolean }> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)
    if (record.dataTier !== 'hot') return { demoted: false }
    if (this.now() - record.lastActiveMs < opts.coldAfterMs) return { demoted: false }

    // Never destroy a live DB until its last write is durable in R2 (the demotion gate).
    if (opts.assertSynced && !(await opts.assertSynced(tenantId))) {
      return { demoted: false }
    }

    if (record.substrateRef) await this.deps.provisioner.destroy(record.substrateRef)
    await this.deps.tenants.put({ ...record, dataTier: 'cold', substrateRef: '', hubUrl: '' })
    return { demoted: true }
  }

  /**
   * Reactivate a COLD tenant: provision a fresh hub that restores its DB from R2 on
   * boot (Litestream). The control plane is the single-writer fence — a cold tenant
   * has no live machine, so there is nothing to race.
   */
  async reactivate(tenantId: string): Promise<TenantRecord> {
    const record = await this.deps.tenants.get(tenantId)
    if (!record) throw new Error(`Unknown tenant: ${tenantId}`)
    if (record.dataTier === 'hot') return record // already live

    const handle = await this.deps.provisioner.provision({
      tenantId,
      entitlements: record.entitlements,
      targetVersion: record.targetVersion,
      region: record.region,
      env: this.hubEnv(tenantId, record.entitlements),
      restoreFromR2: this.snapshotKey(tenantId)
    })
    const updated: TenantRecord = {
      ...record,
      dataTier: 'hot',
      hubUrl: handle.hubUrl,
      substrateRef: handle.substrateRef,
      lastActiveMs: this.now()
    }
    await this.deps.tenants.put(updated)
    return updated
  }
}
