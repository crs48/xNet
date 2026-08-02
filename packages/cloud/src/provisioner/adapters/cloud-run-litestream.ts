/**
 * @xnetjs/cloud/provisioner — Cloud Run + Litestream→R2 adapter.
 *
 * The managed substrate xNet Cloud targets (explorations 0175 + 0178): GCP Cloud
 * Run for scale-to-zero compute, `better-sqlite3` with **Litestream** streaming the
 * WAL to Cloudflare R2 (NO libSQL/Turso — rejected in 0178). One Cloud Run service
 * per tenant, sharded across projects under the 1,000-service/project cap.
 *
 * The adapter talks to a narrow {@link CloudRunClient} port — not the GCP SDK
 * directly — so it is fully unit-testable with {@link FakeCloudRunClient} and the
 * real `@google-cloud/run` client lives in the control plane (`apps/cloud`),
 * keeping this package free of the heavy SDK (exploration 0196).
 */

import { requiresWarmInstance } from '@xnetjs/entitlements'
import { ShardAllocator, placementFromSubstrateRef, type ShardPlacement } from '../sharding'
import { tenantStoragePrefix } from '../storage-prefix'
import { UnknownTenantError, type HubHandle, type ProvisionSpec, type Provisioner } from '../types'

export interface CloudRunLitestreamConfig {
  /** GCP project prefix for sharded projects (e.g. `xnet-cloud` → `xnet-cloud-0`). */
  projectPrefix: string
  /** GCP region for Cloud Run services (e.g. `us-central1`). */
  region: string
  /** Container image repository, e.g. `us-docker.pkg.dev/xnet-cloud-0/hub`. */
  imageRepository: string
  /** Cloudflare R2 bucket holding per-tenant SQLite WAL replicas. */
  r2Bucket: string
  /** R2 S3 endpoint, e.g. `https://<acct>.r2.cloudflarestorage.com`. */
  r2Endpoint: string
  /**
   * Fleet-wide R2 access key id, used only when {@link r2Credentials} is absent.
   *
   * A bucket-wide credential in every tenant container means any hub can read
   * every other tenant's replica under `t/<other>/db` — the prefix is a naming
   * convention, not a boundary (exploration 0436 G1). Configure
   * {@link r2Credentials} in production; these two stay as the dev/self-host
   * fallback where there is exactly one tenant.
   */
  r2AccessKeyId: string
  /** Fleet-wide R2 secret access key; see {@link r2AccessKeyId}. */
  r2SecretAccessKey: string
  /**
   * Mints credentials scoped to ONE tenant's `t/<tenantId>/` prefix.
   *
   * Cloudflare R2 supports exactly this: `POST
   * /accounts/{id}/r2/temp-access-credentials` returns S3 credentials bound to a
   * bucket, a permission set and a list of prefixes. When supplied, the returned
   * credentials are what land in the hub's env, so a leaked container yields one
   * tenant's bytes rather than the fleet's.
   *
   * Called on every provision AND every `setEnv`, so short-lived credentials are
   * refreshed on the path a plan change already takes.
   */
  r2Credentials?: (tenantId: string) => Promise<TenantR2Credentials>
  /** Service account email each tenant's Cloud Run service runs as (least privilege). */
  serviceAccountFor?: (tenantId: string) => string
  /** Override the sharding cap (default 800, headroom under the 1,000 hard cap). */
  servicesPerProject?: number
}

/** S3-shaped credentials scoped to a single tenant's R2 prefix. */
export interface TenantR2Credentials {
  accessKeyId: string
  secretAccessKey: string
  /** Present for temporary credentials; absent for a long-lived scoped token. */
  sessionToken?: string
}

/** Location of one tenant's Cloud Run service. */
export interface CloudRunRef {
  project: string
  region: string
  service: string
}

/** Desired state of a tenant's Cloud Run service. */
export interface CloudRunUpsert extends CloudRunRef {
  image: string
  env: Record<string, string>
  minInstances: number
  /**
   * Service account the revision runs as. Omitted → Cloud Run falls back to the
   * project's DEFAULT COMPUTE service account, which carries broad project-wide
   * permissions shared by every tenant service in that shard. Setting a
   * per-tenant account is the difference between "one hub was compromised" and
   * "one shard project was compromised" (exploration 0436).
   */
  serviceAccount?: string
}

