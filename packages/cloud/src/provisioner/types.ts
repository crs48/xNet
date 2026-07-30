/**
 * @xnetjs/cloud/provisioner — substrate-agnostic provisioning contract.
 *
 * The control plane (`apps/cloud`) drives a `Provisioner` to create, upgrade,
 * sleep, and destroy one isolated hub per tenant. Adapters implement this against
 * different substrates (Cloud Run + Litestream→R2, Fargate, in-memory) so the product
 * is never hostage to one vendor's Terms of Service (Railway/Fly prohibit reselling
 * compute — see exploration 0175).
 */

import type { PlanEntitlements } from '@xnetjs/entitlements'

/** What to provision for one tenant. */
export interface ProvisionSpec {
  /** Stable tenant id (also the per-tenant resource name). */
  tenantId: string
  /** Resolved plan limits — drive isolation tier, quota, concurrency. */
  entitlements: PlanEntitlements
  /**
   * Immutable, content-addressed hub image tag. NEVER `latest`: staged upgrades
   * (exploration 0174) pin a per-tenant target version.
   */
  targetVersion: string
  /** Region to place the tenant in (residency); adapter default if omitted. */
  region?: string
  /** Extra env injected into the hub container (e.g. HUB_PLAN, R2_*). */
  env?: Record<string, string>
  /**
   * R2 object path to restore the SQLite DB from before boot (Litestream, Model B —
   * exploration 0178). Set when reactivating a cold tenant whose DB lives only in R2.
   */
  restoreFromR2?: string
  /**
   * Sidecar containers placed NEXT TO the hub (0383 W5) — the PDS pattern
   * (0365: the official `@atproto/pds` image, never a hub role). Adapters that
   * cannot host sidecars yet must throw rather than silently drop them; the
   * self-host equivalent is `deploy/hub-with-pds/docker-compose.yml`.
   */
  sidecars?: Array<{
    name: string
    /** Image reference — pin by digest in production. */
    image: string
    env?: Record<string, string>
  }>
}

/** A handle to a provisioned hub. `substrateRef` is opaque to callers. */
export interface HubHandle {
  tenantId: string
  /** Reachable hub URL. */
  hubUrl: string
  /** Opaque adapter-specific reference used for upgrade/sleep/destroy. */
  substrateRef: string
  region: string
  targetVersion: string
  /** Lifecycle state, as last observed by the adapter. */
  state: HubState
}

export type HubState = 'provisioning' | 'running' | 'sleeping' | 'destroyed'

/**
 * Lifecycle for one tenant's hub. Every adapter implements the same surface; the
 * control plane is written once against this interface.
 */
export interface Provisioner {
  /** Human/telemetry label for the substrate (e.g. `cloud-run-litestream`). */
  readonly substrate: string

  /** Create + boot an isolated hub for a tenant. */
  provision(spec: ProvisionSpec): Promise<HubHandle>

  /** Roll a hub to a new immutable image (staged-rollout step). */
  upgrade(substrateRef: string, targetVersion: string): Promise<HubHandle>

  /** Live entitlement flip — update env without moving data (e.g. raise quota). */
  setEnv(substrateRef: string, env: Record<string, string>): Promise<HubHandle>

  /** Scale to zero / suspend when idle (cost control). */
  sleep(substrateRef: string): Promise<HubHandle>

  /** Tear down all of a tenant's resources. */
  destroy(substrateRef: string): Promise<void>

  /** Look up a handle, or null if it no longer exists. */
  get(substrateRef: string): Promise<HubHandle | null>
}

/** Thrown by adapter skeletons whose substrate wiring is not built yet. */
export class NotImplementedError extends Error {
  constructor(substrate: string, operation: string) {
    super(`${substrate}: ${operation}() is not implemented yet`)
    this.name = 'NotImplementedError'
  }
}

/** Thrown when a `substrateRef` is unknown to a provisioner. */
export class UnknownTenantError extends Error {
  constructor(substrateRef: string) {
    super(`No provisioned hub for ref: ${substrateRef}`)
    this.name = 'UnknownTenantError'
  }
}
