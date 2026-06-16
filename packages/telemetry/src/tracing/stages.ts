/**
 * Canonical stage names shared across the read and write hot paths.
 *
 * These are static, low-cardinality constants — safe to use directly as hub
 * metric names. Keep them stable: they become the keys of fleet-wide rollups.
 */

export const QUERY_STAGES = {
  descriptorBuild: 'data.query.descriptor',
  bridgeDispatch: 'data.query.bridge',
  rpcIn: 'data.query.rpc.in',
  sqliteExec: 'data.query.sqlite',
  hydrate: 'data.query.hydrate',
  authFilter: 'data.query.auth',
  rpcOut: 'data.query.rpc.out',
  flatten: 'data.query.flatten',
  commit: 'data.query.commit',
  total: 'data.query.total'
} as const

export const MUTATE_STAGES = {
  bridgeDispatch: 'data.mutate.bridge',
  authorize: 'data.mutate.authorize',
  clock: 'data.mutate.clock',
  encrypt: 'data.mutate.encrypt',
  persist: 'data.mutate.persist',
  emit: 'data.mutate.emit',
  enqueue: 'data.mutate.enqueue',
  sync: 'data.mutate.sync',
  total: 'data.mutate.total'
} as const

export type QueryStage = (typeof QUERY_STAGES)[keyof typeof QUERY_STAGES]
export type MutateStage = (typeof MUTATE_STAGES)[keyof typeof MUTATE_STAGES]