/** Observed state of a service. */
export interface CloudRunService {
  uri: string
  image: string
  env: Record<string, string>
  minInstances: number
  serviceAccount?: string
}

/**
 * The narrow Cloud Run control surface the adapter depends on. The real
 * implementation wraps `@google-cloud/run` (in `apps/cloud`); tests use
 * {@link FakeCloudRunClient}.
 */
export interface CloudRunClient {
  create(args: CloudRunUpsert): Promise<CloudRunService>
  update(args: CloudRunUpsert): Promise<CloudRunService>
  get(ref: CloudRunRef): Promise<CloudRunService | null>
  delete(ref: CloudRunRef): Promise<void>
}

/** Cloud Run service ids must be `^[a-z]([-a-z0-9]*[a-z0-9])?$`, ≤63 chars. */
export function serviceIdForTenant(tenantId: string): string {
  let s = tenantId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
  if (!/^[a-z]/.test(s)) s = `t-${s}`
  return s.slice(0, 63).replace(/-+$/, '')
}

function refString(ref: CloudRunRef): string {
  return `${ref.project}/${ref.region}/${ref.service}`
}

function parseRef(substrateRef: string): CloudRunRef {
  const [project, region, service, ...rest] = substrateRef.split('/')
  if (!project || !region || !service || rest.length > 0) {
    throw new Error(`Malformed substrateRef: ${substrateRef}`)
  }
  return { project, region, service }
}

/**
 * Recover a tenant id from a running service's env.
 *
 * `setEnv` is handed a `substrateRef`, and `serviceIdForTenant` is a lossy
 * transform (lowercased, `_`→`-`), so the service name cannot be reversed. The
 * Litestream path is written once at provision time and never changes, which
 * makes it the one authoritative record of the tenant a running service belongs
 * to. Returns null rather than a guess when the shape is unfamiliar — a wrong
 * tenant id here would mint a credential for the wrong prefix.
 */
export function tenantIdFromEnv(env: Record<string, string>): string | null {
  const explicit = env.XNET_TENANT_ID
  if (explicit) return explicit
  const match = /^t\/([^/]+)\/db$/.exec(env.LITESTREAM_PATH ?? '')
  return match?.[1] ?? null
}

/** Extract the image tag (targetVersion) from `repo:tag`. */
function tagOf(image: string): string {
  const i = image.lastIndexOf(':')
  return i >= 0 ? image.slice(i + 1) : image
}

export class CloudRunLitestreamProvisioner implements Provisioner {
  readonly substrate = 'cloud-run-litestream'
  protected readonly allocator: ShardAllocator

  constructor(
    protected readonly config: CloudRunLitestreamConfig,
    private readonly client: CloudRunClient
  ) {
    this.allocator = new ShardAllocator({
      projectPrefix: config.projectPrefix,
      ...(config.servicesPerProject ? { servicesPerProject: config.servicesPerProject } : {})
    })
  }

  /**
   * The R2 credentials one tenant's hub is given.
   *
   * With `r2Credentials` configured these are scoped to `t/<tenantId>/`, so the
   * env of a compromised container reaches that tenant's bytes and no further.
   * Without it we fall back to the fleet-wide pair — correct for self-host and
   * dev (one tenant), a shared-blast-radius hazard in a managed fleet, which is
   * why `cloudRunProvisionerFromEnv` warns when it takes the fallback.
   */
  private async r2Env(tenantId: string): Promise<Record<string, string>> {
    const creds = this.config.r2Credentials
      ? await this.config.r2Credentials(tenantId)
      : {
          accessKeyId: this.config.r2AccessKeyId,
          secretAccessKey: this.config.r2SecretAccessKey
        }
    return {
      R2_BUCKET: this.config.r2Bucket,
      R2_ENDPOINT: this.config.r2Endpoint,
      R2_ACCESS_KEY_ID: creds.accessKeyId,
      R2_SECRET_ACCESS_KEY: creds.secretAccessKey,
      ...(creds.sessionToken ? { R2_SESSION_TOKEN: creds.sessionToken } : {})
    }
  }

