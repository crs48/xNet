/**
 * @xnetjs/cloud/provisioner — Cloud Run + Litestream→R2 adapter (skeleton).
 *
 * The managed substrate xNet Cloud targets (explorations 0175 + 0178): GCP Cloud
 * Run for scale-to-zero compute, `better-sqlite3` with **Litestream** streaming the
 * WAL to Cloudflare R2 for durability + cold storage (NO libSQL/Turso — that
 * migration was rejected in 0178), and R2 for blobs. Provisioned via the Pulumi
 * Automation API. The lifecycle methods here are intentionally unbuilt — they throw
 * `NotImplementedError` — so the interface, config surface, and project sharding can
 * land and be reviewed before we wire real cloud credentials. Tracked under
 * exploration 0180's implementation checklist.
 */

import { ShardAllocator } from '../sharding'
import { NotImplementedError, type HubHandle, type ProvisionSpec, type Provisioner } from '../types'

export interface CloudRunLitestreamConfig {
  /** GCP project prefix for sharded projects (Cloud Run 1,000-svc/project cap). */
  projectPrefix: string
  /** GCP region for Cloud Run services (e.g. `us-central1`). */
  region: string
  /** Container image repository, e.g. `us-docker.pkg.dev/xnet/hub`. */
  imageRepository: string
  /** Cloudflare R2 bucket holding per-tenant blob prefixes + SQLite WAL replicas. */
  r2Bucket: string
}

export class CloudRunLitestreamProvisioner implements Provisioner {
  readonly substrate = 'cloud-run-litestream'
  // Sharding is real and shared with the in-memory provisioner; only the cloud
  // calls are pending. The allocator is held so the wiring slots in directly.
  protected readonly allocator: ShardAllocator

  constructor(protected readonly config: CloudRunLitestreamConfig) {
    this.allocator = new ShardAllocator({ projectPrefix: config.projectPrefix })
  }

  async provision(_spec: ProvisionSpec): Promise<HubHandle> {
    // TODO(0180): Pulumi Automation API — create the R2 prefix + a Cloud Run service
    // (image @ targetVersion, env LITESTREAM=1/R2_*/HUB_PLAN, and LITESTREAM_RESTORE
    // = spec.restoreFromR2 when reactivating a cold tenant) in the project returned
    // by this.allocator.allocate().
    throw new NotImplementedError(this.substrate, 'provision')
  }

  async upgrade(_substrateRef: string, _targetVersion: string): Promise<HubHandle> {
    throw new NotImplementedError(this.substrate, 'upgrade')
  }

  async setEnv(_substrateRef: string, _env: Record<string, string>): Promise<HubHandle> {
    throw new NotImplementedError(this.substrate, 'setEnv')
  }

  async sleep(_substrateRef: string): Promise<HubHandle> {
    // Cloud Run scales to zero natively (min-instances=0); this is a no-op flag flip.
    throw new NotImplementedError(this.substrate, 'sleep')
  }

  async destroy(_substrateRef: string): Promise<void> {
    throw new NotImplementedError(this.substrate, 'destroy')
  }

  async get(_substrateRef: string): Promise<HubHandle | null> {
    throw new NotImplementedError(this.substrate, 'get')
  }
}
