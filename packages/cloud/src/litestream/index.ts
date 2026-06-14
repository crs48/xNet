/**
 * @xnetjs/cloud/litestream — public API.
 *
 * SQLite → R2 replication for the managed fleet, staying on better-sqlite3
 * (exploration 0178): config + argv builders, a supervised controller for
 * drain-before-close shutdown, and replication-freshness checks.
 */

export {
  litestreamConfig,
  toYaml,
  type LitestreamConfig,
  type LitestreamConfigArgs,
  type LitestreamReplica
} from './config'

export { restoreArgs, replicateArgs, type RestoreOptions, type ReplicateOptions } from './commands'

export {
  LitestreamController,
  type LitestreamControllerOptions,
  type Spawner,
  type SpawnedProcess,
  type DrainResult
} from './controller'

export { replicaLagMs, isReplicaFresh, isFullySynced } from './freshness'