  /** Env every managed hub gets: the caller's plan env + Litestream/R2 wiring. */
  private async hubEnv(spec: ProvisionSpec): Promise<Record<string, string>> {
    return {
      ...spec.env,
      LITESTREAM: '1',
      // Per-tenant replica path the hub entrypoint renders into its Litestream
      // config. Stable across (re)provisions so a reactivated hub restores from
      // the same R2 prefix. (exploration 0178/0205.)
      LITESTREAM_PATH: `${tenantStoragePrefix(spec.tenantId)}db`,
      ...(await this.r2Env(spec.tenantId)),
      ...(spec.restoreFromR2 ? { LITESTREAM_RESTORE: spec.restoreFromR2 } : {})
    }
  }

  /**
   * Where a tenant's Cloud Run service goes.
   *
   * `entitlements.residency` is the enterprise region-pin, and it MUST be
   * consulted here: the dev `MemoryProvisioner` already honoured it while this
   * adapter silently placed every tenant in `config.region`, so a residency
   * guarantee looked identical to no guarantee at all (exploration 0436 G8).
   * An explicit `spec.region` still wins — that is the operator override.
   */
  private regionFor(spec: ProvisionSpec): string {
    return spec.region ?? spec.entitlements.residency ?? this.config.region
  }

  private minInstances(spec: ProvisionSpec): number {
    // A plan that publishes an availability objective keeps one instance hot;
    // everyone else scales to zero. Derived from the SLA, NOT the isolation tier:
    // the tier check gave the warm instance to `dedicated-warm` (best-effort, so
    // it can never burn an error budget) and withheld it from `dedicated-project`
    // and `region-pinned`, which sell 99.9% and 99.95% (exploration 0433 D1).
    return requiresWarmInstance(spec.entitlements) ? 1 : 0
  }

  private image(targetVersion: string): string {
    return `${this.config.imageRepository}:${targetVersion}`
  }

  private handle(ref: CloudRunRef, targetVersion: string, svc: CloudRunService): HubHandle {
    return {
      tenantId: ref.service,
      hubUrl: svc.uri,
      substrateRef: refString(ref),
      region: ref.region,
      targetVersion,
      // Scale-to-zero services are still 'running' (deployed + reachable), just idle.
      state: 'running'
    }
  }

  async provision(spec: ProvisionSpec): Promise<HubHandle> {
    if (spec.sidecars?.length) {
      // Cloud Run supports multi-container services, but this adapter does not
      // wire them yet — refuse loudly instead of silently dropping a PDS.
      throw new Error('cloud-run-litestream: sidecars not yet supported (0383 W5)')
    }
    const region = this.regionFor(spec)
    const project = this.allocator.allocate(region)
    const ref: CloudRunRef = { project, region, service: serviceIdForTenant(spec.tenantId) }
    const svc = await this.client.create({
      ...ref,
      image: this.image(spec.targetVersion),
      env: await this.hubEnv(spec),
      minInstances: this.minInstances(spec),
      ...(this.config.serviceAccountFor
        ? { serviceAccount: this.config.serviceAccountFor(spec.tenantId) }
        : {})
    })
    return { ...this.handle(ref, spec.targetVersion, svc), tenantId: spec.tenantId }
  }

  async upgrade(substrateRef: string, targetVersion: string): Promise<HubHandle> {
    const ref = parseRef(substrateRef)
    const cur = await this.client.get(ref)
    if (!cur) throw new UnknownTenantError(substrateRef)
    const svc = await this.client.update({
      ...ref,
      image: this.image(targetVersion),
      env: cur.env,
      minInstances: cur.minInstances,
      ...(cur.serviceAccount ? { serviceAccount: cur.serviceAccount } : {})
    })
    return this.handle(ref, targetVersion, svc)
  }

