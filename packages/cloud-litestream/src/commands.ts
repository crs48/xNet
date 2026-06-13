/**
 * @xnetjs/cloud-litestream — argv builders for the Litestream CLI.
 *
 * Pure functions so the exact commands (restore-on-boot, supervised replicate)
 * are unit-testable without the binary (exploration 0178).
 */

export interface RestoreOptions {
  configPath?: string
  /** Skip restore if the local DB already exists (idempotent boot). Default true. */
  ifDbNotExists?: boolean
  /** Skip restore if the replica has no backup yet (first boot). Default true. */
  ifReplicaExists?: boolean
}

/** `litestream restore [-config c] [-if-db-not-exists] [-if-replica-exists] <dbPath>` */
export function restoreArgs(dbPath: string, opts: RestoreOptions = {}): string[] {
  if (!dbPath) throw new Error('restoreArgs requires a dbPath')
  const args = ['restore']
  if (opts.configPath) args.push('-config', opts.configPath)
  if (opts.ifDbNotExists ?? true) args.push('-if-db-not-exists')
  if (opts.ifReplicaExists ?? true) args.push('-if-replica-exists')
  args.push(dbPath)
  return args
}

export interface ReplicateOptions {
  configPath?: string
  /** When set, Litestream supervises this command (`-exec`) — the entrypoint pattern. */
  exec?: string
}

/** `litestream replicate [-config c] [-exec "cmd"]` */
export function replicateArgs(opts: ReplicateOptions = {}): string[] {
  const args = ['replicate']
  if (opts.configPath) args.push('-config', opts.configPath)
  if (opts.exec) args.push('-exec', opts.exec)
  return args
}
