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

import { ShardAllocator } from '../sharding'
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
  /** R2 access key id (injected into each hub's env for Litestream). */
  r2AccessKeyId: string
  /** R2 secret access key. */
  r2SecretAccessKey: string
  /** Override the sharding cap (default 800, headroom under the 1,000 hard cap). */
  servicesPerProject?: number
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
}

/** Observed state of a service. */
export interface CloudRunService {
  uri: string
  image: string
  env: Record<string, string>
  minInstances: number
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

  /** Env every managed hub gets: the caller's plan env + Litestream/R2 wiring. */
  private hubEnv(spec: ProvisionSpec): Record<string, string> {
    return {
      ...spec.env,
      LITESTREAM: '1',
      // Per-tenant replica path the hub entrypoint renders into its Litestream
      // config. Stable across (re)provisions so a reactivated hub restores from
      // the same R2 prefix. (exploration 0178/0205.)
      LITESTREAM_PATH: `t/${spec.tenantId}/db`,
      R2_BUCKET: this.config.r2Bucket,
      R2_ENDPOINT: this.config.r2Endpoint,
      R2_ACCESS_KEY_ID: this.config.r2AccessKeyId,
      R2_SECRET_ACCESS_KEY: this.config.r2SecretAccessKey,
      ...(spec.restoreFromR2 ? { LITESTREAM_RESTORE: spec.restoreFromR2 } : {})
    }
  }

  private minInstances(spec: ProvisionSpec): number {
    // Always-warm tier keeps one instance hot; everyone else scales to zero.
    return spec.entitlements.isolation === 'dedicated-warm' ? 1 : 0
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
    const project = this.allocator.allocate()
    const region = spec.region ?? this.config.region
    const ref: CloudRunRef = { project, region, service: serviceIdForTenant(spec.tenantId) }
    const svc = await this.client.create({
      ...ref,
      image: this.image(spec.targetVersion),
      env: this.hubEnv(spec),
      minInstances: this.minInstances(spec)
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
      minInstances: cur.minInstances
    })
    return this.handle(ref, targetVersion, svc)
  }

  async setEnv(substrateRef: string, env: Record<string, string>): Promise<HubHandle> {
    const ref = parseRef(substrateRef)
    const cur = await this.client.get(ref)
    if (!cur) throw new UnknownTenantError(substrateRef)
    // Re-apply the substrate env (R2/Litestream) around the caller's new plan env.
    const merged = {
      ...env,
      LITESTREAM: '1',
      R2_BUCKET: this.config.r2Bucket,
      R2_ENDPOINT: this.config.r2Endpoint,
      R2_ACCESS_KEY_ID: this.config.r2AccessKeyId,
      R2_SECRET_ACCESS_KEY: this.config.r2SecretAccessKey
    }
    const svc = await this.client.update({
      ...ref,
      image: cur.image,
      env: merged,
      minInstances: cur.minInstances
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
      minInstances: 0
    })
    return { ...this.handle(ref, tagOf(cur.image), svc), state: 'sleeping' }
  }

  async destroy(substrateRef: string): Promise<void> {
    const ref = parseRef(substrateRef)
    await this.client.delete(ref)
    this.allocator.release(ref.project)
  }

  async get(substrateRef: string): Promise<HubHandle | null> {
    const ref = parseRef(substrateRef)
    const svc = await this.client.get(ref)
    return svc ? this.handle(ref, tagOf(svc.image), svc) : null
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
