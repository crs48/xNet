/**
 * @xnetjs/cloud/litestream — config generator.
 *
 * Produces a Litestream config replicating one tenant's SQLite DB to a per-tenant
 * R2 (S3-compatible) path (exploration 0178). Credentials are emitted as env-var
 * references by default so the rendered YAML never embeds secrets — Litestream
 * expands `${...}` from the environment.
 */

export interface LitestreamReplica {
  type: 's3'
  /** S3-compatible endpoint (R2: `https://<acct>.r2.cloudflarestorage.com`). */
  endpoint: string
  bucket: string
  /** Per-tenant object path, e.g. `t/<tenantId>/db`. */
  path: string
  /** Access key (literal or an env ref like `${R2_ACCESS_KEY_ID}`). */
  accessKeyId: string
  secretAccessKey: string
  /** Replication interval; default `1s` (~1s RPO). */
  syncInterval: string
}

export interface LitestreamConfig {
  /**
   * Optional metrics/HTTP bind address (Litestream's top-level `addr`). When set,
   * Litestream serves Prometheus metrics there — the source the hub scrapes for a
   * live `lastSyncMs` (exploration 0288). Bind localhost only so a tenant's
   * replication metrics are never publicly reachable.
   */
  addr?: string
  dbs: Array<{ path: string; replicas: LitestreamReplica[] }>
}

export interface LitestreamConfigArgs {
  /** Local SQLite path, e.g. `/data/hub.db`. */
  dbPath: string
  endpoint: string
  bucket: string
  /** Object path under the bucket; e.g. `t/<tenantId>/db`. */
  path: string
  accessKeyId?: string
  secretAccessKey?: string
  syncInterval?: string
  /** Localhost metrics bind (e.g. `127.0.0.1:9090`); omitted ⇒ no metrics server. */
  metricsAddr?: string
}

/** Build a single-DB → R2 Litestream config (env-ref credentials by default). */
export function litestreamConfig(args: LitestreamConfigArgs): LitestreamConfig {
  if (!args.dbPath || !args.endpoint || !args.bucket || !args.path) {
    throw new Error('litestreamConfig requires dbPath, endpoint, bucket, and path')
  }
  return {
    ...(args.metricsAddr ? { addr: args.metricsAddr } : {}),
    dbs: [
      {
        path: args.dbPath,
        replicas: [
          {
            type: 's3',
            endpoint: args.endpoint,
            bucket: args.bucket,
            path: args.path.replace(/^\/+/, ''),
            accessKeyId: args.accessKeyId ?? '${R2_ACCESS_KEY_ID}',
            secretAccessKey: args.secretAccessKey ?? '${R2_SECRET_ACCESS_KEY}',
            syncInterval: args.syncInterval ?? '1s'
          }
        ]
      }
    ]
  }
}

/** Render a {@link LitestreamConfig} to the YAML Litestream expects. */
export function toYaml(config: LitestreamConfig): string {
  const lines: string[] = []
  // Top-level metrics bind, when configured (localhost only — exploration 0288).
  if (config.addr) lines.push(`addr: ${config.addr}`)
  lines.push('dbs:')
  for (const db of config.dbs) {
    lines.push(`  - path: ${db.path}`)
    lines.push('    replicas:')
    for (const r of db.replicas) {
      lines.push(`      - type: ${r.type}`)
      lines.push(`        endpoint: ${r.endpoint}`)
      lines.push(`        bucket: ${r.bucket}`)
      lines.push(`        path: ${r.path}`)
      lines.push(`        access-key-id: ${r.accessKeyId}`)
      lines.push(`        secret-access-key: ${r.secretAccessKey}`)
      lines.push(`        sync-interval: ${r.syncInterval}`)
    }
  }
  return lines.join('\n') + '\n'
}
