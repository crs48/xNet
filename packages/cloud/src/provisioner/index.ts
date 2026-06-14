/**
 * @xnetjs/cloud/provisioner — public API.
 *
 * Substrate-agnostic per-tenant hub provisioning for xNet Cloud. The control plane
 * is written once against {@link Provisioner}; adapters target different substrates
 * (exploration 0175). `MemoryProvisioner` is a working fake for dev/tests.
 */

export {
  NotImplementedError,
  UnknownTenantError,
  type Provisioner,
  type ProvisionSpec,
  type HubHandle,
  type HubState
} from './types'

export { ShardAllocator, projectForServiceIndex, type ShardingConfig } from './sharding'

export { MemoryProvisioner, type MemoryProvisionerOptions } from './memory'

export { CloudRunTursoProvisioner, type CloudRunTursoConfig } from './adapters/cloud-run-turso'

export {
  FargateLitestreamProvisioner,
  type FargateLitestreamConfig
} from './adapters/fargate-litestream'
