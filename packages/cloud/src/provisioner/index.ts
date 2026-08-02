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

export {
  ShardAllocator,
  placementFromSubstrateRef,
  projectForServiceIndex,
  type ShardingConfig,
  type ShardPlacement
} from './sharding'

export { tenantReplicaKey, tenantStoragePrefix } from './storage-prefix'

export { MemoryProvisioner, type MemoryProvisionerOptions } from './memory'

export {
  CloudRunLitestreamProvisioner,
  FakeCloudRunClient,
  serviceIdForTenant,
  type CloudRunLitestreamConfig,
  type CloudRunClient,
  type CloudRunRef,
  tenantIdFromEnv,
  type CloudRunUpsert,
  type CloudRunService,
  type TenantR2Credentials
} from './adapters/cloud-run-litestream'

export {
  FargateLitestreamProvisioner,
  type FargateLitestreamConfig
} from './adapters/fargate-litestream'
