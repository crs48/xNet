/**
 * @xnetjs/cloud-provisioner — project-shard allocator.
 *
 * Cloud Run enforces a hard, un-raisable cap of 1,000 services per project per
 * region (exploration 0175). A managed fleet of dedicated-per-tenant services
 * therefore shards across multiple GCP projects. This allocator hands out the
 * project a new service should land in, rolling to the next shard at the cap.
 */

export interface ShardingConfig {
  /** Project id prefix, e.g. `xnet-hub` → `xnet-hub-0`, `xnet-hub-1`, … */
  projectPrefix: string
  /** Services to place per project before rolling over. Default 800 (headroom under 1000). */
  servicesPerProject?: number
}

const DEFAULT_SERVICES_PER_PROJECT = 800

const perProject = (cfg: ShardingConfig): number =>
  cfg.servicesPerProject ?? DEFAULT_SERVICES_PER_PROJECT

/** Project id for the Nth service ever provisioned (0-based), purely from the index. */
export function projectForServiceIndex(index: number, cfg: ShardingConfig): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid service index: ${index}`)
  }
  const limit = perProject(cfg)
  if (limit < 1) throw new Error(`servicesPerProject must be >= 1, got ${limit}`)
  return `${cfg.projectPrefix}-${Math.floor(index / limit)}`
}

/**
 * Stateful allocator: tracks how many services live in each shard and returns the
 * project the next service should go to, opening a new shard when the current one
 * fills. `release()` lets a destroyed tenant free a slot.
 */
export class ShardAllocator {
  private readonly counts = new Map<string, number>()

  constructor(private readonly cfg: ShardingConfig) {
    if (perProject(cfg) < 1) throw new Error('servicesPerProject must be >= 1')
  }

  /** Pick a project with free capacity (lowest-index shard first), bump its count. */
  allocate(): string {
    const limit = perProject(this.cfg)
    for (let shard = 0; ; shard++) {
      const project = `${this.cfg.projectPrefix}-${shard}`
      const count = this.counts.get(project) ?? 0
      if (count < limit) {
        this.counts.set(project, count + 1)
        return project
      }
    }
  }

  /** Decrement a project's count when a tenant is destroyed (never below 0). */
  release(project: string): void {
    const count = this.counts.get(project) ?? 0
    if (count > 0) this.counts.set(project, count - 1)
  }

  /** Current service count for a project shard (for telemetry/tests). */
  countFor(project: string): number {
    return this.counts.get(project) ?? 0
  }
}
