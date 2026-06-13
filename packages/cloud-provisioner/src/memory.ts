/**
 * @xnetjs/cloud-provisioner — in-memory provisioner.
 *
 * A fully-working fake used by `apps/cloud` in local/dev mode and by tests. It
 * exercises the entire control-plane flow (provision → flip → upgrade → sleep →
 * destroy) without touching any cloud API, and models project sharding so the
 * sharding logic is tested end-to-end.
 */

import { ShardAllocator, type ShardingConfig } from './sharding'
import { UnknownTenantError, type HubHandle, type ProvisionSpec, type Provisioner } from './types'

export interface MemoryProvisionerOptions {
  /** Sharding config; defaults to a small per-project cap so tests can roll over. */
  sharding?: ShardingConfig
  /** Base domain for the fake hub URLs. Default `hub.local`. */
  baseDomain?: string
}

interface Entry {
  handle: HubHandle
  project: string
}

export class MemoryProvisioner implements Provisioner {
  readonly substrate = 'memory'
  private readonly entries = new Map<string, Entry>()
  private readonly allocator: ShardAllocator
  private readonly baseDomain: string

  constructor(options: MemoryProvisionerOptions = {}) {
    this.allocator = new ShardAllocator(
      options.sharding ?? { projectPrefix: 'xnet-hub-dev', servicesPerProject: 800 }
    )
    this.baseDomain = options.baseDomain ?? 'hub.local'
  }

  async provision(spec: ProvisionSpec): Promise<HubHandle> {
    const project = this.allocator.allocate()
    const region = spec.region ?? spec.entitlements.residency ?? 'local'
    const substrateRef = `memory://${project}/${spec.tenantId}`
    const handle: HubHandle = {
      tenantId: spec.tenantId,
      hubUrl: `https://${spec.tenantId}.${this.baseDomain}`,
      substrateRef,
      region,
      targetVersion: spec.targetVersion,
      state: 'running'
    }
    this.entries.set(substrateRef, { handle, project })
    return { ...handle }
  }

  async upgrade(substrateRef: string, targetVersion: string): Promise<HubHandle> {
    const entry = this.require(substrateRef)
    entry.handle = { ...entry.handle, targetVersion, state: 'running' }
    return { ...entry.handle }
  }

  async setEnv(substrateRef: string, _env: Record<string, string>): Promise<HubHandle> {
    // An env flip never moves data and keeps the hub running.
    const entry = this.require(substrateRef)
    entry.handle = { ...entry.handle, state: 'running' }
    return { ...entry.handle }
  }

  async sleep(substrateRef: string): Promise<HubHandle> {
    const entry = this.require(substrateRef)
    entry.handle = { ...entry.handle, state: 'sleeping' }
    return { ...entry.handle }
  }

  async destroy(substrateRef: string): Promise<void> {
    const entry = this.entries.get(substrateRef)
    if (!entry) return
    this.allocator.release(entry.project)
    this.entries.delete(substrateRef)
  }

  async get(substrateRef: string): Promise<HubHandle | null> {
    const entry = this.entries.get(substrateRef)
    return entry ? { ...entry.handle } : null
  }

  private require(substrateRef: string): Entry {
    const entry = this.entries.get(substrateRef)
    if (!entry) throw new UnknownTenantError(substrateRef)
    return entry
  }
}