  async setEnv(substrateRef: string, env: Record<string, string>): Promise<HubHandle> {
    const ref = parseRef(substrateRef)
    const cur = await this.client.get(ref)
    if (!cur) throw new UnknownTenantError(substrateRef)
    // Re-apply the substrate env (R2/Litestream) around the caller's new plan env.
    // This is also where short-lived scoped R2 credentials get REFRESHED: every
    // plan change, seat change and dunning flip already travels this path, so
    // rotation rides on traffic that exists rather than a new sweep.
    const tenantId = tenantIdFromEnv(cur.env) ?? ref.service
    const merged = {
      ...env,
      LITESTREAM: '1',
      ...(await this.r2Env(tenantId))
    }
    const svc = await this.client.update({
      ...ref,
      image: cur.image,
      env: merged,
      minInstances: cur.minInstances,
      ...(cur.serviceAccount ? { serviceAccount: cur.serviceAccount } : {})
    })
    return this.handle(ref, tagOf(cur.image), svc)
  }

  async sleep(substrateRef: string): Promise<HubHandle> {
    const ref = parseRef(substrateRef)
    const cur = await this.client.get(ref)
    if (!cur) throw new UnknownTenantError(substrateRef)
    const svc = await this.client.update({
      ...ref,
      image: cur.image,
      env: cur.env,
      minInstances: 0,
      ...(cur.serviceAccount ? { serviceAccount: cur.serviceAccount } : {})
    })
    return { ...this.handle(ref, tagOf(cur.image), svc), state: 'sleeping' }
  }

  /**
   * Delete the tenant's Cloud Run service and free its shard slot.
   *
   * **Scope (verified for 0411 G1):** this removes the *billable compute* and
   * the allocator slot. It deliberately does NOT touch the tenant's R2 replica —
   * under Litestream Model B the SQLite data lives in R2, not on an attached
   * volume, and there is no per-service disk to reclaim.
   *
   * That split is exactly what compensation wants: rolling back a failed
   * provision must stop the meter without ever deleting data. Destroying a
   * tenant *for real* (dunning `deleted`) is a separate step that removes the
   * R2 objects too.
   */
  async destroy(substrateRef: string): Promise<void> {
    const ref = parseRef(substrateRef)
    await this.client.delete(ref)
    this.allocator.release(ref.project, ref.region)
  }

  async get(substrateRef: string): Promise<HubHandle | null> {
    const ref = parseRef(substrateRef)
    const svc = await this.client.get(ref)
    return svc ? this.handle(ref, tagOf(svc.image), svc) : null
  }

  /**
   * Replay the fleet's placements into the shard allocator.
   *
   * Refs that are not this substrate's shape are skipped, not guessed at: a
   * tenant on another substrate must not consume a Cloud Run shard slot.
   */
  rehydrate(substrateRefs: Iterable<string>): void {
    const placements: ShardPlacement[] = []
    for (const ref of substrateRefs) {
      const placement = placementFromSubstrateRef(ref)
      if (placement) placements.push(placement)
    }
    this.allocator.rehydrate(placements)
  }
}

/** In-memory Cloud Run client for dev + tests — models create/update/get/delete. */
export class FakeCloudRunClient implements CloudRunClient {
  private readonly services = new Map<string, CloudRunService>()
  constructor(private readonly baseDomain = 'run.app.local') {}

  private key(ref: CloudRunRef): string {
    return refString(ref)
  }

  async create(args: CloudRunUpsert): Promise<CloudRunService> {
    const svc: CloudRunService = {
      uri: `https://${args.service}-${args.project}.${this.baseDomain}`,
      image: args.image,
      env: { ...args.env },
      minInstances: args.minInstances
    }
    this.services.set(this.key(args), svc)
    return { ...svc, env: { ...svc.env } }
  }

  async update(args: CloudRunUpsert): Promise<CloudRunService> {
    const existing = this.services.get(this.key(args))
    if (!existing) throw new Error(`No such service: ${this.key(args)}`)
    const svc: CloudRunService = {
      uri: existing.uri,
      image: args.image,
      env: { ...args.env },
      minInstances: args.minInstances
    }
    this.services.set(this.key(args), svc)
    return { ...svc, env: { ...svc.env } }
  }

  async get(ref: CloudRunRef): Promise<CloudRunService | null> {
    const svc = this.services.get(this.key(ref))
    return svc ? { ...svc, env: { ...svc.env } } : null
  }

  async delete(ref: CloudRunRef): Promise<void> {
    this.services.delete(this.key(ref))
  }
}
